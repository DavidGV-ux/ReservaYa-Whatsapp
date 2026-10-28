// tests/validate-flow.js - Validación integral del flujo: Pago -> Acceso -> IA -> Respuesta
require('dotenv').config();
const createPostgrestClient = require("../Services/postgrestClient");
const config = require('../config');
const supabaseService = require('../Services/supabaseService');
const subscriptionService = require('../Services/subscriptionService');
const openaiService = require('../Services/openaiService');

async function validateFlow() {
  const supabase = createPostgrestClient();
  const testPhone = '573000000000';
  const testEmail = 'test-flow@fyn.ai';

  console.log('🚀 INICIANDO VALIDACIÓN INTEGRAL DEL FLUJO FYN...');
  console.log('--------------------------------------------------');

  try {
    // 1. LIMPIEZA / PREPARACIÓN
    console.log('🧹 1. Preparando entorno de prueba...');
    await supabase.from('user_profiles').delete().eq('phone_number', testPhone);
    await supabase.from('license_keys').delete().eq('activated_by', testPhone);
    
    // Crear perfil inicial (simulando registro)
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .insert({
        phone_number: testPhone,
        email: testEmail,
        user_name: 'Usuario de Prueba',
        subscription_active: false
      })
      .select()
      .single();

    if (profileError) throw profileError;
    console.log('✅ Perfil de prueba creado (Suscripción: Inactiva)');

    // 2. PAGO (Simulación de canje de código de licencia)
    console.log('\n💳 2. Validando etapa de PAGO (Canje de licencia)...');
    
    // Generar código desde el servicio de admin
    const key = await supabaseService.getAvailableLicenseKey();
    console.log(`🔑 Código generado: ${key.key_code}`);

    // Canjear código (esto activa la suscripción)
    const redeemResult = await subscriptionService.redeemLicense(testPhone, key.key_code);
    console.log(`✅ Resultado del canje: ${redeemResult.message}`);

    // 3. ACCESO (Verificación de permisos)
    console.log('\n🔐 3. Validando etapa de ACCESO...');
    const accessStatus = await subscriptionService.isSubscriptionActive(testPhone);
    
    if (accessStatus.isActive) {
      console.log(`✅ Acceso concedido. Días restantes: ${accessStatus.daysRemaining}`);
    } else {
      throw new Error('❌ Error: El acceso debería estar activo después del canje');
    }

    // 4. IA -> RESPUESTA (Procesamiento y feedback)
    console.log('\n🤖 4. Validando etapa de IA -> RESPUESTA...');
    const testMessage = 'Hola Fyn, quiero registrar un gasto de 500 pesos en comida hoy.';
    
    const response = await openaiService.generateResponse(testPhone, testMessage, profile);
    
    if (response && response.length > 0) {
      console.log('✅ IA respondió correctamente:');
      console.log(`   > "${response.substring(0, 100)}..."`);
    } else {
      throw new Error('❌ Error: La IA no generó una respuesta válida');
    }

    console.log('\n--------------------------------------------------');
    console.log('✨ VALIDACIÓN COMPLETADA EXITOSAMENTE');
    console.log('Flujo validado: PAGO (OK) -> ACCESO (OK) -> IA (OK) -> RESPUESTA (OK)');

  } catch (error) {
    console.error('\n❌ ERROR EN LA VALIDACIÓN DEL FLUJO:', error.message);
    process.exit(1);
  }
}

validateFlow();
