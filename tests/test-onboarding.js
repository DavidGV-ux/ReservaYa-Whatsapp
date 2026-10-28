// tests/test-onboarding.js - Script para probar el flujo de onboarding manualmente
require('dotenv').config();
const onboardingService = require('../Services/onboardingService');
const createPostgrestClient = require("../Services/postgrestClient");
const config = require('../config');

async function testOnboardingFlow(phoneNumber, targetDay) {
  const supabase = createPostgrestClient();
  
  console.log(`🧪 Iniciando prueba de Onboarding para ${phoneNumber} (Simulando Día ${targetDay})...`);

  try {
    // 1. Buscar el usuario
    const { data: user, error: userError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('phone_number', phoneNumber)
      .single();

    if (userError || !user) {
      console.error('❌ Usuario no encontrado. Asegúrate de que el número sea correcto y exista en user_profiles.');
      return;
    }

    console.log(`✅ Usuario encontrado: ${user.user_name || 'Sin nombre'}`);

    // 2. Simular el tiempo retrocediendo la fecha de inicio de suscripción
    // Si queremos probar el Día 1, restamos 25 horas. Si es Día 2, 49 horas, etc.
    const hoursToSubtract = (targetDay * 24) + 1; // +1 hora para asegurar que pase el umbral
    const simulatedStartDate = new Date();
    simulatedStartDate.setHours(simulatedStartDate.getHours() - hoursToSubtract);

    console.log(`🕒 Simulando fecha de inicio: ${simulatedStartDate.toISOString()} (${hoursToSubtract} horas atrás)`);

    // 3. Actualizar el usuario para la prueba (bajamos el onboarding_step para que el servicio lo procese)
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        subscription_start_date: simulatedStartDate.toISOString(),
        onboarding_step: targetDay - 1, // Bajamos un paso para que el servicio detecte el cambio
        subscription_active: true
      })
      .eq('id', user.id);

    if (updateError) throw updateError;

    console.log(`🔄 Perfil actualizado en BD. Obteniendo datos actualizados...`);

    // 3.1 Obtener los datos actualizados para pasarlos al servicio
    const { data: updatedUser, error: refreshError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (refreshError) throw refreshError;

    console.log(`🔄 Ejecutando procesamiento de onboarding para Día ${targetDay}...`);

    // 4. Ejecutar el procesamiento para este usuario específico
    await onboardingService.handleUserOnboarding(updatedUser);
    
    // Si es Día 6 o 7, o queremos probar expiración, podemos forzarlo también
    if (targetDay >= 13) { // Simular casi expiración (15 días es el total)
        console.log('🧪 Probando también alerta de expiración...');
        const simulatedEndDate = new Date();
        simulatedEndDate.setHours(simulatedEndDate.getHours() + 24); // Expira en 24h
        
        await supabase
            .from('user_profiles')
            .update({
                subscription_end_date: simulatedEndDate.toISOString(),
                expiry_alert_sent: false
            })
            .eq('id', user.id);
            
        // Refrescar datos del usuario para el servicio
        const { data: updatedUser } = await supabase.from('user_profiles').select('*').eq('id', user.id).single();
        await onboardingService.handleUserSubscriptionExpiry(updatedUser);
    }

    console.log('🏁 Prueba completada. Revisa tu WhatsApp.');

  } catch (error) {
    console.error('❌ Error en la prueba:', error);
  }
}

// Obtener parámetros de la línea de comandos
const phone = process.argv[2];
const day = parseInt(process.argv[3]) || 1;

if (!phone) {
  console.log('Uso: node tests/test-onboarding.js [NUMERO_TELEFONO] [DIA_A_PROBAR]');
  console.log('Ejemplo: node tests/test-onboarding.js 573001234567 1');
  process.exit(1);
}

testOnboardingFlow(phone, day);
