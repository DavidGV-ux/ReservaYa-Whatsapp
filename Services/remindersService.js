// Services/remindersService.js - SERVICIO DE RECORDATORIOS PREDEFINIDOS
const createPostgrestClient = require("./postgrestClient");
const whatsappService = require("./whatsappService");

class RemindersService {
  constructor() {
    this.supabase = createPostgrestClient();
    
    // 🕐 Recordatorios predefinidos por hora (sin IA - ahorro de tokens)
    this.reminders = {
      // 12:00 PM - Recordatorio de almuerzo
      '12:00': {
        'es': [
          "🍽️ ¿Ya almorzaste? Recuerda buscar el mejor precio y comparar opciones antes de comprar. ¡Cada peso cuenta! 💰",
          "🍱 Hora del almuerzo. ¿Ya revisaste si hay promociones o descuentos disponibles? Ahorra mientras comes. 💵",
          "🥗 Almuerzo inteligente: cocinar en casa puede ahorrarte hasta $500 semanales. ¿Ya pensaste en preparar algo? 👨‍🍳"
        ],
        'en': [
          "🍽️ Did you have lunch? Remember to look for the best price and compare options before buying. Every dollar counts! 💰",
          "🍱 Lunch time. Have you checked for promotions or discounts available? Save while you eat. 💵",
          "🥗 Smart lunch: cooking at home can save you up to $500 per week. Have you thought about preparing something? 👨‍🍳"
        ],
        'pt': [
          "🍽️ Já almoçou? Lembre-se de procurar o melhor preço e comparar opções antes de comprar. Cada centavo conta! 💰",
          "🍱 Hora do almoço. Já verificou se há promoções ou descontos disponíveis? Economize enquanto come. 💵",
          "🥗 Almoço inteligente: cozinhar em casa pode economizar até $500 por semana. Já pensou em preparar algo? 👨‍🍳"
        ]
      },
      
      // 2:00 PM - Recordatorio de compras
      '14:00': {
        'es': [
          "🛒 Antes de comprar algo, pregúntate: ¿Realmente lo necesito o solo lo quiero? Espera 24 horas antes de decidir. ⏰",
          "💳 Recordatorio: Si vas a comprar algo hoy, compara precios en al menos 3 lugares. El ahorro vale la pena. 📊",
          "🎯 ¿Necesitas comprar algo? Revisa primero si tienes cupones, descuentos o promociones disponibles. 💰"
        ],
        'en': [
          "🛒 Before buying something, ask yourself: Do I really need it or just want it? Wait 24 hours before deciding. ⏰",
          "💳 Reminder: If you're going to buy something today, compare prices in at least 3 places. The savings are worth it. 📊",
          "🎯 Need to buy something? First check if you have coupons, discounts or promotions available. 💰"
        ],
        'pt': [
          "🛒 Antes de comprar algo, pergunte-se: Realmente preciso ou só quero? Espere 24 horas antes de decidir. ⏰",
          "💳 Lembrete: Se vai comprar algo hoje, compare preços em pelo menos 3 lugares. A economia vale a pena. 📊",
          "🎯 Precisa comprar algo? Primeiro verifique se há cupons, descontos ou promoções disponíveis. 💰"
        ]
      },
      
      // 6:00 PM - Recordatorio de cena
      '18:00': {
        'es': [
          "🍽️ Hora de cenar. ¿Ya revisaste qué tienes en casa antes de pedir comida? Cocinar puede ahorrarte mucho. 💵",
          "🌙 Cena inteligente: Planifica tus comidas de la semana. Ahorrarás tiempo y dinero. ¿Ya tienes tu plan? 📋",
          "🍕 Antes de pedir delivery, calcula cuánto gastarías cocinando lo mismo. La diferencia puede ser grande. 💰"
        ],
        'en': [
          "🍽️ Dinner time. Have you checked what you have at home before ordering food? Cooking can save you a lot. 💵",
          "🌙 Smart dinner: Plan your meals for the week. You'll save time and money. Do you already have your plan? 📋",
          "🍕 Before ordering delivery, calculate how much you would spend cooking the same thing. The difference can be big. 💰"
        ],
        'pt': [
          "🍽️ Hora do jantar. Já verificou o que tem em casa antes de pedir comida? Cozinhar pode economizar muito. 💵",
          "🌙 Jantar inteligente: Planeje suas refeições da semana. Você economizará tempo e dinheiro. Já tem seu plano? 📋",
          "🍕 Antes de pedir delivery, calcule quanto gastaria cozinhando a mesma coisa. A diferença pode ser grande. 💰"
        ]
      },
      
      // 8:00 PM - Recordatorio de revisar gastos
      '20:00': {
        'es': [
          "📊 ¿Ya registraste tus gastos de hoy? Mantener un registro diario te ayuda a controlar mejor tu dinero. ✍️",
          "💰 Tómate 2 minutos para revisar tus gastos del día. ¿Hay algo que puedas mejorar mañana? 📝",
          "📱 Recordatorio: Registra tus gastos antes de dormir. Es más fácil recordar todo cuando está fresco. 💤"
        ],
        'en': [
          "📊 Have you recorded your expenses today? Keeping a daily record helps you better control your money. ✍️",
          "💰 Take 2 minutes to review your expenses for the day. Is there anything you can improve tomorrow? 📝",
          "📱 Reminder: Record your expenses before sleeping. It's easier to remember everything when it's fresh. 💤"
        ],
        'pt': [
          "📊 Já registrou suas despesas hoje? Manter um registro diário ajuda você a controlar melhor seu dinheiro. ✍️",
          "💰 Reserve 2 minutos para revisar suas despesas do dia. Há algo que você pode melhorar amanhã? 📝",
          "📱 Lembrete: Registre suas despesas antes de dormir. É mais fácil lembrar de tudo quando está fresco. 💤"
        ]
      },
      
      // 9:00 AM - Recordatorio matutino
      '09:00': {
        'es': [
          "☀️ Buenos días. ¿Ya revisaste tu presupuesto del día? Planifica tus gastos y evita compras impulsivas. 💪",
          "🌅 Comienza el día con un plan financiero. ¿Cuánto planeas gastar hoy? Establece un límite y cúmplelo. 🎯",
          "☕ Buenos días. Recuerda: cada decisión financiera que tomas hoy afecta tu futuro. Elige sabiamente. 💡"
        ],
        'en': [
          "☀️ Good morning. Have you reviewed your budget for the day? Plan your expenses and avoid impulse purchases. 💪",
          "🌅 Start the day with a financial plan. How much do you plan to spend today? Set a limit and stick to it. 🎯",
          "☕ Good morning. Remember: every financial decision you make today affects your future. Choose wisely. 💡"
        ],
        'pt': [
          "☀️ Bom dia. Já revisou seu orçamento do dia? Planeje suas despesas e evite compras impulsivas. 💪",
          "🌅 Comece o dia com um plano financeiro. Quanto você planeja gastar hoje? Estabeleça um limite e cumpra-o. 🎯",
          "☕ Bom dia. Lembre-se: cada decisão financeira que você toma hoje afeta seu futuro. Escolha sabiamente. 💡"
        ]
      }
    };
  }

