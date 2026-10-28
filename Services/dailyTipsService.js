// Services/dailyTipsService.js - SERVICIO DE TIPS FINANCIEROS DIARIOS
const createPostgrestClient = require("./postgrestClient");
const whatsappService = require("./whatsappService");

class DailyTipsService {
  constructor() {
    this.supabase = createPostgrestClient();
    
    // 📚 Banco de tips financieros (50 mensajes)
    this.tips = [
      "💰 *Tip Financiero del Día*\n\n¿Sabías que el 78% de las personas que hacen presupuestos mensuales logran ahorrar más del 20% de sus ingresos?\n\nEmpieza hoy: anota todos tus gastos durante una semana. Te sorprenderás de cuánto gastas en pequeñas cosas. 📊",
      
      "🌟 *Dato Curioso Financiero*\n\nSi inviertes $100 mensuales con un rendimiento del 7% anual, en 30 años tendrías más de $120,000.\n\nEl secreto está en la *constancia*, no en la cantidad inicial. ⏰💵",
      
      "🚨 *Alerta Financiera*\n\nLas tarjetas de crédito con tasas altas son como agujeros en tu bolsillo.\n\nRegla de oro: Si no puedes pagar el total al final del mes, ¡no lo compres con tarjeta! 💳❌",
      
      "📈 *Consejo del Día*\n\nEl primer paso para la libertad financiera es crear un fondo de emergencia equivalente a 3-6 meses de gastos.\n\nComienza con $50 al mes. En 2 años tendrás $1,200 de respaldo. 🛡️",
      
      "💡 *¿Lo Sabías?*\n\nLas personas que escriben sus metas financieras tienen un 42% más de probabilidad de alcanzarlas.\n\n¿Cuál es tu meta financiera para este año? Escríbela ahora. ✍️",
      
      "🔥 *Dato Impactante*\n\nEl 65% de las personas jubiladas dependen únicamente de la pensión estatal.\n\nNo seas parte de esa estadística. Invierte hoy para tu futuro. 👴💰",
      
      "☕ *Efecto Café*\n\nUn café de $3 diario = $1,095 al año = $10,950 en 10 años.\n\nSi invirtieras eso mismo con 7% anual, tendrías más de $15,000. ☕💸",
      
      "🎯 *Regla 50/30/20*\n\n50% para necesidades\n30% para gustos\n20% para ahorro/inversión\n\nSiguiendo esta fórmula simple, tu vida financiera mejorará automáticamente. 📊",
      
      "🏦 *Interés Compuesto*\n\nAlbert Einstein lo llamó 'la octava maravilla del mundo'.\n\nInvierte $200 mensuales desde los 25 años. A los 65 tendrás más de $500,000 (con 7% anual). El tiempo es tu aliado. ⏳💎",
      
      "⚠️ *Evita Esto*\n\nComprar un auto nuevo pierde el 20% de su valor apenas sales del concesionario.\n\nCompra autos usados de 2-3 años y ahorra miles de dólares. 🚗💨",
      
      "🌍 *Diversificación*\n\n'No pongas todos los huevos en la misma canasta.'\n\nInvierte en diferentes activos: acciones, bonos, bienes raíces, fondos. Reduce riesgo y aumenta oportunidades. 🥚🧺",
      
      "💰 *Deudas Buenas vs Malas*\n\nBuenas: Hipoteca, préstamo estudiantil, inversión en negocio\nMalas: Tarjetas de crédito, préstamos para vacaciones, autos de lujo\n\nInvierte en activos que generen valor. 📈",
      
      "🎓 *Educación Financiera*\n\nLeer 1 libro de finanzas al mes puede cambiar tu vida.\n\nRecomendación: 'Padre Rico, Padre Pobre' de Robert Kiyosaki. 📚💡",
      
      "🛍️ *Compras Inteligentes*\n\nAntes de comprar algo que cuesta más de $100, espera 24 horas.\n\nEl 70% de las veces no lo comprarás, ahorrando miles al año. ⏰🛒",
      
      "💪 *Mentalidad de Abundancia*\n\nLas personas ricas piensan: '¿Cómo puedo pagar esto?'\nLas personas pobres piensan: 'No puedo pagar esto.'\n\nCambia tu mentalidad, cambia tu vida. 🧠💰",
      
      "📱 *Apps de Ahorro*\n\nUsa apps para rastrear gastos automáticamente.\n\nLo que se mide, se mejora. Visualizar tus gastos te ayuda a controlarlos. 📊📲",
      
      "🏠 *Bienes Raíces*\n\nLa vivienda debería costar máximo el 30% de tus ingresos.\n\nSi pagas más, estás sacrificando tu capacidad de ahorro e inversión. 🏡💵",
      
      "⚡ *Ahorro Automático*\n\nConfigura transferencias automáticas el día que cobras.\n\nAhorra antes de gastar, no al revés. Es la única forma que funciona. 🔄💰",
      
      "🎁 *Regalos Inteligentes*\n\nNo midas tu afecto por el precio de los regalos.\n\nExperiencias y tiempo valen más que objetos materiales. 💝🕐",
      
      "📉 *Crisis como Oportunidad*\n\nLos millonarios se hacen en las crisis comprando cuando todos venden.\n\nMantén liquidez para aprovechar oportunidades. 💎📊",
      
      "🍔 *Gastos Hormiga*\n\nComidas fuera, snacks, suscripciones olvidadas...\n\nEstos pequeños gastos suman $200-500 mensuales. Identifícalos y elimínalos. 🐜💸",
      
      "💳 *Tarjetas de Crédito*\n\nÚsalas solo si pagas el 100% cada mes.\n\nLos puntos y beneficios solo valen si NO pagas intereses. ✅❌",
      
      "🎯 *Metas SMART*\n\nEspecíficas, Medibles, Alcanzables, Relevantes, con Tiempo definido.\n\nEjemplo: 'Ahorrar $10,000 para diciembre invirtiendo $850 mensuales'. 🎯📅",
      
      "📊 *Inflación*\n\nTu dinero pierde poder adquisitivo cada año.\n\nSi no inviertes, estás perdiendo dinero aunque no lo gastes. Invierte siempre. 📉💨",
      
      "🌟 *Inversión en Ti*\n\nLa mejor inversión es en tu educación y habilidades.\n\nAumentar tus ingresos es más fácil que reducir gastos extremadamente. 🧠📚",
      
      "🏃 *Empieza Hoy*\n\nEl mejor momento para plantar un árbol fue hace 20 años.\nEl segundo mejor momento es HOY.\n\nNo esperes el momento perfecto. Empieza ahora. 🌳⏰",
      
      "💰 *Regla del 72*\n\nDivide 72 entre tu tasa de retorno anual para saber cuántos años tardarás en duplicar tu dinero.\n\nEjemplo: 72÷7% = 10.3 años. 🔢💡",
      
      "🎰 *Lotería*\n\nTienes más probabilidad de que te caiga un rayo que de ganar la lotería.\n\nAhorra e invierte ese dinero. Crearás tu propia 'suerte'. ⚡🎲",
      
      "🔐 *Seguro de Vida*\n\nSi tienes dependientes económicos, necesitas un seguro.\n\nProtege a tu familia. El costo es mínimo comparado con la tranquilidad. 🛡️👨‍👩‍👧",
      
      "📅 *Revisa Mensualmente*\n\nDedica 1 hora al mes para revisar tus finanzas.\n\n12 horas al año pueden ahorrarte miles de dólares. ⏰💰",
      
      "🚫 *FOMO Financiero*\n\nNo compres algo solo porque otros lo tienen.\n\nLa comparación social es el enemigo del ahorro. Sé fiel a tu plan. 👥❌",
      
      "💡 *Ingresos Pasivos*\n\nCrea fuentes de ingreso que no requieran tu tiempo constante.\n\nDividendos, rentas, regalías. El dinero trabajando para ti. 💵⚙️",
      
      "🏖️ *Vacaciones Inteligentes*\n\nViaja en temporada baja, reserva con anticipación.\n\nPuedes ahorrar hasta 50% en el mismo destino. ✈️💰",
      
      "📱 *Suscripciones*\n\nRevisa tus suscripciones mensuales.\n\nProbablemente pagas por 3-5 servicios que no usas. Cancélalos ya. 💳🗑️",
      
      "🎓 *Préstamos Estudiantiles*\n\nSon inversión, no gasto, si estudias algo que aumente tus ingresos.\n\nElige carreras con buen retorno de inversión. 📚💼",
      
      "🏋️ *Salud es Riqueza*\n\nProblemas de salud son la causa #1 de bancarrotas.\n\nInvierte en ejercicio, alimentación sana y chequeos médicos. 💪❤️",
      
      "🤝 *Networking*\n\nTu red de contactos puede generar más oportunidades que tu currículum.\n\nInvierte tiempo en relaciones profesionales valiosas. 👥🌟",
      
      "💰 *Nunca Es Tarde*\n\n'El mejor momento para empezar fue ayer. El segundo mejor es hoy.'\n\nSin importar tu edad, empieza a invertir YA. ⏰🚀",
      
      "🎯 *Progreso > Perfección*\n\nNo necesitas el plan perfecto para empezar.\n\nAhorrar $10 es mejor que $0. Comienza pequeño y crece. 📈✨",
      
      "🔔 *Recordatorio Importante*\n\nEl dinero es una herramienta, no un objetivo.\n\nUsalo para crear la vida que deseas, no para impresionar a otros. 💎🌈",
      
      "💪 *Disciplina Financiera*\n\nLa disciplina pesa gramos, el arrepentimiento pesa toneladas.\n\nPequeños sacrificios hoy = gran libertad mañana. ⚖️🎯",
      
      "🌟 *Gratitud Financiera*\n\nAgradece lo que tienes mientras trabajas por lo que quieres.\n\nLa abundancia comienza con la mentalidad. 🙏💰",
      
      "📊 *Warren Buffett Dice*\n\n'No ahorres lo que queda después de gastar, gasta lo que queda después de ahorrar.'\n\nInvierte primero, gasta después. 💡📈",
      
      "🎁 *Herencia Viva*\n\nLa mejor herencia es enseñar educación financiera.\n\nComparte estos consejos con tu familia. El conocimiento se multiplica. 👨‍👩‍👧💎",
      
      "🔥 *Motivación Final*\n\nCada peso que ahorras e inviertes hoy es un soldado trabajando por tu libertad financiera.\n\n¡Construye tu ejército! 💪💰🚀",
      
      "🌟 *Cierre del Ciclo*\n\nHas recibido 50 tips financieros.\n\n¿Cuántos has aplicado? No se trata de saber, se trata de HACER.\n\n¡Empieza HOY! 🎯✅",
      
      "🔄 *Reinicio del Ciclo*\n\nVolvamos al principio con más profundidad.\n\nLa repetición con acción crea hábitos millonarios. 📚🔁",
      
      "💎 *Bonus Tip*\n\nSi llegaste hasta aquí, ya tienes la mentalidad correcta.\n\nAhora solo falta la ACCIÓN. ¿Qué vas a hacer HOY? 🚀💪",
      
      "📅 *Compromiso Diario*\n\nLee un tip, aplica un tip.\n\nPequeñas acciones diarias crean grandes resultados. ¡Sigamos! 📈✨",
      
      "🎯 *Tu Futuro Te Agradecerá*\n\nCada decisión financiera inteligente que tomas hoy construye la vida que quieres mañana.\n\n¡Tú puedes! 💪🌟"
    ];
  }

