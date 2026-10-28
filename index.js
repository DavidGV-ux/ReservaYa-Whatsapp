// index.js - ADAPTADO PARA AWS LAMBDA (SIN COLAS, CON CACHÉ)
/**
 * index.js — Servidor principal de FYN (WhatsApp Chatbot).
 *
 * Flujo alto nivel:
 *   1) POST /webhook  → llega el mensaje de WhatsApp, se valida firma (X-Hub-Signature-256),
 *      se procesa onboarding/actualizaciones de perfil, se extrae transacción/Info con IA
 *      (openaiService) y se responde por WhatsApp. El guard de response es asíncrono.
 *   2) Endpoints propios del frontend: /auth/*, /user/* (dashboard consolidado, historial,
 *      licencias), /chat/demo, /admin/*, /health, /metrics.
 *
 * Seguridad (verificado por tests en tests/security-verification.js):
 *   • CORS por middleware (NO en API Gateway): origen desconocido → sin ACAO.
 *   • Webhook: firma HMAC de Meta. ⚠️ FAIL-OPEN transicional si WHATSAPP_APP_SECRET está vacío.
 *   • /user/*: JWT HS256 offline (SUPABASE_JWT_SECRET). Fail-closed sin secret.
 *   • requireOwnData: 403 si el token pide datos de OTRO teléfono (no hay devolución masiva).
 *   • /admin/*: ADMIN_SECRET (fail-closed).
 *
 * Nota de despliegue: corre en Lambda con el mismo bundle para los 8 functions
 * (api + 7 crons); ver serverless.yml.
 */
const express = require("express");
const config = require("./config");
const whatsappService = require("./Services/whatsappService");
const openaiService = require("./Services/openaiService");
const supabaseService = require("./Services/supabaseService");
const makeService = require("./Services/makeService");
const subscriptionService = require("./Services/subscriptionService");
const userProfileService = require("./Services/userProfileService");
const metricsService = require("./Services/metricsService");
const referralService = require("./Services/referralService");
const budgetAlertService = require("./Services/budgetAlertService");
const Utils = require("./utils");

const app = express();
app.set('trust proxy', 1);

// ⚠️ CRÍTICO: Importar ANTES de definir rutas
const dailyTipsService = require("./Services/dailyTipsService");
const monthlyFeedbackService = require("./Services/monthlyFeedbackService");

// Cargar cacheService si está habilitado
let cacheService = null;
if (config.redis.enabled) {
  try {
    cacheService = require("./Services/cacheService");
    console.log("✅ Servicio de caché Redis cargado");
  } catch (error) {
    console.warn("⚠️ Caché no disponible:", error.message);
  }
}

// CORS Configuration
// Solo los orígenes permitidos leen respuestas del API. Para orígenes desconocidos
// NO enviamos Access-Control-Allow-Origin (el navegador bloquea la lectura).
const corsAllowedOrigins = config.cors.allowedOrigins || [];

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && corsAllowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Vary', 'Origin');

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Manejar preflight requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

// Middleware
// Guardar el body crudo para poder verificar la firma X-Hub-Signature-256 de WhatsApp
const rawBodySaver = (req, res, buf) => { req.rawBody = buf; };
app.use(express.json({ limit: "10mb", verify: rawBodySaver }));
app.use(express.urlencoded({ extended: true, verify: rawBodySaver }));

// 🔐 Rate limiting por IP para endpoints públicos que pueden abusarse
// (generan costos de IA, manipulan suscripciones o exponen datos).
const limiterChatDemo = Utils.createRateLimiter({ windowMs: 60 * 1000, max: 10 });
const limiterSubscription = Utils.createRateLimiter({ windowMs: 60 * 1000, max: 20 });
const limiterProfileUpdate = Utils.createRateLimiter({ windowMs: 60 * 1000, max: 30 });

// Verificación del webhook (GET)
app.get("/webhook", (req, res) => {
  console.log("🔍 GET /webhook - Verificación recibida");
  
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && Utils.safeEqual(token, config.whatsapp.verifyToken)) {
      console.log("✅ VERIFICACIÓN EXITOSA");
      return res.status(200).send(challenge);
    } else {
      console.log("❌ Token no coincide");
      return res.sendStatus(403);
    }
  }
  return res.sendStatus(400);
});

// Recibir mensajes de WhatsApp (POST)
app.post("/webhook", async (req, res) => {
  const trackingId = Utils.generateTrackingId();

  try {
    // 🔐 VALIDACIÓN DE FIRMA: rechazar webhooks sin firma válida de Meta.
    // Previene que terceros simulen mensajes, envíen mensajes a números arbitrarios
    // o gasten créditos de IA.
    const signature = req.headers['x-hub-signature-256'];
    if (!Utils.verifyWhatsAppSignature(req.rawBody, signature, config.whatsapp.appSecret)) {
      Utils.log("warn", `[${trackingId}] ⛔ Firma de webhook inválida o faltante`);
      return res.sendStatus(403);
    }

    const body = req.body;

    Utils.log("info", `[${trackingId}] Webhook recibido`, {
      object: body.object,
      hasEntry: !!body.entry,
    });

    if (body.object === "whatsapp_business_account") {
      const validation = Utils.validateWhatsAppMessage(body);
      if (!validation.valid) {
        Utils.log("warn", `[${trackingId}] Mensaje inválido: ${validation.error}`);
        return res.sendStatus(200);
      }

      const messageInfo = Utils.extractMessageInfo(body);
      const { from, messageBody, userName, messageType, imageInfo } = messageInfo;

      Utils.log("info", `[${trackingId}] Mensaje de ${userName} (${from})`, {
        messageType,
        messageLength: messageBody?.length || 0,
        hasImage: !!imageInfo,
      });

      if (Utils.isUserBlocked(from)) {
        Utils.log("warn", `[${trackingId}] Usuario bloqueado: ${from}`);
        return res.sendStatus(200);
      }

      // Procesar mensajes de imagen
      if (messageType === "image" && imageInfo) {
        // NO responder inmediatamente - procesar primero para que Lambda no termine
        try {
          await procesarImagen(
            from,
            imageInfo,
            userName,
            trackingId,
            messageInfo.messageId
          );
          // Responder después de procesar
          res.sendStatus(200);
        } catch (error) {
          Utils.handleError(error, `[${trackingId}] Error procesando imagen`);
          try {
            await whatsappService.sendMessage(
              from,
              "Lo siento, hubo un problema analizando tu imagen. Por favor intenta de nuevo."
            );
          } catch (sendError) {
            Utils.handleError(sendError, `[${trackingId}] Error enviando mensaje de error`);
          }
          // Responder incluso si hay error para que WhatsApp no reintente
          res.sendStatus(200);
        }
        return;
      }

      // Procesar mensajes de texto
      if (messageType === "text" && Utils.isValidMessage(messageBody)) {
        const sanitizedMessage = Utils.sanitizeTextForAI(messageBody);
        const messageId = messageInfo.messageId || null;

        await procesarMensajeSincrono(
          from,
          sanitizedMessage,
          userName,
          messageBody,
          trackingId,
          messageId
        );
        
        res.sendStatus(200);
      } else {
        res.sendStatus(200);

        if (messageType !== "text" && messageType !== "image") {
          try {
            await whatsappService.sendMessage(
              from,
              "Actualmente puedo procesar mensajes de texto e imágenes. ¡Escríbeme tu consulta o envíame una imagen!"
            );
          } catch (error) {
            Utils.handleError(error, `[${trackingId}] Mensaje no soportado`);
          }
        }
      }
    } else {
      res.sendStatus(200);
    }
  } catch (error) {
    Utils.handleError(error, `[${trackingId}] Webhook general`);
    res.sendStatus(500);
  }
});

// Funciones de estudio inicial del cliente
function needsClientStudy(userProfile) {
  if (!userProfile) return true;
  
  // Verificar si tiene todos los datos del estudio
  const hasName = !!userProfile.user_name;
  const hasSalary = !!userProfile.monthly_salary;
  const hasCurrency = !!userProfile.currency;
  const hasFixedExpenses = userProfile.fixed_expenses !== null && userProfile.fixed_expenses !== undefined;
  const hasCountry = !!userProfile.country;
  
  // Si falta alguno, necesita el estudio
  return !hasName || !hasSalary || !hasCurrency || !hasFixedExpenses || !hasCountry;
}

// Verificar si es el primer mensaje del usuario (no tiene conversaciones previas)
async function isFirstMessage(userPhone) {
  try {
    const conversations = await supabaseService.getConversationHistory(userPhone, 1);
    return conversations.length === 0; // Si no tiene conversaciones, es el primer mensaje
  } catch (error) {
    Utils.handleError(error, 'Error verificando primer mensaje');
    return false; // En caso de error, asumir que no es el primero
  }
}

