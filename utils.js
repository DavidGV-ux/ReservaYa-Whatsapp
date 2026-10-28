const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

class Utils {
  // Formatear número de teléfono
  static formatPhoneNumber(phone) {
    // Remover caracteres no numéricos
    const cleaned = phone.replace(/\D/g, '');

    // Si no tiene código de país, agregar código por defecto
    if (cleaned.length === 10) {
      return `52${cleaned}`; // Código de México
    }

    return cleaned;
  }

  // Validar que el mensaje no esté vacío
  static isValidMessage(message) {
    return message && typeof message === 'string' && message.trim().length > 0;
  }

  // Crear logs con timestamp
  static log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    console.log(logMessage);

    if (data) {
      console.log('Data:', JSON.stringify(data, null, 2));
    }

    // Opcional: guardar logs en archivo
    this.saveLogToFile(level, message, data);
  }

  // Guardar logs en archivo
static saveLogToFile(level, message, data = null) {
  // ❌ DESHABILITAR EN LAMBDA
  if (process.env.NODE_ENV === 'production') {
    return; // No guardar logs en archivos en Lambda
  }

  try {
    const logsDir = path.join(__dirname, 'logs');

    // Crear directorio de logs si no existe
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString();
    const date = timestamp.split('T')[0];
    const logFile = path.join(logsDir, `chatbot-${date}.log`);

    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      data: data || null
    };

    const logLine = JSON.stringify(logEntry) + '\n';

    fs.appendFileSync(logFile, logLine, 'utf8');
  } catch (error) {
    // No mostrar error en producción
    if (process.env.NODE_ENV !== 'production') {
      console.error('Error guardando log:', error.message);
    }
  }
}


  // Manejar errores de manera consistente
  static handleError(error, context = 'Unknown') {
    const errorInfo = {
      context,
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    };

    this.log('error', `Error en ${context}`, errorInfo);

    return {
      success: false,
      error: error.message,
      context
    };
  }

  // Validar estructura de mensaje de WhatsApp
  static validateWhatsAppMessage(body) {
    if (!body || !body.entry || !body.entry[0]) {
      return { valid: false, error: 'Estructura de mensaje inválida' };
    }

    const entry = body.entry[0];
    if (!entry.changes || !entry.changes[0]) {
      return { valid: false, error: 'No hay cambios en el mensaje' };
    }

    const changes = entry.changes[0];
    if (!changes.value) {
      return { valid: false, error: 'No hay valor en el cambio' };
    }

    const value = changes.value;
    if (!value.messages || !value.messages[0]) {
      return { valid: false, error: 'No hay mensajes' };
    }

    return { valid: true };
  }

  // Extraer información del mensaje de WhatsApp
  static extractMessageInfo(body) {
    try {
      const entry = body.entry[0];
      const changes = entry.changes[0];
      const value = changes.value;
      const message = value.messages[0];

      // Extraer información de imagen si existe
      const imageInfo = message.image ? {
        imageId: message.image.id,
        mimeType: message.image.mime_type,
        sha256: message.image.sha256,
        caption: message.image.caption || ''
      } : null;

      return {
        from: message.from,
        messageId: message.id,
        timestamp: message.timestamp,
        messageBody: message.text?.body || '',
        messageType: message.type || 'text',
        userName: value.contacts[0]?.profile?.name || 'Usuario',
        userWaId: value.contacts[0]?.wa_id || message.from,
        imageInfo: imageInfo
      };
    } catch (error) {
      throw new Error(`Error extrayendo información del mensaje: ${error.message}`);
    }
  }

  // Limpiar texto para IA
  static sanitizeTextForAI(text) {
    if (!text || typeof text !== 'string') return '';

    // Remover caracteres especiales que podrían causar problemas
    return text
      .trim()
      .replace(/[^\w\s\u00C0-\u017F\u0100-\u024F¿?¡!.,;:()\-]/g, '') // Permitir caracteres especiales del español
      .substring(0, 1000); // Limitar longitud
  }

  // Formatear respuesta para WhatsApp
  static formatResponseForWhatsApp(text) {
    if (!text) return '';

    // WhatsApp tiene límite de 4096 caracteres por mensaje
    if (text.length > 4000) {
      return text.substring(0, 3997) + '...';
    }

    return text;
  }

  // Verificar si el usuario está en lista negra (opcional)
  static isUserBlocked(userId) {
    // Implementar lógica de lista negra si es necesaria
    const blockedUsers = process.env.BLOCKED_USERS ?
      process.env.BLOCKED_USERS.split(',') : [];

    return blockedUsers.includes(userId);
  }

  // Generar ID único para tracking
  static generateTrackingId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Comparación segura de strings (a prueba de timing attacks)
  static safeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  /**
   * Verificar la firma X-Hub-Signature-256 del webhook de WhatsApp.
   * La firma es HMAC-SHA256 del body crudo, keyed con el App Secret de Meta.
   * @param {Buffer|string} rawBody - body crudo recibido
   * @param {string} signatureHeader - valor del header 'x-hub-signature-256'
   * @param {string} secret - WhatsApp App Secret
   * @returns {boolean}
   */
  static verifyWhatsAppSignature(rawBody, signatureHeader, secret) {
    if (!secret) {
      this.log('error', 'WHATSAPP_APP_SECRET no configurado. La firma del webhook NO se está verificando. Configura el App Secret de Meta en produccion para activar la validacion.');
      return true; // Transicional: si no hay secret, no bloquear
    }

    if (!signatureHeader || typeof signatureHeader !== 'string') {
      return false;
    }
    if (!rawBody) {
      return false;
    }
    if (!signatureHeader.startsWith('sha256=')) {
      return false;
    }

    const provided = signatureHeader.slice('sha256='.length).trim();

    // IMPORTANTE: el body debe ser el crudo (no modificado) tal como llego.
    const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
    const expected = crypto.createHmac('sha256', secret).update(bodyBuffer).digest('hex');

    try {
      return this.safeEqual(expected, provided);
    } catch (error) {
      return false;
    }
  }

  /**
   * Verificar un JWT HS256 (estándar de Supabase Auth) sin llamadas de red.
   * Valida firma (HMAC-SHA256), algoritmo, expiración y presencia de 'sub'.
   * @param {string} token - JWT completo (header.payload.signature)
   * @param {string} secret - SUPABASE_JWT_SECRET (clave HS256 del proyecto)
   * @returns {object|null} payload si es válido, null en cualquier otro caso
   */
  static verifyJwt(token, secret) {
    if (!token || typeof token !== 'string') return null;
    if (!secret) {
      this.log('error', 'SUPABASE_JWT_SECRET no configurado. Los endpoints protegidos con JWT estan bloqueados (fail-closed). Configura el JWT Secret de Supabase en produccion.');
      return null;
    }

    const parts = token.split('.');
    if (parts.length !== 3) return null;

    try {
      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));

      if (header.alg !== 'HS256') return null;
      if (!payload.sub || typeof payload.sub !== 'string') return null;

      // Verificar expiración
      if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null;

      // Verificar firma (HMAC del material firmado: header.payload)
      const expected = crypto.createHmac('sha256', secret)
        .update(`${parts[0]}.${parts[1]}`)
        .digest();
      const provided = Buffer.from(parts[2], 'base64url');

      if (provided.length !== expected.length) return null;
      if (!crypto.timingSafeEqual(provided, expected)) return null;

      return payload;
    } catch (error) {
      return null;
    }
  }

  // Validar configuración al inicio
  static validateConfig(config) {
    const required = [
      'whatsapp.token',
      'whatsapp.phoneId',
      'whatsapp.verifyToken',
      'google.apiKey',
      'supabase.url',
      'supabase.key'
    ];

    const missing = [];

    for (const key of required) {
      const value = this.getNestedValue(config, key);
      if (!value) {
        missing.push(key);
      }
    }

    if (missing.length > 0) {
      throw new Error(`Configuración faltante: ${missing.join(', ')}`);
    }

    this.log('info', 'Configuración validada correctamente');
    return true;
  }

  // Obtener valor anidado de objeto
  static getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : null;
    }, obj);
  }

  // Crear respuesta de error estándar
  static createErrorResponse(message, code = 'GENERAL_ERROR', details = null) {
    return {
      success: false,
      error: {
        message,
        code,
        details,
        timestamp: new Date().toISOString()
      }
    };
  }

  // Crear respuesta de éxito estándar
  static createSuccessResponse(data = null, message = 'Operación exitosa') {
    return {
      success: true,
      message,
      data,
      timestamp: new Date().toISOString()
    };
  }

  // Retry con backoff exponencial
  static async retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
    let lastError;

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (i === maxRetries - 1) {
          break; // Último intento fallido
        }

        const delay = baseDelay * Math.pow(2, i);
        this.log('warn', `Intento ${i + 1} falló, reintentando en ${delay}ms`, { error: error.message });

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  // Verificar salud de los servicios
  static async healthCheck() {
    const health = {
      timestamp: new Date().toISOString(),
      services: {}
    };

    // Verificar Google Gemini (básico)
    try {
      if (process.env.GOOGLE_API_KEY || config.google?.apiKey) {
        health.services.google = { status: 'configured', message: 'API Key presente' };
      } else {
        health.services.google = { status: 'error', message: 'API Key faltante' };
      }
    } catch (error) {
      health.services.google = { status: 'error', message: error.message };
    }

    // Verificar Supabase (básico)
    try {
      if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
        health.services.supabase = { status: 'configured', message: 'Credenciales presentes' };
      } else {
        health.services.supabase = { status: 'error', message: 'Credenciales faltantes' };
      }
    } catch (error) {
      health.services.supabase = { status: 'error', message: error.message };
    }

    // Verificar WhatsApp (básico)
    try {
      if (process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID) {
        health.services.whatsapp = { status: 'configured', message: 'Credenciales presentes' };
      } else {
        health.services.whatsapp = { status: 'error', message: 'Credenciales faltantes' };
      }
    } catch (error) {
      health.services.whatsapp = { status: 'error', message: error.message };
    }

    return health;
    try {
      const searchService = require('./Services/searchService');
      const stats = searchService.getStats();
      health.services.search = { 
        status: 'ok',
        cacheSize: stats.cacheSize,
        cacheTTL: `${stats.cacheTTL_minutes} min`
      };
    } catch (error) {
      health.services.search = { status: 'error', message: error.message };
    }
  
    return health;
  
  }

  /**
   * Rate limiter en memoria (ventana fija por IP + clave).
   * En Lambda el limite es por instancia; aun asi frena abuso basico.
   * @param {{windowMs?: number, max?: number, keyFn?: Function}} options
   * @returns {Function} middleware express
   */
  static createRateLimiter({ windowMs = 60000, max = 60, keyFn = null } = {}) {
    const hits = new Map();

    setInterval(() => {
      const now = Date.now();
      for (const [key, timestamps] of hits) {
        const valid = timestamps.filter(t => now - t < windowMs);
        if (valid.length === 0) hits.delete(key);
        else hits.set(key, valid);
      }
    }, windowMs).unref();

    return (req, res, next) => {
      const key = `${(keyFn ? keyFn(req) : (req.ip || 'unknown'))}:${req.path}`;
      const now = Date.now();
      const timestamps = (hits.get(key) || []).filter(t => now - t < windowMs);

      if (timestamps.length >= max) {
        res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
        return res.status(429).json({ error: 'Too many requests, please try again later.' });
      }

      timestamps.push(now);
      hits.set(key, timestamps);
      next();
    };
  }
  
}

module.exports = Utils;