  /**
   * Obtener recordatorio para una hora específica
   */
  getReminderForHour(hour, language = 'es') {
    const remindersForHour = this.reminders[hour];
    if (!remindersForHour) return null;
    
    const remindersInLanguage = remindersForHour[language] || remindersForHour['es'];
    if (!remindersInLanguage || remindersInLanguage.length === 0) return null;
    
    // Retornar un recordatorio aleatorio de la lista
    const randomIndex = Math.floor(Math.random() * remindersInLanguage.length);
    return remindersInLanguage[randomIndex];
  }

  /**
   * Obtener usuarios activos
   */
  async getActiveUsers() {
    try {
      const { data, error } = await this.supabase
        .from('user_profiles')
        .select('phone_number, user_name, language')
        .not('phone_number', 'is', null);

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('❌ Error obteniendo usuarios activos:', error);
      return [];
    }
  }

  /**
   * Enviar recordatorio a un usuario
   */
  async sendReminder(userPhone, userName, language, reminderMessage) {
    try {
      // Personalizar mensaje con nombre si está disponible
      let message = reminderMessage;
      if (userName) {
        const greeting = language === 'en' ? 'Hi' : language === 'pt' ? 'Oi' : 'Hola';
        message = `${greeting} ${userName}! 👋\n\n${reminderMessage}`;
      }

      await whatsappService.sendMessage(userPhone, message);
      console.log(`✅ Recordatorio enviado a ${userPhone}`);
      return { success: true };
    } catch (error) {
      console.error(`❌ Error enviando recordatorio a ${userPhone}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Enviar recordatorios a todos los usuarios a una hora específica
   */
  async sendRemindersForHour(hour) {
    try {
      console.log(`🔔 Enviando recordatorios para las ${hour}...`);
      
      const users = await this.getActiveUsers();
      if (users.length === 0) {
        console.log('⚠️ No hay usuarios para enviar recordatorios');
        return { total: 0, sent: 0, failed: 0 };
      }

      let sent = 0;
      let failed = 0;

      for (const user of users) {
        const language = user.language || 'es';
        const reminder = this.getReminderForHour(hour, language);
        
        if (!reminder) {
          console.log(`⚠️ No hay recordatorio para ${hour} en idioma ${language}`);
          continue;
        }

        const result = await this.sendReminder(
          user.phone_number,
          user.user_name,
          language,
          reminder
        );

        if (result.success) {
          sent++;
        } else {
          failed++;
        }

        // Delay de 2 segundos entre mensajes
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      console.log(`✅ Recordatorios enviados: ${sent}/${users.length}`);
      return { total: users.length, sent, failed };
    } catch (error) {
      console.error('❌ Error en envío masivo de recordatorios:', error);
      throw error;
    }
  }
}

module.exports = new RemindersService();