async function handleClientStudy(from, messageBody, userProfile, trackingId) {
  try {
    // Normalizar número de teléfono para operaciones de BD
    let normalizedFrom;
    try {
      normalizedFrom = supabaseService.validatePhoneNumber(from);
    } catch (phoneError) {
      normalizedFrom = from.replace(/[^0-9]/g, '');
    }

    // CRÍTICO: Si ya tiene el estudio completo, NO hacer nada
    if (!needsClientStudy(userProfile)) {
      Utils.log("info", `[${trackingId}] Usuario ya tiene estudio completo en BD, saltando`);
      return false; // Estudio completo, continuar con flujo normal
    }

    Utils.log("info", `[${trackingId}] PRIMER MENSAJE - Usuario necesita estudio inicial`);
    Utils.log("info", `[${trackingId}] Estado actual del perfil:`, {
      hasName: !!userProfile?.user_name,
      hasSalary: !!userProfile?.monthly_salary,
      hasCurrency: !!userProfile?.currency,
      hasExpenses: userProfile?.fixed_expenses !== undefined && userProfile?.fixed_expenses !== null,
      hasCountry: !!userProfile?.country
    });
    Utils.log("info", `[${trackingId}] Mensaje recibido: ${messageBody.substring(0, 200)}`);
    
    // En el primer mensaje, intentar extraer información automáticamente
    // Si no se puede extraer, pedir el formulario
    let extractedInfo = {};
    try {
      extractedInfo = await openaiService.extractUserInfo(messageBody);
      Utils.log("info", `[${trackingId}] Información extraída del primer mensaje:`, extractedInfo);
    } catch (extractError) {
      Utils.handleError(extractError, `[${trackingId}] Error extrayendo información con OpenAI`);
      // Fallback a parsing manual
      extractedInfo = openaiService.parseUserInfoManually(messageBody);
      Utils.log("info", `[${trackingId}] Información extraída manualmente:`, extractedInfo);
    }
    
    // Combinar información extraída con perfil existente
    const mergedProfile = { ...userProfile, ...extractedInfo };
    
    // Verificar si tiene todos los datos necesarios
    const hasAllData = mergedProfile.user_name && 
                       mergedProfile.monthly_salary && 
                       mergedProfile.currency && 
                       mergedProfile.fixed_expenses !== undefined && 
                       mergedProfile.country;
    
    Utils.log("info", `[${trackingId}] Datos completos después de extracción: ${hasAllData}`, {
      hasName: !!mergedProfile.user_name,
      hasSalary: !!mergedProfile.monthly_salary,
      hasCurrency: !!mergedProfile.currency,
      hasExpenses: mergedProfile.fixed_expenses !== undefined,
      hasCountry: !!mergedProfile.country
    });
    
    if (!hasAllData) {
      // No se pudo extraer toda la información, pedir formulario
      const studyMessage = `¡Hola! 👋 Para poder ayudarte mejor con tus finanzas, necesito conocer algunos datos básicos.\n\nPor favor, comparte la siguiente información en un solo mensaje:\n\n📝 Nombre completo\n💰 Ingreso mensual\n💱 Moneda (MXN, USD, EUR, etc.)\n💵 Gastos fijos mensuales\n🌍 País\n\n📋 Ejemplo:\n\nNombre: Juan Pérez García\nIngreso: 15000\nMoneda: MXN\nGastos fijos: 8000\nPaís: México\n\n¡Gracias! 😊`;
      await whatsappService.sendMessage(from, studyMessage);
      return true; // Esperando respuesta del estudio
    }
    
    if (hasAllData) {
      try {
        Utils.log("info", `[${trackingId}] Guardando información del estudio en BD`, {
          user_name: mergedProfile.user_name,
          has_salary: !!mergedProfile.monthly_salary,
          currency: mergedProfile.currency,
          has_fixed_expenses: mergedProfile.fixed_expenses !== undefined,
          country: mergedProfile.country,
          language: mergedProfile.language || 'es'
        });
        
        // Validar y convertir tipos antes de guardar
        const monthlySalary = parseFloat(mergedProfile.monthly_salary);
        const fixedExpenses = parseFloat(mergedProfile.fixed_expenses);
        
        if (isNaN(monthlySalary) || monthlySalary <= 0) {
          throw new Error(`Ingreso mensual inválido: ${mergedProfile.monthly_salary}`);
        }
        
        if (isNaN(fixedExpenses) || fixedExpenses < 0) {
          throw new Error(`Gastos fijos inválidos: ${mergedProfile.fixed_expenses}`);
        }
        
        const dataToSave = {
          user_name: String(mergedProfile.user_name).trim(),
          monthly_salary: monthlySalary,
          currency: String(mergedProfile.currency).trim().toUpperCase(),
          fixed_expenses: fixedExpenses,
          country: String(mergedProfile.country).trim(),
          language: String(mergedProfile.language || 'es').trim()
        };
        
        Utils.log("info", `[${trackingId}] Datos validados para guardar (montos NO registrados en log)`, {
          user_name_length: dataToSave.user_name.length,
          currency: dataToSave.currency,
          country: dataToSave.country,
          language: dataToSave.language
        });
        
        // Guardar toda la información del estudio
        await supabaseService.updateUserProfile(normalizedFrom, dataToSave);
        
        Utils.log("info", `[${trackingId}] Información guardada exitosamente`);
        
        if (cacheService) {
          await cacheService.invalidateUserCache(normalizedFrom);
        }
        
        // Mensaje de confirmación según idioma
        const lang = dataToSave.language;
        const confirmationMessage = lang === 'es'
          ? `¡Perfecto! ✅ He registrado tu información:\n\n📝 Nombre: ${dataToSave.user_name}\n💰 Ingreso mensual: ${dataToSave.currency} ${dataToSave.monthly_salary.toLocaleString('es')}\n💵 Gastos fijos: ${dataToSave.currency} ${dataToSave.fixed_expenses.toLocaleString('es')}\n🌍 País: ${dataToSave.country}\n\n¡Ahora puedo ayudarte mejor con tus finanzas! 💪`
          : `Perfect! ✅ I've registered your information:\n\n📝 Name: ${dataToSave.user_name}\n💰 Monthly income: ${dataToSave.currency} ${dataToSave.monthly_salary.toLocaleString('en')}\n💵 Fixed expenses: ${dataToSave.currency} ${dataToSave.fixed_expenses.toLocaleString('en')}\n🌍 Country: ${dataToSave.country}\n\nNow I can help you better with your finances! 💪`;
        
        await whatsappService.sendMessage(from, confirmationMessage);
        return false; // Estudio completo
      } catch (saveError) {
        // Log detallado del error
        Utils.handleError(saveError, `[${trackingId}] Error guardando información del estudio`);
        
        // Si falla al guardar, pedir de nuevo con mensaje más específico
        const lang = mergedProfile.language || 'es';
        const userErrorMessage = lang === 'es'
          ? `Hubo un problema guardando tu información. Por favor, intenta enviarla de nuevo en este formato:\n\nNombre: [Tu nombre]\nIngreso: [Tu ingreso]\nMoneda: [MXN, USD, COP, etc.]\nGastos fijos: [Tus gastos fijos]\nPaís: [Tu país]`
          : `There was a problem saving your information. Please try sending it again in this format:\n\nName: [Your name]\nIncome: [Your income]\nCurrency: [MXN, USD, COP, etc.]\nFixed expenses: [Your fixed expenses]\nCountry: [Your country]`;
        
        // Si es error de columna faltante, dar instrucción específica
        if (saveError.message && saveError.message.includes('column') && saveError.message.includes('does not exist')) {
          userErrorMessage = `Parece que hay un problema con la configuración. Por favor contacta al administrador.`;
        }
        
        try {
          await whatsappService.sendMessage(from, userErrorMessage);
        } catch (sendError) {
          Utils.handleError(sendError, `[${trackingId}] Error enviando mensaje de error`);
        }
        return true; // Seguir esperando respuesta
      }
    } else {
      // Enviar formulario de estudio
      const studyMessage = `¡Hola! 👋 Para poder ayudarte mejor con tus finanzas, necesito conocer algunos datos básicos.\n\nPor favor, comparte la siguiente información en un solo mensaje:\n\n📝 Nombre completo\n💰 Ingreso mensual\n💱 Moneda (MXN, USD, EUR, etc.)\n💵 Gastos fijos mensuales\n🌍 País\n\n📋 Ejemplo:\n\nNombre: Juan Pérez García\nIngreso: 15000\nMoneda: MXN\nGastos fijos: 8000\nPaís: México\n\n¡Gracias! 😊`;
      
      await whatsappService.sendMessage(from, studyMessage);
      return true; // Esperando respuesta del estudio
    }
  } catch (error) {
    Utils.handleError(error, `[${trackingId}] Error en estudio del cliente`);
    return false; // Continuar con flujo normal si hay error
  }
}

// Funciones de onboarding - SOLO PARA USUARIOS NUEVOS (sin idioma)
function detectLanguageFromMessage(message) {
  const msgLower = message.toLowerCase().trim();
  
  // Mapeo de palabras comunes a códigos de idioma
  const languageMap = {
    'es': ['español', 'spanish', 'espanol', 'espa', 'es'],
    'en': ['inglés', 'english', 'ingles', 'eng', 'en', 'ingl'],
    'pt': ['portugués', 'portuguese', 'portugues', 'português', 'port', 'pt'],
    'fr': ['francés', 'french', 'frances', 'français', 'fr'],
    'it': ['italiano', 'italian', 'it'],
    'de': ['alemán', 'german', 'aleman', 'deutsch', 'de']
  };
  
  for (const [code, keywords] of Object.entries(languageMap)) {
    if (keywords.some(keyword => msgLower.includes(keyword))) {
      return code;
    }
  }
  
  return null;
}

async function handleOnboarding(from, messageBody, userProfile, trackingId) {
  try {
    // Normalizar número de teléfono para operaciones de BD
    let normalizedFrom;
    try {
      normalizedFrom = supabaseService.validatePhoneNumber(from);
    } catch (phoneError) {
      normalizedFrom = from.replace(/[^0-9]/g, '');
    }

    // Solo preguntar por idioma si NO lo tiene
    if (!userProfile?.language) {
      Utils.log("info", `[${trackingId}] Usuario nuevo - detectando idioma`);
      
      // Intentar detectar idioma del mensaje directamente
      let detectedLanguage = detectLanguageFromMessage(messageBody);
      
      // Si no se detectó, intentar con OpenAI
      if (!detectedLanguage) {
        const extractedInfo = await openaiService.extractUserInfo(messageBody);
        detectedLanguage = extractedInfo.language;
      }
      
      if (detectedLanguage) {
        // Idioma detectado, guardarlo silenciosamente
        await supabaseService.updateUserProfile(normalizedFrom, { language: detectedLanguage });
        userProfile.language = detectedLanguage;
        
        if (cacheService) {
          await cacheService.invalidateUserCache(normalizedFrom);
        }
        
        Utils.log("info", `[${trackingId}] Idioma detectado y guardado: ${detectedLanguage}`);
        return false; // Onboarding completo, continuar con flujo normal
      } else {
        // No se detectó idioma, preguntar SOLO UNA VEZ
        const welcomeMessage = `¡Hola! 👋 Para comenzar, necesito saber en qué idioma prefieres comunicarte.\n\nHello! 👋 To get started, I need to know what language you prefer.\n\nOlá! 👋 Para começar, preciso saber em que idioma você prefere se comunicar.\n\n¿Qué idioma hablas? / What language do you speak? / Que idioma você fala?`;
        await whatsappService.sendMessage(from, welcomeMessage);
        return true; // En onboarding - esperar respuesta
      }
    }

    return false; // Onboarding completo
  } catch (error) {
    Utils.handleError(error, `[${trackingId}] Error en onboarding`);
    return false; // Continuar con flujo normal si hay error
  }
}

// Cache para prevenir procesamiento duplicado de mensajes
const processedMessages = new Map();
const MAX_CACHE_SIZE = 1000;
const CACHE_TTL = 60 * 1000; // 1 minuto

function isMessageAlreadyProcessed(messageId, from) {
  const key = `${from}-${messageId}`;
  if (processedMessages.has(key)) {
    return true;
  }
  
  // Limpiar cache si es muy grande
  if (processedMessages.size > MAX_CACHE_SIZE) {
    const firstKey = processedMessages.keys().next().value;
    processedMessages.delete(firstKey);
  }
  
  // Agregar mensaje al cache con TTL
  processedMessages.set(key, Date.now());
  
  // Limpiar entradas antiguas periódicamente
  setTimeout(() => {
    processedMessages.delete(key);
  }, CACHE_TTL);
  
  return false;
}

