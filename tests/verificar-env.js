// Script para verificar que el .env está configurado correctamente
// IMPORTANTE: Cargar .env SIEMPRE, independientemente de NODE_ENV
const path = require('path');
const result = require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });

// Debug: verificar si se cargó el .env
if (result.error) {
  console.error('⚠️  Error cargando .env:', result.error);
} else {
  console.log('✅ Archivo .env cargado correctamente\n');
}

// Leer variables directamente de process.env después de cargar dotenv
const env = process.env;

// Crear objeto config simulado para compatibilidad
const config = {
  whatsapp: {
    apiUrl: env.WHATSAPP_API_URL,
    phoneId: env.WHATSAPP_PHONE_ID,
    token: env.WHATSAPP_TOKEN,
    verifyToken: env.WHATSAPP_VERIFY_TOKEN,
  },
  groq: {
    apiKey: env.GROQ_API_KEY || "",
    model: env.GROQ_MODEL || "llama-3.3-70b-versatile",
    maxTokens: parseInt(env.GROQ_MAX_TOKENS) || 150,
    temperature: parseFloat(env.GROQ_TEMPERATURE) || 0.5,
    maxHistoryMessages: parseInt(env.GROQ_MAX_HISTORY) || 6,
  },
  supabase: {
    url: env.SUPABASE_URL,
    key: env.SUPABASE_KEY,
  },
  make: {
    webhookUrl: env.MAKE_WEBHOOK_URL || "https://hook.us2.make.com/TU_WEBHOOK_ID",
  },
  redis: {
    enabled: env.REDIS_ENABLED === "true",
    host: env.REDIS_HOST || "localhost",
    port: parseInt(env.REDIS_PORT) || 6379,
    password: env.REDIS_PASSWORD || undefined,
    tls: env.REDIS_TLS === "true",
  },
  nodeEnv: env.NODE_ENV || "development",
};

console.log('🔍 Verificando configuración del .env...\n');

const errores = [];
const advertencias = [];
const exitos = [];

// Verificar variables críticas
const variablesCriticas = {
  'WHATSAPP_API_URL': config.whatsapp?.apiUrl,
  'WHATSAPP_PHONE_ID': config.whatsapp?.phoneId,
  'WHATSAPP_TOKEN': config.whatsapp?.token,
  'WHATSAPP_VERIFY_TOKEN': config.whatsapp?.verifyToken,
  'GROQ_API_KEY': config.groq?.apiKey,
  'SUPABASE_URL': config.supabase?.url,
  'SUPABASE_KEY': config.supabase?.key,
};

console.log('📋 Variables Críticas:');
console.log('─'.repeat(50));

for (const [nombre, valor] of Object.entries(variablesCriticas)) {
  if (!valor || valor === '' || valor.includes('REEMPLAZA')) {
    errores.push(`❌ ${nombre}: NO CONFIGURADA o tiene valor placeholder`);
  } else {
    // Ocultar valores sensibles pero mostrar que están configurados
    const valorOculto = nombre.includes('TOKEN') || nombre.includes('KEY') 
      ? `${valor.substring(0, 8)}...${valor.substring(valor.length - 4)}`
      : valor;
    exitos.push(`✅ ${nombre}: ${valorOculto}`);
  }
}

// Verificar modelo de Groq
console.log('\n🤖 Configuración de Groq:');
console.log('─'.repeat(50));

const modeloGroq = config.groq?.model || 'NO CONFIGURADO';
if (modeloGroq === 'groq/compound') {
  exitos.push(`✅ GROQ_MODEL: ${modeloGroq} (correcto)`);
} else if (modeloGroq.includes('llama')) {
  advertencias.push(`⚠️  GROQ_MODEL: ${modeloGroq} (no es groq/compound)`);
} else {
  errores.push(`❌ GROQ_MODEL: ${modeloGroq} (valor inválido)`);
}

console.log(`   Modelo: ${modeloGroq}`);
console.log(`   Max Tokens: ${config.groq?.maxTokens || 150}`);
console.log(`   Temperature: ${config.groq?.temperature || 0.5}`);
console.log(`   Max History: ${config.groq?.maxHistoryMessages || 6}`);

// Verificar NODE_ENV
console.log('\n🌍 Entorno:');
console.log('─'.repeat(50));
const nodeEnv = config.nodeEnv || process.env.NODE_ENV;
if (nodeEnv === 'production') {
  exitos.push(`✅ NODE_ENV: ${nodeEnv} (correcto para producción)`);
} else {
  advertencias.push(`⚠️  NODE_ENV: ${nodeEnv} (debería ser 'production' para AWS)`);
}
console.log(`   NODE_ENV: ${nodeEnv}`);

// Verificar variables opcionales
console.log('\n📦 Variables Opcionales:');
console.log('─'.repeat(50));
const makeUrl = config.make?.webhookUrl;
if (makeUrl && !makeUrl.includes('REEMPLAZA')) {
  exitos.push(`✅ MAKE_WEBHOOK_URL: Configurado`);
} else {
  advertencias.push(`⚠️  MAKE_WEBHOOK_URL: No configurado (opcional)`);
}

const redisEnabled = config.redis?.enabled;
console.log(`   REDIS_ENABLED: ${redisEnabled}`);
if (redisEnabled) {
  advertencias.push(`⚠️  Redis está habilitado - verifica configuración si lo usas`);
}

// Resumen
console.log('\n' + '='.repeat(50));
console.log('📊 RESUMEN');
console.log('='.repeat(50));

if (exitos.length > 0) {
  console.log('\n✅ Exitos:');
  exitos.forEach(msg => console.log(`   ${msg}`));
}

if (advertencias.length > 0) {
  console.log('\n⚠️  Advertencias:');
  advertencias.forEach(msg => console.log(`   ${msg}`));
}

if (errores.length > 0) {
  console.log('\n❌ Errores (DEBES CORREGIR):');
  errores.forEach(msg => console.log(`   ${msg}`));
  console.log('\n💡 Acción requerida:');
  console.log('   1. Abre el archivo .env');
  console.log('   2. Reemplaza los valores que dicen "REEMPLAZA_CON_TU_..."');
  console.log('   3. Obtén los valores desde AWS Lambda Console');
  console.log('   4. Ejecuta este script nuevamente: node verificar-env.js');
  process.exit(1);
} else {
  console.log('\n✅ ¡Configuración correcta! El .env está listo para usar.');
  console.log('\n💡 Próximos pasos:');
  console.log('   1. Verifica que los valores sean correctos');
  console.log('   2. Haz deploy: serverless deploy --stage dev');
  process.exit(0);
}

