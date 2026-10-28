// config.js - ADAPTADO PARA AWS LAMBDA
if (process.env.NODE_ENV !== 'production') {
  require("dotenv").config();
}

module.exports = {
  // Servidor
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || "development",

  // WhatsApp
  whatsapp: {
    apiUrl: process.env.WHATSAPP_API_URL,
    phoneId: process.env.WHATSAPP_PHONE_ID,
    token: process.env.WHATSAPP_TOKEN,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    // App Secret de Meta para verificar la firma X-Hub-Signature-256 del webhook
    // Se obtiene en Meta Developers > Tu App > App settings > Basic > App secret
    appSecret: process.env.WHATSAPP_APP_SECRET || "",
  },

  // Admin
  adminSecret: process.env.ADMIN_SECRET || "",

  // Groq AI (más rápido y económico)
  groq: {
    apiKey: process.env.GROQ_API_KEY || "",
    // llama-3.3-70b-versatile: Modelo versátil y potente de Groq
    model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    // Optimización de tokens
    maxTokens: parseInt(process.env.GROQ_MAX_TOKENS) || 150, // Respuestas cortas para WhatsApp
    temperature: parseFloat(process.env.GROQ_TEMPERATURE) || 0.5, // Más determinístico = menos tokens
    maxHistoryMessages: parseInt(process.env.GROQ_MAX_HISTORY) || 6, // Solo últimas 6 interacciones
  },

  // Supabase
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
    // JWT Secret para verificar tokens de Supabase Auth (HS256) de forma offline.
    // Se obtiene en Supabase Dashboard > Settings > API > JWT Secret.
    jwtSecret: process.env.SUPABASE_JWT_SECRET || "",
  },

  // Make
  make: {
    // Sin fallback: si no está configurado, el envío se omite (guard en makeService).
    webhookUrl: process.env.MAKE_WEBHOOK_URL || "",
  },

  // CORS: solo los orígenes de la app pueden leer respuestas del API.
  // Lista separada por comas (la app Angular se sirve desde CloudFront).
  cors: {
    allowedOrigins: (process.env.CORS_ORIGINS || [
      "https://d133uvy2su9xyr.cloudfront.net",
      "http://localhost:4200",
      "http://localhost:3000",
      "https://localhost:4200",
    ].join(",")).split(",").map((s) => s.trim()).filter(Boolean),
  },

  // Redis - SOLO PARA CACHÉ (sin colas en Lambda)
  redis: {
    enabled: process.env.REDIS_ENABLED === "true",
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    tls: process.env.REDIS_TLS === "true" ? {
      rejectUnauthorized: false
    } : undefined,
  }
};