// Función para procesar imágenes
async function procesarImagen(from, imageInfo, userName, trackingId, messageId = null) {
  try {
    // ⚠️ NORMALIZAR NÚMERO DE TELÉFONO PRIMERO (crítico para comparaciones)
    let normalizedFrom;
    try {
      normalizedFrom = supabaseService.validatePhoneNumber(from);
      Utils.log("info", `[${trackingId}] 📞 Número normalizado (imagen): "${from}" → "${normalizedFrom}"`);
    } catch (phoneError) {
      Utils.log("error", `[${trackingId}] Error normalizando número de teléfono: ${phoneError.message}`);
      normalizedFrom = from.replace(/[^0-9]/g, '');
      Utils.log("warn", `[${trackingId}] Usando número limpio manualmente: "${normalizedFrom}"`);
    }

    // Verificar si la imagen ya fue procesada
    if (messageId && isMessageAlreadyProcessed(messageId, normalizedFrom)) {
      Utils.log("warn", `[${trackingId}] Imagen ya procesada, ignorando: ${messageId}`);
      return;
    }

    Utils.log("info", `[${trackingId}] Procesando imagen`, {
      imageId: imageInfo?.imageId,
      mimeType: imageInfo?.mimeType,
      hasCaption: !!imageInfo?.caption
    });

    // Validar que imageInfo tenga imageId
    if (!imageInfo || !imageInfo.imageId) {
      throw new Error(`Información de imagen inválida: ${JSON.stringify(imageInfo)}`);
    }

    // ⚠️ VERIFICAR SUSCRIPCIÓN ANTES DE PROCESAR IMAGEN
    Utils.log("info", `[${trackingId}] 🔍 Verificando suscripción para imagen: ${normalizedFrom}`);
    const subscriptionStatus = await subscriptionService.isSubscriptionActive(normalizedFrom);
    
    if (!subscriptionStatus.isActive) {
      Utils.log("warn", `[${trackingId}] ⛔ SUSCRIPCIÓN INACTIVA - Usuario ${normalizedFrom}. NO procesando imagen.`);
      const expirationMessage = subscriptionStatus.message;
      if (expirationMessage) {
        try {
          await whatsappService.sendMessage(from, expirationMessage);
          Utils.log("info", `[${trackingId}] ✅ Mensaje de expiración enviado (imagen no procesada)`);
        } catch (sendError) {
          Utils.handleError(sendError, `[${trackingId}] Error enviando mensaje de suscripción expirada`);
        }
      }
      return; // NO procesar imagen si suscripción inactiva
    }

    // Obtener perfil del usuario
    let userProfile = null;
    
    try {
      if (cacheService) {
        userProfile = await cacheService.getUserProfile(normalizedFrom);
        Utils.log("info", `[${trackingId}] Perfil obtenido del caché: ${!!userProfile}`);
      }
    } catch (cacheError) {
      Utils.log("warn", `[${trackingId}] Error obteniendo perfil del caché:`, cacheError.message);
    }
    
    if (!userProfile) {
      Utils.log("info", `[${trackingId}] Obteniendo perfil de Supabase`);
      try {
        userProfile = await supabaseService.getUserProfile(normalizedFrom);
        Utils.log("info", `[${trackingId}] Perfil obtenido de Supabase: ${!!userProfile}`);
        
        if (cacheService && userProfile) {
          await cacheService.setUserProfile(normalizedFrom, userProfile);
        }
      } catch (profileError) {
        Utils.handleError(profileError, `[${trackingId}] Error obteniendo perfil`);
        // Continuar con perfil vacío si falla
        userProfile = {};
      }
    }

    const userLanguage = userProfile?.language || 'es';
    Utils.log("info", `[${trackingId}] Idioma del usuario: ${userLanguage}`);

    // NO enviar mensaje de procesamiento - hacerlo más rápido
    // El mensaje de procesamiento agrega latencia innecesaria

    // Descargar y analizar imagen en paralelo cuando sea posible
    Utils.log("info", `[${trackingId}] Descargando imagen con ID: ${imageInfo.imageId}`);
    let imageBuffer;
    try {
      imageBuffer = await whatsappService.downloadImage(imageInfo.imageId);
      Utils.log("info", `[${trackingId}] Imagen descargada: ${imageBuffer?.length || 0} bytes`);
      
      if (!imageBuffer || imageBuffer.length === 0) {
        throw new Error('La imagen descargada está vacía');
      }
    } catch (downloadError) {
      Utils.handleError(downloadError, `[${trackingId}] Error descargando imagen`);
      throw new Error(`No se pudo descargar la imagen: ${downloadError.message}`);
    }

    // Analizar imagen con OpenAI (esta es la operación más lenta)
    Utils.log("info", `[${trackingId}] Analizando imagen con OpenAI`);
    let analysis;
    try {
      // Usar Promise.race con timeout para evitar que se cuelgue
      const analysisPromise = openaiService.analyzeImage(imageBuffer, userLanguage);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout analizando imagen (30s)')), 30000)
      );
      
      analysis = await Promise.race([analysisPromise, timeoutPromise]);
      
      Utils.log("info", `[${trackingId}] Análisis completado:`, {
        esFactura: analysis?.esFactura,
        tipoDocumento: analysis?.tipoDocumento,
        monto: analysis?.monto,
        clasificacion: analysis?.clasificacion
      });
      
      if (!analysis) {
        throw new Error('El análisis de OpenAI retornó null o undefined');
      }
    } catch (analysisError) {
      Utils.handleError(analysisError, `[${trackingId}] Error analizando imagen con OpenAI`);
      throw new Error(`No se pudo analizar la imagen: ${analysisError.message}`);
    }

    // Generar respuesta según el análisis
    let responseMessage = '';
    
    if (analysis.esFactura) {
      const isExpense = analysis.clasificacion === 'GASTO' || analysis.clasificacion === 'EXPENSE' || analysis.clasificacion === 'DESPESA';
      const isBenefit = analysis.clasificacion === 'BENEFICIO' || analysis.clasificacion === 'BENEFIT' || analysis.clasificacion === 'BENEFICIO';
      
      const currency = analysis.moneda || userProfile?.currency || '';
      const amount = analysis.monto ? parseFloat(analysis.monto) : null;
      const formattedAmount = amount ? amount.toLocaleString(userLanguage === 'en' ? 'en-US' : userLanguage === 'pt' ? 'pt-BR' : 'es-MX') : 'N/A';
      
      if (userLanguage === 'es') {
        responseMessage = `📄 *Factura identificada*\n\n`;
        responseMessage += `📋 Tipo: ${analysis.tipoDocumento || 'Factura'}\n`;
        if (amount) responseMessage += `💰 Monto: ${currency} ${formattedAmount}\n`;
        if (analysis.fecha) responseMessage += `📅 Fecha: ${analysis.fecha}\n`;
        if (analysis.empresa) responseMessage += `🏢 Empresa: ${analysis.empresa}\n`;
        if (analysis.concepto) responseMessage += `📝 Concepto: ${analysis.concepto}\n\n`;
        responseMessage += `🔖 *Clasificación: ${isExpense ? 'GASTO 💸' : isBenefit ? 'BENEFICIO 💰' : 'NO DETERMINADO'}*\n\n`;
        responseMessage += `${analysis.resumen || 'Factura procesada correctamente.'}`;
      } else if (userLanguage === 'en') {
        responseMessage = `📄 *Invoice identified*\n\n`;
        responseMessage += `📋 Type: ${analysis.tipoDocumento || 'Invoice'}\n`;
        if (amount) responseMessage += `💰 Amount: ${currency} ${formattedAmount}\n`;
        if (analysis.fecha) responseMessage += `📅 Date: ${analysis.fecha}\n`;
        if (analysis.empresa) responseMessage += `🏢 Company: ${analysis.empresa}\n`;
        if (analysis.concepto) responseMessage += `📝 Concept: ${analysis.concepto}\n\n`;
        responseMessage += `🔖 *Classification: ${isExpense ? 'EXPENSE 💸' : isBenefit ? 'BENEFIT 💰' : 'UNDETERMINED'}*\n\n`;
        responseMessage += `${analysis.resumen || 'Invoice processed successfully.'}`;
      } else if (userLanguage === 'pt') {
        responseMessage = `📄 *Fatura identificada*\n\n`;
        responseMessage += `📋 Tipo: ${analysis.tipoDocumento || 'Fatura'}\n`;
        if (amount) responseMessage += `💰 Valor: ${currency} ${formattedAmount}\n`;
        if (analysis.fecha) responseMessage += `📅 Data: ${analysis.fecha}\n`;
        if (analysis.empresa) responseMessage += `🏢 Empresa: ${analysis.empresa}\n`;
        if (analysis.concepto) responseMessage += `📝 Conceito: ${analysis.concepto}\n\n`;
        responseMessage += `🔖 *Classificação: ${isExpense ? 'DESPESA 💸' : isBenefit ? 'BENEFÍCIO 💰' : 'NÃO DETERMINADO'}*\n\n`;
        responseMessage += `${analysis.resumen || 'Fatura processada com sucesso.'}`;
      }
    } else {
      // No es una factura
      const notInvoiceMessages = {
        'es': 'No pude identificar una factura en esta imagen. Por favor, envía una imagen de una factura, recibo o comprobante de pago para analizarla.',
        'en': 'I could not identify an invoice in this image. Please send an image of an invoice, receipt or payment voucher to analyze it.',
        'pt': 'Não consegui identificar uma fatura nesta imagem. Por favor, envie uma imagem de uma fatura, recibo ou comprovante de pagamento para analisá-la.'
      };
      responseMessage = notInvoiceMessages[userLanguage] || notInvoiceMessages['es'];
      
      if (analysis.resumen) {
        responseMessage += `\n\n📸 Lo que veo: ${analysis.resumen}`;
      }
    }

    // Si es una factura con monto, guardar como transacción
    if (analysis.esFactura && analysis.monto) {
      try {
        Utils.log("info", `[${trackingId}] Guardando transacción en BD`);
        await supabaseService.saveTransaction(from, {
          amount: analysis.monto,
          currency: analysis.moneda || userProfile?.currency || 'MXN',
          description: analysis.concepto || analysis.resumen || 'Factura procesada',
          date: analysis.fecha || new Date().toISOString().split('T')[0],
          tipoDocumento: analysis.tipoDocumento,
          empresa: analysis.empresa,
          concepto: analysis.concepto,
          clasificacion: analysis.clasificacion,
          fecha: analysis.fecha
        });
        Utils.log("info", `[${trackingId}] ✅ Transacción guardada exitosamente`);
      } catch (transactionError) {
        Utils.handleError(transactionError, `[${trackingId}] Error guardando transacción`);
        // No fallar si no se puede guardar la transacción, solo loguear
      }
    }

    // Enviar respuesta
    Utils.log("info", `[${trackingId}] Enviando respuesta de análisis`);
    await whatsappService.sendMessage(from, responseMessage);

    // Guardar en BD y enviar a Make en paralelo (no crítico, no bloquear)
    Promise.all([
      (async () => {
        try {
          const timestamp = new Date().toISOString();
          const messageText = `[Imagen] ${imageInfo.caption || 'Sin descripción'}`;
          await supabaseService.saveMessage(
            from,
            userProfile?.user_name || userName,
            messageText,
            responseMessage,
            timestamp
          );
        } catch (dbError) {
          Utils.handleError(dbError, `[${trackingId}] Error guardando imagen en BD`);
        }
      })(),
      (async () => {
        try {
          await makeService.sendToMake({
            trackingId,
            userId: from,
            userProfile: userProfile,
            message: `[Imagen] ${imageInfo.caption || 'Sin descripción'}`,
            response: responseMessage,
            imageAnalysis: analysis,
            timestamp: new Date().toISOString(),
          });
        } catch (makeError) {
          Utils.handleError(makeError, `[${trackingId}] Error enviando a Make`);
        }
      })()
    ]).catch(() => {
      // Ignorar errores de operaciones no críticas
    });

    Utils.log("info", `[${trackingId}] ✅ Imagen procesada exitosamente`);
  } catch (error) {
    // Log detallado del error
    Utils.handleError(error, `[${trackingId}] Error procesando imagen`);
    console.error(`[${trackingId}] Error completo en procesarImagen:`, {
      message: error.message,
      stack: error.stack,
      imageId: imageInfo?.imageId,
      from: from
    });
    throw error;
  }
}

