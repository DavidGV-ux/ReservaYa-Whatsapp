// lambdaMonthlyFeedback.js - HANDLER OPTIMIZADO PARA FEEDBACK MENSUAL
require('dotenv').config();
const monthlyFeedbackService = require('./Services/monthlyFeedbackService');

/**
 * Handler para EventBridge Cron - Feedback Mensual
 * Se ejecuta el primer día de cada mes
 * OPTIMIZADO para plan gratuito de Lambda
 */
exports.handler = async (event, context) => {
  console.log('📊 Lambda Feedback Mensual activada:', new Date().toISOString());
  
  // Usar el tiempo restante de Lambda para evitar timeouts
  const startTime = Date.now();
  const maxExecutionTime = 250000; // 250 segundos (dejar margen de 50s)

  try {
    // Enviar feedback mensual a todos los usuarios
    const result = await monthlyFeedbackService.sendMonthlyFeedbackToAll();

    const executionTime = Date.now() - startTime;
    console.log(`✅ Proceso completado en ${executionTime}ms:`, result);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Feedback mensual enviado exitosamente',
        result,
        executionTime: `${executionTime}ms`
      })
    };

  } catch (error) {
    console.error('❌ Error en lambda feedback mensual:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error enviando feedback mensual',
        error: error.message
      })
    };
  }
};