  /**
   * Obtener usuarios activos que deben recibir tip
   */
  async getActiveUsers() {
    try {
      const { data, error } = await this.supabase
        .from('user_profiles')
        .select(`
          phone_number,
          user_name,
          country
        `)
        .not('phone_number', 'is', null);

      if (error) throw error;

      console.log(`📋 Usuarios activos encontrados: ${data?.length || 0}`);
      return data || [];

    } catch (error) {
      console.error('❌ Error obteniendo usuarios activos:', error);
      return [];
    }
  }

  /**
   * Obtener el siguiente tip para un usuario
   */
  async getNextTipForUser(userPhone) {
    try {
      const { data, error } = await this.supabase
        .rpc('get_next_tip_index', {
          p_user_phone: userPhone
        });

      if (error) throw error;

      const tipIndex = data || 0;
      return {
        index: tipIndex,
        content: this.tips[tipIndex]
      };

    } catch (error) {
      console.error(`❌ Error obteniendo tip para ${userPhone}:`, error);
      // Fallback: usar índice aleatorio
      const randomIndex = Math.floor(Math.random() * this.tips.length);
      return {
        index: randomIndex,
        content: this.tips[randomIndex]
      };
    }
  }

  /**
   * Enviar tip diario a un usuario
   */
  async sendDailyTip(userPhone, userName = null) {
    try {
      console.log(`💬 Enviando tip diario a: ${userPhone}`);

      // Obtener el siguiente tip
      const { index, content } = await this.getNextTipForUser(userPhone);

      // Personalizar mensaje si tenemos el nombre
      let message = content;
      if (userName) {
        message = `Hola ${userName}! 👋\n\n${content}`;
      }

      // Enviar por WhatsApp
      await whatsappService.sendMessage(userPhone, message);

      // Registrar envío
      await this.logTipSent(userPhone, index, content);

      console.log(`✅ Tip ${index} enviado exitosamente a ${userPhone}`);
      return { success: true, tipIndex: index };

    } catch (error) {
      console.error(`❌ Error enviando tip a ${userPhone}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Registrar tip enviado en base de datos
   */
  async logTipSent(userPhone, tipIndex, tipContent) {
    try {
      const { error } = await this.supabase
        .from('daily_tips_log')
        .insert([{
          user_phone: userPhone,
          tip_index: tipIndex,
          tip_content: tipContent.substring(0, 500), // Limitar tamaño
          status: 'sent',
          sent_at: new Date().toISOString()
        }]);

      if (error) throw error;

    } catch (error) {
      console.error('❌ Error registrando tip:', error);
    }
  }

  /**
   * Enviar tips a todos los usuarios activos (función principal)
   */
  async sendDailyTipsToAll() {
    try {
      console.log('🚀 Iniciando envío de tips diarios...');
      
      const users = await this.getActiveUsers();
      
      if (users.length === 0) {
        console.log('⚠️ No hay usuarios para enviar tips');
        return { total: 0, sent: 0, failed: 0 };
      }

      let sent = 0;
      let failed = 0;

      // Enviar con pequeño delay para no saturar API
      for (const user of users) {
        const result = await this.sendDailyTip(
          user.phone_number,
          user.user_name
        );

        if (result.success) {
          sent++;
        } else {
          failed++;
        }

        // Delay de 2 segundos entre mensajes
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      console.log(`✅ Tips enviados: ${sent}/${users.length}`);
      console.log(`❌ Fallos: ${failed}`);

      return {
        total: users.length,
        sent,
        failed
      };

    } catch (error) {
      console.error('❌ Error en envío masivo de tips:', error);
      throw error;
    }
  }

  /**
   * Obtener estadísticas de tips enviados
   */
  async getStats() {
    try {
      const { data, error } = await this.supabase
        .from('daily_tips_log')
        .select('user_phone, sent_at')
        .gte('sent_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      if (error) throw error;

      const uniqueUsers = new Set(data.map(d => d.user_phone)).size;

      return {
        totalTipsSent: data.length,
        uniqueUsersReached: uniqueUsers,
        last30Days: data.length
      };

    } catch (error) {
      console.error('❌ Error obteniendo estadísticas:', error);
      return {
        totalTipsSent: 0,
        uniqueUsersReached: 0,
        last30Days: 0
      };
    }
  }
}

module.exports = new DailyTipsService();