// Función de procesamiento síncrono
async function procesarMensajeSincrono(from, sanitizedMessage, userName, messageBody, trackingId, messageId = null) {
  try {
    // Verificar si el mensaje ya fue procesado (evitar duplicados)
    if (messageId && isMessageAlreadyProcessed(messageId, from)) {
      Utils.log("warn", `[${trackingId}] Mensaje ya procesado, ignorando: ${messageId}`);
      return;
    }

    Utils.log("info", `[${trackingId}] Procesando mensaje (modo Lambda)`);

    // ⚠️ NORMALIZAR NÚMERO DE TELÉFONO PRIMERO (crítico para comparaciones)
    // WhatsApp puede enviar números en diferentes formatos
    let normalizedFrom;
    try {
      normalizedFrom = supabaseService.validatePhoneNumber(from);
      Utils.log("info", `[${trackingId}] 📞 Número normalizado: "${from}" → "${normalizedFrom}"`);
    } catch (phoneError) {
      Utils.log("error", `[${trackingId}] Error normalizando número de teléfono: ${phoneError.message}`);
      // Intentar usar el número original si falla la normalización
      normalizedFrom = from.replace(/[^0-9]/g, '');
      Utils.log("warn", `[${trackingId}] Usando número limpio manualmente: "${normalizedFrom}"`);
    }

    let userProfile = null;
    
    if (cacheService) {
      userProfile = await cacheService.getUserProfile(normalizedFrom);
    }
    
    if (!userProfile) {
      Utils.log("info", `[${trackingId}] Obteniendo perfil de Supabase para: ${normalizedFrom}`);
      userProfile = await supabaseService.getUserProfile(normalizedFrom);
      
      if (cacheService && userProfile) {
        await cacheService.setUserProfile(normalizedFrom, userProfile);
      }
    }

    // ⚠️ VERIFICACIÓN CRÍTICA #1: Verificar suscripción ANTES de cualquier procesamiento
    // Esto previene que se envíen mensajes predefinidos (estudio, onboarding, etc.) si la suscripción está inactiva
    Utils.log("info", `[${trackingId}] 🔍 Verificando suscripción para: ${normalizedFrom}`);
    const subscriptionStatus = await subscriptionService.isSubscriptionActive(normalizedFrom);
    Utils.log("info", `[${trackingId}] 📊 Estado de suscripción:`, {
      isActive: subscriptionStatus.isActive,
      daysRemaining: subscriptionStatus.daysRemaining,
      hasMessage: !!subscriptionStatus.message,
      subscriptionActive: userProfile?.subscription_active,
      manualOverride: userProfile?.subscription_manual_override,
      startDate: userProfile?.subscription_start_date,
      endDate: userProfile?.subscription_end_date
    });
    
    // Si la suscripción está inactiva, enviar mensaje de expiración y DETENER completamente
    if (!subscriptionStatus.isActive) {
      const timeRemaining = subscriptionStatus.daysRemaining || 0;
      Utils.log("warn", `[${trackingId}] ⛔ SUSCRIPCIÓN INACTIVA - Usuario ${normalizedFrom} (original: ${from}). Tiempo restante: ${timeRemaining}. DETENIENDO PROCESAMIENTO.`);
      Utils.log("warn", `[${trackingId}] 📋 Detalles del perfil:`, {
        subscription_active: userProfile?.subscription_active,
        subscription_manual_override: userProfile?.subscription_manual_override,
        subscription_start_date: userProfile?.subscription_start_date,
        subscription_end_date: userProfile?.subscription_end_date,
        phone_number_in_db: userProfile?.phone_number
      });
      
      // Usar mensaje predefinido del servicio (sin gastar tokens de IA)
      const expirationMessage = subscriptionStatus.message;
      
      if (expirationMessage) {
        try {
          await whatsappService.sendMessage(from, expirationMessage); // Usar 'from' original para WhatsApp
          Utils.log("info", `[${trackingId}] ✅ Mensaje de expiración enviado a ${from} (sin gastar tokens, sin procesar mensaje)`);
        } catch (sendError) {
          Utils.handleError(sendError, `[${trackingId}] Error enviando mensaje de suscripción expirada`);
        }
      } else {
        // Fallback si no hay mensaje
        const userLanguage = userProfile?.language || 'es';
        const fallbackMessage = userLanguage === 'es'
          ? `⏰ Tu suscripción de prueba ha finalizado.\n\nPara continuar usando el servicio y recibir ayuda con tus finanzas, por favor renueva tu suscripción.\n\nContacta con soporte para más información.`
          : userLanguage === 'en'
          ? `⏰ Your trial subscription has ended.\n\nTo continue using the service and receive help with your finances, please renew your subscription.\n\nContact support for more information.`
          : `⏰ Sua assinatura de teste terminou.\n\nPara continuar usando o serviço e receber ajuda com suas finanças, renove sua assinatura.\n\nEntre em contato com o suporte para mais informações.`;
        
        try {
          await whatsappService.sendMessage(from, fallbackMessage);
        } catch (sendError) {
          Utils.handleError(sendError, `[${trackingId}] Error enviando mensaje de suscripción expirada`);
        }
      }
      
      // ⚠️ RETURN CRÍTICO: Detener procesamiento completamente
      // NO se procesa estudio inicial, NO se procesa onboarding, NO se procesa con IA
      Utils.log("info", `[${trackingId}] 🛑 Procesamiento COMPLETAMENTE detenido - Suscripción inactiva. NO se enviarán mensajes predefinidos. NO se gastaron tokens.`);
      return; // ⚠️ NO CONTINUAR - Esto previene CUALQUIER otro procesamiento
    }
    
    Utils.log("info", `[${trackingId}] ✅ Suscripción activa - Continuando con procesamiento normal`);

    // PASO 0: Verificar e iniciar suscripción (solo si está activa)
    const firstMessage = await isFirstMessage(normalizedFrom);
    if (firstMessage) {
      Utils.log("info", `[${trackingId}] PRIMER MENSAJE - Iniciando suscripción de 15 días`);
      try {
        await subscriptionService.startSubscription(normalizedFrom);
        // Refrescar perfil después de iniciar suscripción
        userProfile = await supabaseService.getUserProfile(normalizedFrom);
        if (cacheService && userProfile) {
          await cacheService.setUserProfile(normalizedFrom, userProfile);
        }
      } catch (subError) {
        Utils.handleError(subError, `[${trackingId}] Error iniciando suscripción`);
        // Continuar aunque falle la suscripción
      }
    }

    // PASO 1: Verificar si necesita estudio inicial del cliente
    // SOLO en el PRIMER mensaje y SOLO si no tiene datos en BD
    
    // CRÍTICO: Si el perfil actual dice que faltan datos, verificar DIRECTAMENTE en Supabase para evitar falsos positivos por caché
    if (needsClientStudy(userProfile)) {
      Utils.log("info", `[${trackingId}] Perfil parece incompleto, verificando directo en Supabase...`);
      try {
        const freshProfile = await supabaseService.getUserProfile(normalizedFrom);
        if (freshProfile) {
          userProfile = freshProfile;
          if (cacheService) {
            await cacheService.setUserProfile(normalizedFrom, userProfile);
          }
        }
      } catch (refreshError) {
        Utils.log("warn", `[${trackingId}] Error refrescando perfil: ${refreshError.message}`);
      }
    }

    const hasStudyData = !needsClientStudy(userProfile);
    
    Utils.log("info", `[${trackingId}] Verificando estudio inicial`, {
      hasStudyData,
      firstMessage,
      hasName: !!userProfile?.user_name,
      hasSalary: !!userProfile?.monthly_salary,
      hasCurrency: !!userProfile?.currency,
      hasExpenses: userProfile?.fixed_expenses !== undefined && userProfile?.fixed_expenses !== null,
      hasCountry: !!userProfile?.country
    });
    
    // SOLO pedir estudio si:
    // 1. Es el primer mensaje (no tiene conversaciones previas)
    // 2. Y NO tiene todos los datos del estudio en BD
    if (firstMessage && !hasStudyData) {
      Utils.log("info", `[${trackingId}] PRIMER MENSAJE - Usuario necesita estudio inicial`);
      
      try {
        const inStudy = await handleClientStudy(normalizedFrom, messageBody, userProfile, trackingId);
        
        if (inStudy) {
          // Actualizar perfil después del estudio
          if (cacheService) {
            userProfile = await supabaseService.getUserProfile(normalizedFrom);
            await cacheService.setUserProfile(normalizedFrom, userProfile);
          }
          return; // Salir, el estudio ya envió respuesta
        }
        
        // Actualizar perfil después de completar estudio
        userProfile = await supabaseService.getUserProfile(normalizedFrom);
        if (cacheService) {
          await cacheService.setUserProfile(normalizedFrom, userProfile);
        }
        // CONTINUAR con flujo normal después del estudio
      } catch (studyError) {
        Utils.handleError(studyError, `[${trackingId}] Error en estudio del cliente`);
        // NO salir, continuar con flujo normal para evitar bloqueo
      }
    } else if (!firstMessage && !hasStudyData) {
      // No es el primer mensaje pero falta algún dato - NO pedir, solo loguear
      Utils.log("warn", `[${trackingId}] Usuario tiene conversaciones previas pero falta algún dato del estudio. Continuando sin pedir estudio.`);
    } else {
      Utils.log("info", `[${trackingId}] Usuario ya tiene estudio completo o no es primer mensaje, continuando con flujo normal`);
    }

    // PASO 2: Verificar si necesita onboarding de idioma (SOLO si no tiene idioma)
    if (!userProfile?.language) {
      Utils.log("info", `[${trackingId}] Usuario sin idioma - verificando onboarding`);
      const inOnboarding = await handleOnboarding(normalizedFrom, messageBody, userProfile, trackingId);
      
      if (inOnboarding) {
        // Actualizar perfil después del onboarding
        if (cacheService) {
          userProfile = await supabaseService.getUserProfile(normalizedFrom);
          await cacheService.setUserProfile(normalizedFrom, userProfile);
        }
        return; // Salir, el onboarding ya envió respuesta preguntando por idioma
      }
      
      // Actualizar perfil después de detectar idioma
      userProfile = await supabaseService.getUserProfile(normalizedFrom);
      if (cacheService) {
        await cacheService.setUserProfile(normalizedFrom, userProfile);
      }
      // CONTINUAR con flujo normal después de detectar idioma
    }

    Utils.log("info", `[${trackingId}] Extrayendo información`);
    // ⚠️ NUEVO: Verificar si hay actualización pendiente de perfil
    const profileUpdateService = require("./Services/profileUpdateService");
    const pendingUpdate = await profileUpdateService.processPendingUpdate(normalizedFrom, sanitizedMessage, userProfile);
    
    if (pendingUpdate.processed) {
      // Si se procesó una actualización pendiente, invalidar caché y SALIR (no mandar a IA)
      if (cacheService && pendingUpdate.success) {
        await cacheService.invalidateUserCache(normalizedFrom);
        // Refrescar perfil
        userProfile = await supabaseService.getUserProfile(normalizedFrom);
        await cacheService.setUserProfile(normalizedFrom, userProfile);
      }
      return;
    } else {
      // Verificar si el mensaje indica un cambio de perfil
      const profileChange = await profileUpdateService.handleProfileChange(normalizedFrom, sanitizedMessage, userProfile);
      if (profileChange.handled) {
        // Si se solicitó actualización, no continuar con extracción normal
        return;
      }
    }
    
    const extractedData = await openaiService.extractUserData(
      sanitizedMessage,
      userProfile
    );
    
    const { transaction, ...extractedInfo } = extractedData || {};
    
    if (transaction) {
      try {
        Utils.log("info", `[${trackingId}] Detectada transacción en mensaje, guardando en BD`, transaction);
        await supabaseService.saveTransaction(normalizedFrom, transaction);

        // =============== COACH FINANCIERO VIVO v1.1 ===============
        // Evaluar alerta en TIEMPO REAL justo después de guardar el gasto
        // Umbrales: ≥70% WARNING, ≥90% CRITICAL, ≥100% EXCEEDED
        // Anti-duplicado: solo 1 alerta por umbral por mes por usuario
        try {
          const budgetResult = await budgetAlertService.evaluateAndAlertAfterExpense(normalizedFrom);
          Utils.log("info", `[${trackingId}] 💰 Budget eval: alert=${budgetResult.alerted} reason=${budgetResult.reason} level=${budgetResult.profile?.level || 'n/a'}`, {
            spent: budgetResult.profile?.spent,
            budget: budgetResult.profile?.budget,
            percent: budgetResult.profile?.percent
          });
        } catch (budgetErr) {
          Utils.handleError(budgetErr, `[${trackingId}] Budget alert skipped (non-fatal)`);
        }
        // ==========================================================
      } catch (txError) {
        Utils.handleError(txError, `[${trackingId}] Error guardando transacción detectada`);
      }
    }

    if (extractedInfo && Object.keys(extractedInfo).length > 0) {
      // NO sobrescribir datos del estudio si ya existen en la BD
      // Solo actualizar si el usuario explícitamente menciona cambios
      const updateData = {};
      const messageLower = sanitizedMessage.toLowerCase();
      
      // Solo actualizar nombre si NO existe o si el usuario explícitamente se presenta
      if (extractedInfo.user_name) {
        if (!userProfile?.user_name) {
          // No tiene nombre, actualizar
          updateData.user_name = extractedInfo.user_name;
        } else {
          // Ya tiene nombre, solo actualizar si el mensaje parece ser una presentación explícita
          const isExplicitName = messageLower.includes('me llamo') ||
                                messageLower.includes('mi nombre es') ||
                                messageLower.includes('soy');
          if (isExplicitName) {
            updateData.user_name = extractedInfo.user_name;
          }
        }
      }
      
      // Detectar si el usuario menciona explícitamente un cambio de salario
      const isExplicitSalary = messageLower.includes('ahora gano') ||
                               messageLower.includes('ganar') ||
                               messageLower.includes('mi salario es') ||
                               messageLower.includes('mi ingreso es') ||
                               messageLower.includes('actualizar mi salario') ||
                               messageLower.includes('actualizar mi ingreso');
      
      // Solo actualizar salario si NO existe o si el usuario explícitamente lo menciona
      if (extractedInfo.monthly_salary) {
        if (!userProfile?.monthly_salary) {
          // No tiene salario, actualizar
          updateData.monthly_salary = extractedInfo.monthly_salary;
        } else if (isExplicitSalary) {
          // Ya tiene salario, pero mencionó explícitamente un cambio
          updateData.monthly_salary = extractedInfo.monthly_salary;
        }
      }
      
      // Detectar si el usuario menciona explícitamente un cambio de moneda
      const isExplicitCurrency = messageLower.includes('mi moneda') ||
                                 messageLower.includes('moneda actual') ||
                                 messageLower.includes('moneda son') ||
                                 messageLower.includes('cambio de moneda');
      
      // Solo actualizar moneda si NO existe o si el usuario explícitamente la menciona
      if (extractedInfo.currency) {
        if (!userProfile?.currency) {
          // No tiene moneda, actualizar
          updateData.currency = extractedInfo.currency;
        } else if (isExplicitCurrency) {
          // Ya tiene moneda, pero mencionó explícitamente un cambio
          updateData.currency = extractedInfo.currency;
        }
      }
      
      if (extractedInfo.fixed_expenses !== undefined && (userProfile?.fixed_expenses === undefined || userProfile?.fixed_expenses === null)) {
        updateData.fixed_expenses = extractedInfo.fixed_expenses;
      }
      if (extractedInfo.country && !userProfile?.country) {
        updateData.country = extractedInfo.country;
      }
      
      // Idioma y otros datos siempre se pueden actualizar
      if (extractedInfo.language) {
        updateData.language = extractedInfo.language;
      }
      if (extractedInfo.city) {
        updateData.city = extractedInfo.city;
      }
      
      // Actualizar solo si hay información válida
      if (Object.keys(updateData).length > 0) {
        Utils.log("info", `[${trackingId}] Actualizando perfil con:`, updateData);
        await supabaseService.updateUserProfile(normalizedFrom, updateData);
        
        // Invalidar caché después de actualizar
        if (cacheService) {
          await cacheService.invalidateUserCache(normalizedFrom);
          // Refrescar perfil
          userProfile = await supabaseService.getUserProfile(normalizedFrom);
          await cacheService.setUserProfile(normalizedFrom, userProfile);
        }
        
        // Invalidar caché del monthlyFeedbackService si existe
        try {
          const monthlyFeedbackService = require("./Services/monthlyFeedbackService");
          if (monthlyFeedbackService && monthlyFeedbackService.profileCache) {
            monthlyFeedbackService.profileCache.del(normalizedFrom);
            monthlyFeedbackService.profileCache.del('users_complete_study');
          }
        } catch (e) {
          // Ignorar si no está disponible
        }
      } else {
        Utils.log("info", `[${trackingId}] No hay datos nuevos para actualizar (todos ya existen en BD)`);
      }
    }

    Utils.log("info", `[${trackingId}] Generando respuesta IA`);
    let aiResponse;
    try {
      aiResponse = await Utils.retryWithBackoff(
        () => openaiService.generateResponse(from, sanitizedMessage, userProfile),
        3,
        1000
      );
    } catch (aiError) {
      Utils.handleError(aiError, `[${trackingId}] Error generando respuesta IA`);
      
      // Si es error 429 (cuota excedida), el método generateResponse ya debería haber retornado un fallback
      // Pero si aún así falla, intentar generar respuesta de fallback manualmente
      if (aiError.message && aiError.message.includes('429')) {
        Utils.log("warn", `[${trackingId}] Cuota excedida, usando respuesta de fallback`);
        try {
          aiResponse = openaiService.generateFallbackResponse(sanitizedMessage, userProfile);
        } catch (fallbackError) {
          Utils.handleError(fallbackError, `[${trackingId}] Error en fallback`);
          aiResponse = "Lo siento, estoy experimentando dificultades técnicas. Por favor intenta de nuevo en unos momentos.";
        }
      } else {
        // Para otros errores, enviar mensaje genérico
        await whatsappService.sendMessage(
          from,
          "Lo siento, hubo un problema procesando tu mensaje. Por favor intenta de nuevo."
        );
        return; // Salir completamente si falla la generación de IA
      }
    }

    const formattedResponse = Utils.formatResponseForWhatsApp(aiResponse);

    // Enviar mensaje UNA SOLA VEZ - si falla, no reintentar para evitar duplicados
    let messageSent = false;
    try {
      Utils.log("info", `[${trackingId}] Enviando respuesta WhatsApp`);
      await whatsappService.sendMessage(from, formattedResponse);
      messageSent = true;
    } catch (sendError) {
      Utils.handleError(sendError, `[${trackingId}] Error enviando mensaje WhatsApp`);
      // Si falla el envío, intentar UNA vez más con retry
      try {
        await Utils.retryWithBackoff(
          () => whatsappService.sendMessage(from, formattedResponse),
          1, // Solo 1 reintento
          500
        );
        messageSent = true;
      } catch (retryError) {
        Utils.handleError(retryError, `[${trackingId}] Error en reintento de envío`);
        // No enviar mensaje de error adicional para evitar duplicados
        return;
      }
    }

    // Solo continuar si el mensaje se envió correctamente
    if (!messageSent) {
      return;
    }

    // Guardar en BD (no crítico, no bloquear)
    try {
      const timestamp = new Date().toISOString();
      Utils.log("info", `[${trackingId}] Guardando en Supabase`);
      await supabaseService.saveMessage(
        from,
        userProfile.user_name || userName,
        messageBody,
        formattedResponse,
        timestamp
      );
    } catch (dbError) {
      Utils.handleError(dbError, `[${trackingId}] Base de datos`);
      // NO salir, solo loguear el error
    }

    // Enviar a Make (no crítico, no bloquear)
    try {
      Utils.log("info", `[${trackingId}] Enviando a Make`);
      await makeService.sendToMake({
        trackingId,
        userId: from,
        userProfile: userProfile,
        message: messageBody,
        response: formattedResponse,
        timestamp: new Date().toISOString(),
      });
    } catch (makeError) {
      Utils.handleError(makeError, `[${trackingId}] Make webhook`);
      // NO salir, solo loguear el error
    }

    Utils.log("info", `[${trackingId}] ✅ Mensaje procesado exitosamente`);
  } catch (processingError) {
    Utils.handleError(processingError, `[${trackingId}] Procesamiento mensaje`);

    // Solo enviar mensaje de error si NO se ha enviado ninguna respuesta antes
    // Verificar si ya se envió un mensaje para evitar duplicados
    try {
      await whatsappService.sendMessage(
        from,
        "Lo siento, hubo un problema procesando tu mensaje. Por favor intenta de nuevo."
      );
    } catch (errorSendingError) {
      Utils.handleError(errorSendingError, `[${trackingId}] Envío mensaje error`);
    }
  }
}

