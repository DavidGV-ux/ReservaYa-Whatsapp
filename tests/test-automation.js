// tests/test-automation.js - Simula la ejecución diaria de la Lambda para probar la automatización
require('dotenv').config();
const onboardingService = require('../Services/onboardingService');
const createPostgrestClient = require("../Services/postgrestClient");
const config = require('../config');

async function testAutomationFlow() {
  const supabase = createPostgrestClient();
  
  console.log('🤖 INICIANDO SIMULACIÓN DE AUTOMATIZACIÓN DIARIA...');

  try {
    // 1. Obtener todos los usuarios que están en el flujo
    const { data: users, error } = await supabase
      .from('user_profiles')
      .select('phone_number, user_name, onboarding_step, subscription_start_date, subscription_active')
      .eq('subscription_active', true);

    if (error) throw error;

    console.log(`📊 Usuarios activos encontrados: ${users.length}`);

    // 2. Ejecutar el proceso global (como lo haría la Lambda)
    const result = await onboardingService.processAllUsers();

    console.log('\n--- RESULTADO DE LA AUTOMATIZACIÓN ---');
    console.log(`✅ Usuarios procesados: ${result.processed}`);
    console.log('--------------------------------------');

    // 3. Mostrar estado de los usuarios para verificar lógica
    console.log('\n🔍 ESTADO DE USUARIOS (Simulando lo que el sistema ve):');
    users.forEach(user => {
      const startDate = new Date(user.subscription_start_date);
      const now = new Date();
      const diffMs = now - startDate;
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const targetDay = Math.floor(diffHours / 24);
      
      console.log(`📱 ${user.phone_number} (${user.user_name || 'Sin nombre'}):`);
      console.log(`   - Paso actual en BD: ${user.onboarding_step}`);
      console.log(`   - Horas desde inicio: ${diffHours}h`);
      console.log(`   - Día calculado hoy: ${targetDay}`);
      
      if (targetDay > user.onboarding_step && targetDay <= 7) {
        console.log(`   🚀 ACCIÓN: El sistema debería enviar el mensaje del DÍA ${targetDay}.`);
      } else {
        console.log(`   😴 ACCIÓN: No corresponde enviar mensaje hoy (ya enviado o aún no es tiempo).`);
      }
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error en la simulación:', error);
  }
}

testAutomationFlow();
