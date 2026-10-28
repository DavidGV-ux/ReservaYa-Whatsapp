// lambdaReminders.js - HANDLER PARA RECORDATORIOS PREDEFINIDOS
require('dotenv').config();
const remindersService = require('./Services/remindersService');
const budgetAlertService = require('./Services/budgetAlertService');

/**
 * Handler para EventBridge Cron - Recordatorios
 * Se ejecuta múltiples veces al día según horarios configurados
 * 
 * El evento incluye la hora en el campo 'time' o se determina por el cron schedule
 */
exports.handler = async (event, context) => {
  console.log('🔔 Lambda Recordatorios activada:', new Date().toISOString());
  
  try {
    // Mapeo de horarios UTC a horarios locales (Colombia UTC-5)
    // El cron se ejecuta en UTC, pero los recordatorios están en hora local
    const now = new Date();
    const utcHour = now.getUTCHours();
    
    // Mapear hora UTC a hora local de Colombia (UTC-5)
    // 14:00 UTC = 09:00 Colombia (mañana)
    // 17:00 UTC = 12:00 Colombia (almuerzo)
    // 19:00 UTC = 14:00 Colombia (compras)
    // 23:00 UTC = 18:00 Colombia (cena)
    // 01:00 UTC = 20:00 Colombia (revisar)
    
    const utcToLocalMap = {
      '14': '09:00',  // 9 AM Colombia
      '17': '12:00',  // 12 PM Colombia (almuerzo)
      '19': '14:00',  // 2 PM Colombia (compras)
      '23': '18:00',  // 6 PM Colombia (cena)
      '01': '20:00',  // 8 PM Colombia (revisar)
      '03': '22:00'   // 10 PM Colombia - REVISIÓN NOCTURNA PRESUPUESTO (Coach Financiero Vivo v1.1)
    };
    
    const localHour = utcToLocalMap[String(utcHour).padStart(2, '0')];
    
    if (!localHour) {
      console.log(`⚠️ No hay recordatorio configurado para UTC ${utcHour}:00`);
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'No hay recordatorio para esta hora',
          utcHour: `${utcHour}:00`
        })
      };
    }
    
    console.log(`⏰ UTC: ${utcHour}:00 -> Hora local: ${localHour}`);

    // ===== COACH FINANCIERO VIVO v1.1 =====
    // Slot 22:00 (10 PM Colombia) = 03:00 UTC -> Revisión nocturna de presupuestos
    // Captura casos en que el usuario cruzó umbral sin transacción (ej: cambio manual de presupuesto por admin)
    let budgetReviewResult = null;
    if (localHour === '22:00') {
      console.log('🌙 [BudgetAlert] Slot 22:00 detectado -> ejecutando revisión nocturna de presupuestos...');
      try {
        budgetReviewResult = await budgetAlertService.runNightlyBudgetReview();
      } catch (brErr) {
        console.error('❌ [BudgetAlert] Fallo en revisión nocturna:', brErr.message);
      }
    }
    // ======================================

    // Enviar recordatorios para esta hora local
    const result = await remindersService.sendRemindersForHour(localHour);

    console.log('✅ Proceso completado:', result);
    if (budgetReviewResult) {
      console.log('💰 Budget Review nocturno:', budgetReviewResult);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: budgetReviewResult
          ? 'Recordatorios + Revisión nocturna presupuesto ejecutados'
          : 'Recordatorios enviados exitosamente',
        utcHour: `${utcHour}:00`,
        localHour: localHour,
        result,
        budgetReview: budgetReviewResult
      })
    };

  } catch (error) {
    console.error('❌ Error en lambda recordatorios:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error enviando recordatorios',
        error: error.message
      })
    };
  }
};