// Ruta de prueba
app.get("/", (req, res) => {
  res.json({
    status: "✅ Chatbot WhatsApp en AWS Lambda",
    mode: "SERVERLESS (sin colas, con caché opcional)",
    timestamp: new Date().toISOString(),
    version: "2.0.0-lambda",
    features: {
      queues: false,
      cache: !!cacheService,
      rateLimit: false,
      serverless: true,
      dailyTips: true
    },
  });
});

// Health check
app.get("/health", async (req, res) => {
  try {
    const health = await Utils.healthCheck();
    
    if (cacheService) {
      health.cache = await cacheService.getStats();
    }
    
    res.json(health);
  } catch (error) {
    res.status(500).json({
      error: "Health check failed",
      message: error.message
    });
  }
});

// Limpiar historial
app.post("/clear-history/:userId", (req, res) => {
  try {
    const { userId } = req.params;
    openaiService.clearHistory(userId);
    
    if (cacheService) {
      cacheService.invalidateUserCache(userId);
    }
    
    res.json({ success: true, message: "Historial limpiado" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ⚠️ ENDPOINTS DE TIPS DIARIOS - AGREGAR ANTES DE module.exports

// Endpoint para enviar tips manualmente (testing) - SOLO ADMIN
app.post("/send-tips", requireAdmin, async (req, res) => {
  try {
    console.log('🔔 Envío manual de tips solicitado');
    
    const result = await dailyTipsService.sendDailyTipsToAll();
    
    res.json({
      success: true,
      message: 'Tips enviados',
      result
    });
  } catch (error) {
    console.error('❌ Error enviando tips:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Endpoint para obtener estadísticas de tips - SOLO ADMIN
app.get("/tips-stats", requireAdmin, async (req, res) => {
  try {
    const stats = await dailyTipsService.getStats();
    res.json(stats);
  } catch (error) {
    console.error('❌ Error obteniendo stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para enviar tip a usuario específico (testing) - SOLO ADMIN
app.post("/send-tip/:phone", requireAdmin, async (req, res) => {
  try {
    const { phone } = req.params;
    const result = await dailyTipsService.sendDailyTip(phone);
    res.json(result);
  } catch (error) {
    console.error('❌ Error enviando tip:', error);
    res.status(500).json({ error: error.message });
  }
});

// ⚠️ ENDPOINTS DE FEEDBACK MENSUAL

// Endpoint para enviar feedback mensual manualmente (testing)
// Endpoint para enviar feedback mensual manualmente - SOLO ADMIN
app.post("/send-monthly-feedback", requireAdmin, async (req, res) => {
  const trackingId = Utils.generateTrackingId();
  
  try {
    Utils.log("info", `[${trackingId}] Envío manual de feedback mensual solicitado`);
    
    // Verificar que el servicio esté disponible
    if (!monthlyFeedbackService) {
      throw new Error('MonthlyFeedbackService no está disponible');
    }
    
    Utils.log("info", `[${trackingId}] Iniciando envío de feedback a todos los usuarios`);
    
    const result = await monthlyFeedbackService.sendMonthlyFeedbackToAll();
    
    Utils.log("info", `[${trackingId}] Feedback enviado exitosamente`, result);
    
    res.json({
      success: true,
      message: 'Feedback mensual enviado',
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    Utils.handleError(error, `[${trackingId}] Error enviando feedback mensual`);
    
    // Respuesta detallada del error
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint para obtener estadísticas de feedback - SOLO ADMIN
app.get("/feedback-stats", requireAdmin, async (req, res) => {
  try {
    const stats = await monthlyFeedbackService.getStats();
    res.json(stats);
  } catch (error) {
    console.error('❌ Error obteniendo stats de feedback:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para enviar feedback a usuario específico (testing) - SOLO ADMIN
app.post("/send-feedback/:phone", requireAdmin, async (req, res) => {
  try {
    const { phone } = req.params;
    const supabaseService = require("./Services/supabaseService");
    const userProfile = await supabaseService.getUserProfile(phone);
    
    if (!userProfile) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    const result = await monthlyFeedbackService.sendMonthlyFeedback(phone, userProfile);
    res.json(result);
  } catch (error) {
    console.error('❌ Error enviando feedback:', error);
    res.status(500).json({ error: error.message });
  }
});

// ⚠️ ENDPOINT DE MONITOREO Y LOGS

// Endpoint para ver logs recientes (últimas 24 horas)
app.get("/logs", async (req, res) => {
  try {
    // En Lambda, los logs están en CloudWatch
    // Este endpoint devuelve instrucciones y estado
    res.json({
      message: "Logs disponibles en AWS CloudWatch",
      instructions: {
        cloudwatch: "Ver logs en AWS Console > CloudWatch > Log Groups > /aws/lambda/whatsapp-chatbot-dev-api",
        cli: "serverless logs -f api --tail",
        recentErrors: "Revisa los logs de CloudWatch para ver errores recientes"
      },
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'production'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para verificar estado del sistema - SOLO ADMIN (expone datos de usuarios)
app.get("/debug/study", requireAdmin, async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) {
      return res.status(400).json({ error: 'Se requiere parámetro phone' });
    }
    
    const userProfile = await supabaseService.getUserProfile(phone);
    const needsStudy = !userProfile?.user_name || !userProfile?.monthly_salary || 
                      !userProfile?.currency || userProfile?.fixed_expenses === undefined || 
                      !userProfile?.country;
    
    res.json({
      phone,
      hasProfile: !!userProfile,
      needsStudy,
      profile: userProfile ? {
        user_name: userProfile.user_name,
        monthly_salary: userProfile.monthly_salary,
        currency: userProfile.currency,
        fixed_expenses: userProfile.fixed_expenses,
        country: userProfile.country,
        language: userProfile.language
      } : null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ⚠️ ENDPOINTS DE ADMINISTRADOR - GESTIÓN DE SUSCRIPCIONES

// 🔐 SECRETO DE ADMIN: SIEMPRE desde config (sin fallback hardcodeado).
// Si no está configurado, el acceso admin queda bloqueado (fail closed).
const ADMIN_SECRET = config.adminSecret;

function isAdmin(req) {
  // Forzar fallback string seguro; si no hay secret de admin, nunca autorizamos
  if (!ADMIN_SECRET) {
    console.error('⚠️ ADMIN_SECRET no configurado. Endpoints de administración BLOQUEADOS.');
    return false;
  }

  const authHeader = req.headers.authorization;
  const secret = (req.query.secret || (authHeader && authHeader.replace('Bearer ', '')) || '').trim();
  return Utils.safeEqual(secret, ADMIN_SECRET);
}

// Middleware de protección admin reutilizable (reemplaza los checks manuales)
function requireAdmin(req, res, next) {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: "No autorizado" });
  }
  next();
}

// ============================================================
// AUTH JWT (Supabase Auth) para endpoints de datos del usuario
// ============================================================

function normalizeDigits(value) {
  return String(value || '').replace(/[^0-9]/g, '');
}

// Verifica el Bearer token JWT de Supabase Auth (desacoplado, sin red).
// En caso de secret ausente o token inválido/expirado → 401 (fail-closed).
function requireUserAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const payload = Utils.verifyJwt(token, config.supabase.jwtSecret);
  if (!payload) {
    return res.status(401).json({ error: "No autorizado: token inválido o expirado" });
  }
  req.user = { id: payload.sub, email: payload.email || null };
  next();
}

// Vincula la identidad del JWT con los datos pedidos:
//  - user_id (query/body) debe ser el del token
//  - email (query/body) debe coincidir con el del token
//  - phone (param/query/body) debe ser el de la fila user_profiles del usuario
async function requireOwnData(req, res, next) {
  const requestedPhone = normalizeDigits(req.params.phone ?? req.query.phone ?? req.body?.phone ?? '');
  const userId = req.query.user_id || req.body?.user_id || null;
  const email = req.query.email || req.body?.email || null;

  if (userId && String(userId) !== String(req.user.id)) {
    return res.status(403).json({ error: "No tienes acceso a estos datos" });
  }
  if (email && req.user.email && String(email).toLowerCase() !== String(req.user.email).toLowerCase()) {
    return res.status(403).json({ error: "No tienes acceso a estos datos" });
  }

  try {
    const baseSelect = "id, phone_number, email, user_name, currency, monthly_salary, fixed_expenses";
    const { data: profile, error } = await supabaseService.supabase
      .from("user_profiles")
      .select(baseSelect)
      .eq("id", req.user.id)
      .maybeSingle();

    if (error) {
      console.error('❌ [Auth] Error buscando perfil del usuario:', error);
      return res.status(500).json({ error: error.message || "Error interno del servidor" });
    }

    // Fallback por email: los perfiles creados desde el chat de WhatsApp tienen un id
    // distinto al de auth (`user_profiles.id` != auth.users.id). El vínculo real entre
    // la cuenta web y su dato financiero es el email, así que lo usamos como respaldo.
    let resolved = profile || null;
    if (!resolved && req.user.email) {
      const fb = await supabaseService.supabase
        .from("user_profiles")
        .select(baseSelect)
        .eq("email", req.user.email)
        .maybeSingle();
      if (fb.error) {
        console.error('❌ [Auth] Error buscando perfil por email:', fb.error);
        return res.status(500).json({ error: fb.error.message || "Error interno del servidor" });
      }
      resolved = fb.data || null;
    }

    const profilePhone = resolved ? normalizeDigits(resolved.phone_number) : '';

    if (requestedPhone) {
      if (!resolved || profilePhone !== requestedPhone) {
        return res.status(403).json({ error: "Este teléfono no pertenece a tu cuenta" });
      }
    }

    req.user.profile = resolved || null;
    req.user.phone = requestedPhone || profilePhone || null;
    next();
  } catch (err) {
    console.error('❌ [Auth] Error en requireOwnData:', err);
    res.status(500).json({ error: err.message || "Error interno del servidor" });
  }
}

// Obtener todos los usuarios con suscripciones (admin)
app.get("/admin/users", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(401).json({ error: "No autorizado" });
    }

    console.log("📊 [Admin] Obteniendo lista de usuarios...");
    const users = await subscriptionService.getAllUsersWithSubscriptions();
    console.log(`✅ [Admin] ${users.length} usuarios obtenidos`);
    
    res.json({
      success: true,
      count: users.length,
      users: users
    });
  } catch (error) {
    console.error("❌ [Admin] Error obteniendo usuarios:", error);
    Utils.handleError(error, "Error obteniendo usuarios");
    res.status(500).json({ 
      error: error.message || "Error interno del servidor",
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Obtener métricas de negocio (admin)
app.get("/admin/business-metrics", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(401).json({ error: "No autorizado" });
    }

    console.log("📊 [Admin] Calculando métricas de negocio...");
    const metrics = await metricsService.getBusinessMetrics();
    console.log(`✅ [Admin] Métricas obtenidas`);
    
    res.json({
      success: true,
      metrics: metrics
    });
  } catch (error) {
    console.error("❌ [Admin] Error obteniendo métricas:", error);
    res.status(500).json({ error: error.message || "Error interno del servidor" });
  }
});

// Obtener lista de referidos y descuentos pendientes (admin)
app.get("/admin/referrals", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(401).json({ error: "No autorizado" });
    }

    const referrals = await referralService.getReferralStatusList();
    res.json({ success: true, referrals });
  } catch (error) {
    console.error("❌ [Admin] Error obteniendo referidos:", error);
    res.status(500).json({ error: error.message });
  }
});

// Obtener todas las encuestas de satisfacción (admin)
app.get("/admin/surveys", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(401).json({ error: "No autorizado" });
    }

    console.log("📊 [Admin] Obteniendo encuestas...");
    const surveys = await supabaseService.getAllSurveys();
    
    res.json({
      success: true,
      surveys: surveys
    });
  } catch (error) {
    console.error("❌ [Admin] Error obteniendo encuestas:", error);
    res.status(500).json({ error: error.message });
  }
});

// Marcar descuento de referido como aplicado (admin)
app.post("/admin/referral/:userId/apply-discount", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(401).json({ error: "No autorizado" });
    }

    const { userId } = req.params;
    await referralService.markDiscountAsApplied(userId);
    res.json({ success: true, message: "Descuento marcado como aplicado" });
  } catch (error) {
    console.error("❌ [Admin] Error aplicando descuento:", error);
    res.status(500).json({ error: error.message });
  }
});

// Aplicar código de referido (usuario)
app.post("/user/referral/apply", limiterSubscription, async (req, res) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) {
      return res.status(400).json({ error: "Teléfono y código son requeridos" });
    }

    const result = await referralService.applyReferralCode(phone, code);
    res.json(result);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Obtener información de suscripción de un usuario específico
app.get("/admin/subscription/:phone", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(401).json({ error: "No autorizado" });
    }

    const { phone } = req.params;
    const info = await subscriptionService.getSubscriptionInfo(phone);
    
    if (!info) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }
    
    res.json({
      success: true,
      subscription: info
    });
  } catch (error) {
    Utils.handleError(error, "Error obteniendo suscripción");
    res.status(500).json({ error: error.message });
  }
});

// Activar suscripción manualmente (admin)
app.post("/admin/subscription/:phone/activate", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(401).json({ error: "No autorizado" });
    }

    const { phone } = req.params;
    const { days } = req.body;
    // Si days es null, undefined o no se envía, usar tiempo por defecto (2 minutos)
    const subscriptionDays = (days === null || days === undefined) ? null : (days || 15);
    
    console.log(`🔧 [Admin] Activando suscripción para ${phone} por ${subscriptionDays === null ? '2 minutos' : subscriptionDays + ' días'}`);
    const result = await subscriptionService.activateSubscription(phone, subscriptionDays);
    
    const durationMessage = subscriptionDays === null 
      ? '2 minutos (tiempo por defecto)' 
      : `${subscriptionDays} días`;
    
    res.json({
      success: true,
      message: `Suscripción activada por ${durationMessage}`,
      subscription: result
    });
  } catch (error) {
    console.error("❌ [Admin] Error activando suscripción:", error);
    Utils.handleError(error, "Error activando suscripción");
    res.status(500).json({ error: error.message || "Error interno del servidor" });
  }
});

// Desactivar suscripción manualmente (admin)
app.post("/admin/subscription/:phone/deactivate", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(401).json({ error: "No autorizado" });
    }

    const { phone } = req.params;
    console.log(`🔧 [Admin] Desactivando suscripción para ${phone}`);
    const result = await subscriptionService.deactivateSubscription(phone, true);
    
    res.json({
      success: true,
      message: "Suscripción desactivada",
      subscription: result
    });
  } catch (error) {
    console.error("❌ [Admin] Error desactivando suscripción:", error);
    Utils.handleError(error, "Error desactivando suscripción");
    res.status(500).json({ error: error.message || "Error interno del servidor" });
  }
});

// Obtener días restantes de un usuario (público para el frontend)
app.get("/subscription/:phone/days", requireUserAuth, requireOwnData, async (req, res) => {
  try {
    const { phone } = req.params;
    console.log(`📞 GET /subscription/${phone}/days - Solicitando información de suscripción`);
    
    const info = await subscriptionService.getSubscriptionInfo(phone);
    
    console.log(`📊 Información de suscripción obtenida:`, info);
    
    if (!info) {
      console.log(`⚠️ Usuario ${phone} no encontrado`);
      return res.status(404).json({ error: "Usuario no encontrado" });
    }
    
    const response = {
      success: true,
      daysRemaining: info.daysRemaining ?? 0,
      isActive: info.isActive ?? false,
      endDate: info.endDate ?? null
    };
    
    console.log(`✅ Enviando respuesta:`, response);
    res.json(response);
  } catch (error) {
    console.error(`❌ Error en /subscription/:phone/days:`, error);
    Utils.handleError(error, "Error obteniendo días restantes");
    res.status(500).json({ error: error.message });
  }
});

// Obtener historial financiero mensual (para frontend)
app.get("/user/history/:phone", requireUserAuth, requireOwnData, async (req, res) => {
  try {
    const { phone } = req.params;
    // req.user.profile ya fue cargado por requireOwnData (1 sola consulta slim).
    const history = await supabaseService.getMonthlyHistory(phone, req.user.profile);
    const profile = req.user.profile || {};

    res.json({
      success: true,
      history,
      profile: {
        user_name: profile.user_name,
        currency: profile.currency,
        monthly_salary: profile.monthly_salary,
        fixed_expenses: profile.fixed_expenses
      }
    });
  } catch (error) {
    console.error(`❌ Error en /user/history/:phone:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Actualizar perfil desde frontend (con validaciones)
app.post("/user/profile/update", limiterProfileUpdate, async (req, res) => {
  try {
    const { email, telefono, codigo_pais, username, monthly_salary, currency, country, fixed_expenses } = req.body;
    // avatar_url removido - la columna no existe en la base de datos
    
    if (!email) {
      return res.status(400).json({ error: "Email es requerido" });
    }
    
    const result = await userProfileService.updateProfileFromFrontend(email, {
      telefono,
      codigo_pais,
      username,
      monthly_salary,
      currency,
      country,
      fixed_expenses
    });
    
    res.json({
      success: true,
      message: "Perfil actualizado correctamente",
      profile: result
    });
  } catch (error) {
    Utils.handleError(error, "Error actualizando perfil desde frontend");
    res.status(500).json({ error: error.message });
  }
});

// Iniciar suscripción desde frontend (al hacer clic en botón WhatsApp)
app.post("/subscription/start", limiterSubscription, async (req, res) => {
  try {
    const { email, phoneNumber } = req.body;
    
    if (!email || !phoneNumber) {
      return res.status(400).json({ error: "Email y número de teléfono son requeridos" });
    }
    
    const result = await userProfileService.startSubscriptionFromFrontend(email, phoneNumber);
    
    res.json({
      success: true,
      message: result.alreadyStarted 
        ? "Suscripción ya estaba iniciada" 
        : "Suscripción iniciada correctamente",
      subscription: result
    });
  } catch (error) {
    Utils.handleError(error, "Error iniciando suscripción desde frontend");
    res.status(500).json({ error: error.message });
  }
});

// --- ENDPOINTS LICENCIAS ---

// Generar clave de licencia (Admin)
app.post("/admin/license/generate", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(401).json({ error: "No autorizado" });
    }

    console.log("🔑 [Admin] Generando clave de licencia...");
    const key = await supabaseService.getAvailableLicenseKey();
    
    if (!key) {
      return res.status(404).json({ 
        success: false, 
        error: "No hay claves disponibles en el sistema. Contacte soporte." 
      });
    }

    res.json({
      success: true,
      licenseKey: key.key_code,
      message: "Clave generada y reservada exitosamente"
    });
  } catch (error) {
    console.error("❌ [Admin] Error generando licencia:", error);
    res.status(500).json({ error: error.message || "Error interno del servidor" });
  }
});

// Canjear licencia (Usuario)
app.post("/subscription/redeem", limiterSubscription, async (req, res) => {
  try {
    const { phoneNumber, licenseKey } = req.body;
    
    if (!phoneNumber || !licenseKey) {
      return res.status(400).json({ error: "Teléfono y código de licencia son requeridos" });
    }

    console.log(`🎟️ [Suscripción] Canjeando licencia ${licenseKey} para ${phoneNumber}`);
    const result = await subscriptionService.redeemLicense(phoneNumber, licenseKey);

    res.json(result);
  } catch (error) {
    console.error("❌ Error canjeando licencia:", error);
    // Devolver mensaje de error amigable si es posible
    res.status(400).json({ 
      success: false, 
      error: error.message || "Error canjeando licencia" 
    });
  }
});

// ⚠️ ENDPOINTS DE COACH FINANCIERO VIVO v1.1

// Endpoint de test del coach financiero - SOLO ADMIN
// (puede enviar WhatsApp real con dryRun=false y expone datos financieros)
app.get("/budget-test/:phone", requireAdmin, async (req, res) => {
  try {
    const { phone } = req.params;
    const profile = await budgetAlertService.getLivingFinancialProfile(phone);
    const summary = await budgetAlertService.getBudgetSummary(phone);

    const dryRun = req.query.dryRun !== 'false'; // por defecto NO envía WhatsApp
    let alertResult = null;

    if (!dryRun) {
      // Solo enviar WhatsApp si explicitamente pides dryRun=false
      alertResult = await budgetAlertService.evaluateAndAlertAfterExpense(phone);
    }

    res.json({
      success: true,
      phone,
      dryRun,
      profile,
      summaryText: summary,
      alertResult
    });
  } catch (error) {
    console.error('❌ Error en budget-test:', error);
    res.status(500).json({ success: false, error: error.message, stack: error.stack });
  }
});

// Endpoint admin: ejecutar revisión nocturna manualmente
app.post("/budget-review/run", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(401).json({ error: "No autorizado" });
    }
    console.log('🌙 [Admin] Ejecución manual de revisión nocturna presupuestos...');
    const result = await budgetAlertService.runNightlyBudgetReview();
    res.json({ success: true, result });
  } catch (error) {
    console.error('❌ Error ejecutando budget review:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- BROADCAST MESSAGES (ADMIN) ---

// Obtener todos los mensajes predefinidos - SOLO ADMIN
app.get("/admin/broadcast/templates", requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseService.supabase
      .from('admin_broadcast_messages')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Guardar nuevo mensaje predefinido - SOLO ADMIN
app.post("/admin/broadcast/templates", requireAdmin, async (req, res) => {
  try {
    const { title, content } = req.body;
    const { data, error } = await supabaseService.supabase
      .from('admin_broadcast_messages')
      .insert([{ title, content }])
      .select();

    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Eliminar mensaje predefinido - SOLO ADMIN
app.delete("/admin/broadcast/templates/:id", requireAdmin, async (req, res) => {
  try {
    const { error } = await supabaseService.supabase
      .from('admin_broadcast_messages')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Enviar mensaje a todos los usuarios
app.post("/admin/broadcast/send", async (req, res) => {
  const trackingId = Utils.generateTrackingId();
  try {
    if (!isAdmin(req)) {
      Utils.log("warn", `[${trackingId}] Intento de broadcast no autorizado`);
      return res.status(401).json({ error: "No autorizado" });
    }

    const { content, templateId } = req.body;
    
    if (!content) return res.status(400).json({ error: "El contenido es requerido" });

    Utils.log("info", `[${trackingId}] 📣 Iniciando solicitud de broadcast masivo`);

    // 1. Obtener todos los usuarios con suscripción activa
    const { data: users, error: userError } = await supabaseService.supabase
      .from('user_profiles')
      .select('phone_number, user_name')
      .eq('subscription_active', true);

    if (userError) {
      Utils.handleError(userError, `[${trackingId}] Error obteniendo usuarios para broadcast`);
      throw userError;
    }

    if (!users || users.length === 0) {
      Utils.log("info", `[${trackingId}] No hay usuarios activos para enviar broadcast`);
      return res.json({ success: true, sentCount: 0, message: "No hay usuarios activos" });
    }

    Utils.log("info", `[${trackingId}] Enviando broadcast a ${users.length} usuarios...`);

    // 2. Enviar mensajes uno por uno (o en grupos pequeños para evitar límites de rate)
    // Usamos un bucle secuencial o Promise.allSettled con logueo individual
    const results = await Promise.allSettled(users.map(async (u) => {
      try {
        if (!u.phone_number) {
          throw new Error(`Usuario sin número de teléfono: ${JSON.stringify(u)}`);
        }
        
        const cleanPhone = u.phone_number.replace(/[^0-9]/g, '');
        Utils.log("info", `[${trackingId}] Intentando enviar a ${cleanPhone}...`);
        
        const res = await whatsappService.sendMessage(cleanPhone, content);
        Utils.log("info", `[${trackingId}] ✅ Mensaje enviado exitosamente a ${cleanPhone}`);
        return res;
      } catch (err) {
        const errorData = err.response?.data || err.message;
        Utils.log("error", `[${trackingId}] ❌ Error enviando a ${u.phone_number}:`, errorData);
        throw err;
      }
    }));

    const sentCount = results.filter(r => r.status === 'fulfilled').length;
    const errorCount = results.filter(r => r.status === 'rejected').length;

    Utils.log("info", `[${trackingId}] Broadcast finalizado. Éxitos: ${sentCount}, Errores: ${errorCount}`);

    // 3. Actualizar estadísticas del template si existe
    if (templateId) {
      try {
        await supabaseService.supabase
          .from('admin_broadcast_messages')
          .update({ 
            last_sent_at: new Date().toISOString(),
            sent_count: sentCount
          })
          .eq('id', templateId);
      } catch (updateError) {
        Utils.handleError(updateError, `[${trackingId}] Error actualizando estadísticas de plantilla`);
      }
    }

    res.json({ 
      success: true, 
      sentCount, 
      totalUsers: users.length,
      errors: errorCount,
      details: results.filter(r => r.status === 'rejected').map(r => r.reason?.response?.data || r.reason?.message)
    });
  } catch (error) {
    Utils.handleError(error, `[${trackingId}] Error crítico en broadcast`);
    res.status(500).json({ error: error.message });
  }
});

// Chat demo para el frontend (4-5 mensajes)
app.post("/chat/demo", limiterChatDemo, async (req, res) => {
  try {
    const { message, sessionId, userProfile } = req.body;
    
    if (!message || !sessionId) {
      return res.status(400).json({ error: "Mensaje y sessionId son requeridos" });
    }

    // Perfil de prueba para el demo (o usar el del usuario si está logueado)
    const demoProfile = userProfile || {
      user_name: "Usuario Demo",
      monthly_salary: 2000,
      currency: "USD",
      fixed_expenses: 800,
      country: "DemoLand"
    };

    // Usar un ID de usuario especial para el demo para no mezclar con WhatsApp
    const demoUserId = `demo:${sessionId}`;

    console.log(`💬 [Demo Chat] Mensaje de ${demoUserId}: ${message.substring(0, 50)}...`);

    const response = await openaiService.generateResponse(demoUserId, message, demoProfile);
    
    console.log(`🤖 [Demo Chat] Respuesta generada con éxito para ${demoUserId}`);

    res.json({
      success: true,
      response: response
    });
  } catch (error) {
    console.error("❌ [Demo Chat] Error fatal:", error);
    res.status(500).json({ 
      error: "Error procesando el chat demo",
      details: error.message 
    });
  }
});

// ============================================================
// FYN FINANCIAL HEALTH SCORE - ENDPOINTS USUARIO
// ============================================================

function validateAnswers10(answers) {
  if (!answers || typeof answers !== 'object') return false;
  for (let q = 1; q <= 10; q++) {
    const val = Number(answers[String(q)]);
    if (Number.isNaN(val) || val < 0 || val > 4) return false;
  }
  return true;
}

// Obtener último score del usuario (identidad viene del JWT de Supabase Auth)
app.get("/user/financial-health", requireUserAuth, requireOwnData, async (req, res) => {
  try {
    const phone = req.query.phone ? String(req.query.phone) : (req.user.phone || null);
    const userId = req.query.user_id ? String(req.query.user_id) : (req.user.id || null);

    const score = await supabaseService.getFinancialHealthScore({
      phoneNumber: phone,
      userId
    });

    if (!score) {
      return res.json({
        success: true,
        hasScore: false,
        score: null
      });
    }

    res.json({
      success: true,
      hasScore: true,
      score: {
        id: score.id,
        score: score.score,
        level: score.level,
        total_points: score.total_points,
        category_breakdown: score.category_breakdown,
        answers: score.answers,
        attempt_count: score.attempt_count,
        created_at: score.created_at
      }
    });
  } catch (error) {
    console.error("❌ [User] Error obteniendo score:", error);
    res.status(500).json({ error: error.message || "Error obteniendo score" });
  }
});

// Guardar nuevo score (incrementa attempt_count automáticamente; identidad del JWT)
app.post("/user/financial-health", requireUserAuth, requireOwnData, async (req, res) => {
  try {
    const { answers } = req.body || {};
    const phone = req.body?.phone ? String(req.body.phone) : (req.user.phone || null);
    const userId = req.body?.user_id ? String(req.body.user_id) : (req.user.id || null);

    if (!validateAnswers10(answers)) {
      return res.status(400).json({
        error: "Respuestas inválidas. Deben ser 10 preguntas con valores de 0 a 4 puntos."
      });
    }

    const saved = await supabaseService.saveFinancialHealthScore({
      phoneNumber: phone,
      userId,
      answers
    });

    res.json({
      success: true,
      message: "Score guardado correctamente",
      score: {
        id: saved.id,
        score: saved.score,
        level: saved.level,
        total_points: saved.total_points,
        category_breakdown: saved.category_breakdown,
        answers: saved.answers,
        attempt_count: saved.attempt_count,
        created_at: saved.created_at
      }
    });
  } catch (error) {
    console.error("❌ [User] Error guardando score:", error);
    res.status(500).json({ error: error.message || "Error guardando score" });
  }
});

// Admin: obtener scores de todos los usuarios
app.get("/admin/financial-health", async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(401).json({ error: "No autorizado" });

    const { data, error } = await supabaseService.supabase
      .from("financial_health_scores")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({ success: true, count: (data || []).length, scores: data || [] });
  } catch (error) {
    console.error("❌ [Admin] Error obteniendo scores:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// ENDPOINT UNIFICADO: Dashboard Financiero (con consolidación de perfiles)
// Resuelve el bug: gastos del chatbot no se reflejan en el dashboard web
// ============================================================
app.get("/user/financial-dashboard", requireUserAuth, requireOwnData, async (req, res) => {
  try {
    // Identidad autoritativa: el JWT. Los params sirven solo para cruzar teléfono/email propios.
    const user_id = req.query.user_id ? String(req.query.user_id) : (req.user.id || null);
    const phone = req.query.phone ? String(req.query.phone) : (req.user.phone || null);
    const email = req.query.email ? String(req.query.email) : (req.user.email || null);

    const phoneNorm = normalizeDigits(phone);

    // 1. OBTENER TODOS LOS PERFILES COINCIDENTES (desduplicación robusta)
    let allProfiles = [];
    const seenIds = new Set();

    // Búsqueda por user_id
    if (user_id) {
      const { data } = await supabaseService.supabase
        .from("user_profiles")
        .select("*")
        .eq("id", String(user_id))
        .maybeSingle();
      if (data && !seenIds.has(data.id)) {
        seenIds.add(data.id);
        allProfiles.push(data);
      }
    }

    // Búsqueda por email
    if (email) {
      const { data } = await supabaseService.supabase
        .from("user_profiles")
        .select("*")
        .eq("email", String(email));
      (data || []).forEach(p => {
        if (!seenIds.has(p.id)) { seenIds.add(p.id); allProfiles.push(p); }
      });
    }

    // Búsqueda por phone normalizado (el más importante para unificar chatbot + web).
    // Filtro en BD (los perfiles se escriben con phone_number ya normalizado a dígitos),
    // evitando traer toda la tabla para filtrar en memoria.
    if (phoneNorm) {
      const { data: allPhoneRows } = await supabaseService.supabase
        .from("user_profiles")
        .select("*")
        .eq("phone_number", phoneNorm);
      (allPhoneRows || []).forEach(p => {
        if (!seenIds.has(p.id)) {
          seenIds.add(p.id);
          allProfiles.push(p);
        }
      });
    }

    // Si por lo menos tenemos user_id pero no encontramos perfiles, añadirlo como placeholder
    if (allProfiles.length === 0 && user_id) {
      allProfiles.push({ id: String(user_id) });
    }

    console.log(`📊 [Dashboard] Perfiles consolidados: ${allProfiles.length} IDs:`, [...seenIds]);

    // 2. OBTENER EL MEJOR PERFIL PARA DATOS BÁSICOS (el que tenga más información)
    allProfiles.sort((a, b) => {
      const scoreA = (a.monthly_salary ? 1 : 0) + (a.fixed_expenses ? 1 : 0) + (a.currency ? 1 : 0);
      const scoreB = (b.monthly_salary ? 1 : 0) + (b.fixed_expenses ? 1 : 0) + (b.currency ? 1 : 0);
      return scoreB - scoreA;
    });
    const bestProfile = allProfiles[0] || {};
    const allUserIds = allProfiles.map(p => p.id);

    // 3. CALCULAR GASTOS DEL MES ACTUAL (TODOS LOS PERFILES CONSOLIDADOS)
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    let gastosMes = 0;
    let ingresosMes = 0;
    const detalleGastos = [];

    if (allUserIds.length > 0) {
      // ⚠️ select SIN la columna "category": el esquema de `transactions` solo tiene
      // `category_id` (o NULL). Pedir `category` hacía fallar la query y gastosMes salía 0.
      const { data: txs } = await supabaseService.supabase
        .from("transactions")
        .select("amount, transaction_type, date, description, category_id, user_id")
        .in("user_id", allUserIds)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: false });

      (txs || []).forEach(t => {
        const amt = Number(t.amount) || 0;
        if (t.transaction_type === 'expense') {
          gastosMes += amt;
          detalleGastos.push(t);
        } else if (t.transaction_type === 'income') {
          ingresosMes += amt;
        }
      });

      console.log(`💰 [Dashboard] Transacciones mes ${month}/${year}: ${txs?.length || 0} | Gastos: ${gastosMes} | Ingresos: ${ingresosMes}`);
    }

    // 4. DATOS DEL PERFIL
    const sueldo = Number(bestProfile.monthly_salary) || 0;
    const gastosFijos = Number(bestProfile.fixed_expenses) || 0;
    const moneda = String(bestProfile.currency || 'COP');
    const phoneFinal = bestProfile.phone_number || (phoneNorm || '');
    const referralCode = bestProfile.referral_code || '';
    const subscriptionActive = Boolean(bestProfile.subscription_active || false);
    const subscriptionEndDate = bestProfile.subscription_end_date || null;

    const responsePayload = {
      success: true,
      consolidatedProfiles: allProfiles.length,
      userIds: allUserIds,
      profile: {
        sueldo,
        gastosFijos,
        gastosMes,
        ingresosMes,
        balance: sueldo - gastosFijos - gastosMes,
        moneda,
        phone: phoneFinal,
        referralCode,
        email: bestProfile.email || (email ? String(email) : null),
        subscriptionActive,
        subscriptionEndDate,
        healthScore: bestProfile.financial_health_score ?? null,
        healthLevel: bestProfile.financial_health_level ?? null,
        healthUpdatedAt: bestProfile.financial_health_updated_at ?? null,
        user_name: bestProfile.user_name || ''
      },
      detalleGastos: detalleGastos.slice(0, 50)
    };

    console.log(`✅ [Dashboard] Payload consolidado enviado. Balance: ${responsePayload.profile.balance} ${moneda}`);
    res.json(responsePayload);
  } catch (error) {
    console.error("❌ [Dashboard] Error obteniendo datos financieros:", error);
    res.status(500).json({ error: error.message || "Error obteniendo dashboard" });
  }
});

// ⚠️ Exportar DESPUÉS de definir todas las rutas
module.exports = app;

// Iniciar servidor solo si no está en Lambda
if (require.main === module) {
  const PORT = config.port || 3000;
  app.listen(PORT, () => {
    console.log(`✅ Servidor iniciado en puerto ${PORT}`);
    console.log(`🌐 Webhook URL: http://localhost:${PORT}/webhook`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`\n💡 Para usar con ngrok, ejecuta: ngrok http ${PORT}`);
  });
}
