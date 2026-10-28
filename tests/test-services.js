// test-services.js - Script para testear Tips y Feedback
require('dotenv').config();
const dailyTipsService = require('./Services/dailyTipsService');
const monthlyFeedbackService = require('./Services/monthlyFeedbackService');
const supabaseService = require('./Services/supabaseService');

// Configurar número de teléfono de prueba
const TEST_PHONE = process.env.TEST_PHONE || '521234567890'; // Cambia este número

async function testDailyTip() {
  console.log('\n🧪 ===== TESTING DAILY TIP =====\n');
  
  try {
    console.log(`📱 Enviando tip a: ${TEST_PHONE}`);
    const result = await dailyTipsService.sendDailyTip(TEST_PHONE);
    
    if (result.success) {
      console.log('✅ Tip enviado exitosamente');
      console.log('📊 Resultado:', JSON.stringify(result, null, 2));
    } else {
      console.error('❌ Error enviando tip:', result.error);
    }
  } catch (error) {
    console.error('❌ Error en test:', error.message);
    console.error('Stack:', error.stack);
  }
}

async function testMonthlyFeedback() {
  console.log('\n🧪 ===== TESTING MONTHLY FEEDBACK =====\n');
  
  try {
    console.log(`📱 Obteniendo perfil de: ${TEST_PHONE}`);
    const userProfile = await supabaseService.getUserProfile(TEST_PHONE);
    
    if (!userProfile) {
      console.error('❌ Usuario no encontrado en la base de datos');
      console.log('💡 Asegúrate de que el usuario tenga un perfil creado');
      return;
    }
    
    console.log('✅ Perfil encontrado:');
    console.log(JSON.stringify({
      user_name: userProfile.user_name,
      monthly_salary: userProfile.monthly_salary,
      currency: userProfile.currency,
      fixed_expenses: userProfile.fixed_expenses,
      country: userProfile.country,
      language: userProfile.language
    }, null, 2));
    
    // Verificar que tenga todos los datos
    const hasAllData = userProfile.user_name && 
                       userProfile.monthly_salary && 
                       userProfile.currency && 
                       userProfile.fixed_expenses !== undefined && 
                       userProfile.country;
    
    if (!hasAllData) {
      console.warn('⚠️ Usuario no tiene todos los datos del estudio');
      console.log('💡 El feedback puede ser incompleto');
    }
    
    console.log(`\n📊 Generando feedback mensual...`);
    const result = await monthlyFeedbackService.sendMonthlyFeedback(TEST_PHONE, userProfile);
    
    if (result.success) {
      console.log('✅ Feedback enviado exitosamente');
      console.log('📊 Datos financieros:', JSON.stringify(result.financialData, null, 2));
    } else {
      console.error('❌ Error enviando feedback:', result.error);
    }
  } catch (error) {
    console.error('❌ Error en test:', error.message);
    console.error('Stack:', error.stack);
  }
}

async function testStats() {
  console.log('\n🧪 ===== TESTING STATS =====\n');
  
  try {
    console.log('📊 Obteniendo estadísticas de tips...');
    const tipsStats = await dailyTipsService.getStats();
    console.log('Tips Stats:', JSON.stringify(tipsStats, null, 2));
    
    console.log('\n📊 Obteniendo estadísticas de feedback...');
    const feedbackStats = await monthlyFeedbackService.getStats();
    console.log('Feedback Stats:', JSON.stringify(feedbackStats, null, 2));
  } catch (error) {
    console.error('❌ Error obteniendo stats:', error.message);
  }
}

async function verifyUser() {
  console.log('\n🧪 ===== VERIFICANDO USUARIO =====\n');
  
  try {
    const userProfile = await supabaseService.getUserProfile(TEST_PHONE);
    
    if (!userProfile) {
      console.log('❌ Usuario no encontrado');
      return;
    }
    
    console.log('✅ Usuario encontrado:');
    console.log(JSON.stringify(userProfile, null, 2));
    
    const needsStudy = !userProfile.user_name || 
                       !userProfile.monthly_salary || 
                       !userProfile.currency || 
                       userProfile.fixed_expenses === undefined || 
                       !userProfile.country;
    
    console.log(`\n📋 Necesita estudio: ${needsStudy ? 'SÍ' : 'NO'}`);
    
    if (needsStudy) {
      console.log('⚠️ Faltan datos:');
      if (!userProfile.user_name) console.log('  - Nombre');
      if (!userProfile.monthly_salary) console.log('  - Ingreso mensual');
      if (!userProfile.currency) console.log('  - Moneda');
      if (userProfile.fixed_expenses === undefined) console.log('  - Gastos fijos');
      if (!userProfile.country) console.log('  - País');
    }
  } catch (error) {
    console.error('❌ Error verificando usuario:', error.message);
  }
}

// Menú principal
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'all';
  
  console.log('🚀 Iniciando tests...\n');
  console.log(`📱 Número de prueba: ${TEST_PHONE}`);
  console.log(`💡 Para cambiar: TEST_PHONE=521234567890 node test-services.js\n`);
  
  switch (command) {
    case 'tip':
      await testDailyTip();
      break;
    case 'feedback':
      await testMonthlyFeedback();
      break;
    case 'stats':
      await testStats();
      break;
    case 'verify':
      await verifyUser();
      break;
    case 'all':
    default:
      await verifyUser();
      await testDailyTip();
      await testMonthlyFeedback();
      await testStats();
      break;
  }
  
  console.log('\n✅ Tests completados\n');
  process.exit(0);
}

main().catch(error => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});

