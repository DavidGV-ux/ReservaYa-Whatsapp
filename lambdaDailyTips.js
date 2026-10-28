// lambdaDailyTips.js - HANDLER ESPECÍFICO PARA CRON DE TIPS
require('dotenv').config();
const dailyTipsService = require('./Services/dailyTipsService');
const onboardingService = require('./Services/onboardingService');

/**
 * Handler para EventBridge Cron
 * Se ejecuta diariamente a la hora configurada
 */
exports.handler = async (event, context) => {
  console.log('🔔 Lambda Cron activada:', new Date().toISOString());
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    // 1. Enviar tips diarios a todos los usuarios
    const tipsResult = await dailyTipsService.sendDailyTipsToAll();
    console.log('✅ Tips diarios completados:', tipsResult);

    // 2. Procesar onboarding de 7 días y alertas de expiración
    const onboardingResult = await onboardingService.processAllUsers();
    console.log('✅ Onboarding y expiraciones completadas:', onboardingResult);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Tips diarios y onboarding procesados exitosamente',
        tipsResult,
        onboardingResult
      })
    };

  } catch (error) {
    console.error('❌ Error en lambda cron:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error enviando tips diarios',
        error: error.message
      })
    };
  }
};
