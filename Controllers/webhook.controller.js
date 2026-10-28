
const whatsappService = require("../services/whatsapp.service");
const openaiService = require("../services/openai.service");
const supabaseService = require("../services/supabase.service");
const makeService = require("../services/make.service");
const profileUpdateService = require("../Services/profileUpdateService");

async function handleWebhook(req, res) {
  try {
    const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    
    if (!message) {
      return res.sendStatus(200);
    }

    const userPhone = message.from;
    const userMessage = message.text?.body;

    if (!userMessage) {
      return res.sendStatus(200);
    }

    // 1. Obtener datos existentes del usuario
    const currentUserData = await supabaseService.getUserData(userPhone);

    // 1.1 Verificar si hay actualizaciones pendientes (flujo de preguntas/respuestas o correcciones)
    const pendingResult = await profileUpdateService.processPendingUpdate(userPhone, userMessage, currentUserData);
    if (pendingResult.processed) {
      // Si se procesó una actualización pendiente, ya se envió respuesta por WhatsApp
      // Guardar mensaje del usuario para historial (opcional pero recomendado)
      await supabaseService.saveMessage(
        userPhone,
        currentUserData?.user_name || 'Usuario',
        userMessage,
        pendingResult.success ? "Procesado exitosamente" : "Error procesando",
        new Date().toISOString()
      );
      return res.sendStatus(200);
    }

    // 1.2 Verificar si es una intención de cambio de perfil o corrección nueva
    const profileChangeResult = await profileUpdateService.handleProfileChange(userPhone, userMessage, currentUserData);
    if (profileChangeResult.handled) {
      // Si se manejó como cambio de perfil (ya sea actualización directa o inicio de flujo)
      await supabaseService.saveMessage(
        userPhone,
        currentUserData?.user_name || 'Usuario',
        userMessage,
        "Actualización de perfil/corrección procesada",
        new Date().toISOString()
      );
      return res.sendStatus(200);
    }

    // 2. Extraer nuevos datos del mensaje (Flujo normal con IA)
    const extractedData = await openaiService.extractUserData(
      userMessage,
      currentUserData
    );

    // 2.1 Guardar transacción si se detectó
    if (extractedData.transaction) {
      console.log("💰 Transacción detectada:", extractedData.transaction);
      await supabaseService.saveTransaction(userPhone, extractedData.transaction);
      // Eliminar transaction del objeto para no confundir a la actualización de perfil
      delete extractedData.transaction;
    }

    // 2.2 Actualizar perfil si hay nuevos datos
    if (Object.keys(extractedData).length > 0) {
      if (currentUserData && currentUserData.id) {
        // Optimización: Actualizar por ID (UUID) si ya lo tenemos
        await supabaseService.updateUserProfileById(currentUserData.id, extractedData);
      } else {
        await supabaseService.updateUserProfile(userPhone, extractedData);
      }
      // Actualizar datos locales para la respuesta
      Object.assign(currentUserData, extractedData);
    }

    // 3. Generar respuesta con OpenAI
    const aiResponse = await openaiService.generateResponse(
      userPhone,
      userMessage,
      currentUserData
    );

    // 4. Guardar en Supabase
    await supabaseService.saveMessage(
      userPhone,
      currentUserData?.user_name || 'Usuario',
      userMessage,
      aiResponse,
      new Date().toISOString()
    );

    // 5. Enviar respuesta por WhatsApp
    await whatsappService.sendMessage(userPhone, aiResponse);

    // 6. Enviar a Make (opcional)
    await makeService.sendToMake({
      telefono: userPhone,
      mensaje: userMessage,
      respuesta: aiResponse,
      userData: extractedData,
      timestamp: new Date().toISOString(),
    });

    res.sendStatus(200);
  } catch (error) {
    console.error("Error en webhook:", error);
    res.sendStatus(500);
  }
}

// Función para verificar el webhook (WhatsApp requiere esto)
function verifyWebhook(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  const whatsappService = require("../services/whatsapp.service");

  if (whatsappService.verifyWebhook(mode, token)) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
}

module.exports = { handleWebhook, verifyWebhook };
