// Services/onboardingService.js - Gestión del flujo de onboarding de 7 días y alertas de expiración
const createPostgrestClient = require("./postgrestClient");
const whatsappService = require("./whatsappService");

class OnboardingService {
  constructor() {
    this.supabase = createPostgrestClient();
    
    // Mensajes de Onboarding (Día 0 a Día 7)
    this.onboardingMessages = {
      0: "¡Listo! Ya tienes acceso a Fyn. 🚀\n\nVoy a ayudarte a entender tu dinero de forma simple. Primero, necesito conocerte un poco.",
      
      1: "DÍA 1 - PRIMER LOGRO 🏆\n\n¿Cuál es tu principal preocupación financiera hoy?\n¿Cuánto ganas al mes aproximadamente?\n¿Sientes que te alcanza el dinero? (Sí / No / A veces)\n\nInsight: Estás gastando sin claridad, vamos a cambiar eso hoy. 💡\n\nCierre: Hoy solo haz esto: Durante el día, anota 3 gastos que hagas. Mañana los revisamos juntos. ✍️",
      
      2: "DÍA 2 - PRIMER INSIGHT 📊\n\n¿Recuerdas los gastos de ayer? Dime 3 cosas en las que gastaste y te digo qué mejorar. 🧐\n\nRespuesta tipo: Estás gastando mucho en X. Podemos reducirlo sin afectar tu vida. ✅",
      
      3: "DÍA 3 - ACCIÓN SIMPLE 🎯\n\nHoy vamos a hacer algo pequeño pero poderoso: Elige UN gasto que puedas reducir hoy. ¿Cuál sería? 🤔",
      
      4: "DÍA 4 - REFUERZO 💪\n\n¿Lograste reducir ese gasto? Pequeños cambios = grandes resultados. ¡Sigue así! 🚀",
      
      5: "DÍA 5 - AHORRO 💰\n\nAhora vamos a mejorar esto: Si ahorraras el 5% de tu ingreso, serían aproximadamente el monto que ya calculamos. ¿Te gustaría empezar con eso? 💵",
      
      6: "DÍA 6 - VISIÓN 🌟\n\n¡Muy bien! Ya llevas 6 días logrando mejorar tus finanzas, resuelve esta encuesta para que nos ayudes a mejorar FYN:\nhttps://docs.google.com/forms/d/e/1FAIpQLSdg7rf4L_vht972s1AMNoI3Q6fPDBpk-jsJaPpsEulsXoM0tw/viewform?usp=publish-editor\n\nSi sigues así 30 días, esto podría pasar:\n- Menos estrés\n- Más control\n- Primer ahorro real\n\n¿Te gustaría que hagamos un plan para eso? 📝",
      
      7: "DÍA 7 - RESULTADO + ENGANCHE 🚀\n\nLlevas 7 días mejorando tus finanzas. Ahora puedo:\n1. Hacerte un plan completo 📋\n2. Analizar tus gastos a fondo 🔍\n3. Ayudarte a ahorrar más 💰\n\n¿Qué quieres hacer ahora? 👇"
    };

    this.EXPIRY_SURVEY_URL = "https://docs.google.com/forms/d/e/1FAIpQLScfU2u1cIUrlORKYvb8QkPZ6N6R5L7Q9noxwB6Nt63DrhYOqA/viewform?usp=header";
  }

  /**
   * Procesa a todos los usuarios para enviar mensajes de onboarding o alertas de expiración
   */
  async processAllUsers() {
    try {
      console.log('🚀 Iniciando procesamiento de onboarding y expiraciones...');
      
      // Obtener usuarios con suscripción activa
      const { data: users, error } = await this.supabase
        .from('user_profiles')
        .select('*')
        .eq('subscription_active', true);

      if (error) throw error;
      if (!users || users.length === 0) {
        console.log('⚠️ No hay usuarios activos para procesar.');
        return { processed: 0 };
      }

      let processedCount = 0;
      for (const user of users) {
        await this.handleUserOnboarding(user);
        await this.handleUserSubscriptionExpiry(user);
        processedCount++;
      }

      return { processed: processedCount };
    } catch (error) {
      console.error('❌ Error en processAllUsers:', error);
      throw error;
    }
  }

  /**
   * Maneja el flujo de onboarding para un usuario específico
   */
  async handleUserOnboarding(user) {
    try {
      if (!user.subscription_start_date) return;

      const startDate = new Date(user.subscription_start_date);
      const now = new Date();
      const diffMs = now - startDate;
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      
      // Determinar en qué día de onboarding debería estar el usuario
      // Día 0: 0h (Inmediato)
      // Día 1: 24h
      // Día 2: 48h
      // ...
      // Día 7: 168h
      
      const targetDay = Math.floor(diffHours / 24);
      const currentStep = user.onboarding_step === null ? -1 : user.onboarding_step;

      console.log(`🔍 [Onboarding] Usuario ${user.phone_number}:`, {
        diffHours,
        targetDay,
        currentStep,
        subscription_start_date: user.subscription_start_date
      });

      // Si el día objetivo es mayor al paso actual y <= 7, enviar mensaje
      if (targetDay > currentStep && targetDay <= 7) {
        console.log(`📤 Enviando onboarding Día ${targetDay} a ${user.phone_number}`);
        
        const message = this.onboardingMessages[targetDay];
        if (message) {
          await whatsappService.sendMessage(user.phone_number, message);
          
          // Actualizar paso de onboarding
          await this.supabase
            .from('user_profiles')
            .update({ 
              onboarding_step: targetDay,
              last_onboarding_at: now.toISOString()
            })
            .eq('id', user.id);
        }
      }
    } catch (error) {
      console.error(`❌ Error en handleUserOnboarding para ${user.phone_number}:`, error);
    }
  }

  /**
   * Maneja las alertas de expiración de suscripción
   */
  async handleUserSubscriptionExpiry(user) {
    try {
      if (!user.subscription_end_date) return;

      const endDate = new Date(user.subscription_end_date);
      const now = new Date();
      const diffMs = endDate - now;
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      // Si faltan menos de 2 días y no se ha enviado alerta (podríamos usar otra columna si fuera necesario)
      // Por ahora, solo enviamos un mensaje cuando faltan entre 1 y 2 días
      if (diffDays > 0 && diffDays <= 2 && !user.expiry_alert_sent) {
        console.log(`📤 Enviando alerta de expiración a ${user.phone_number}`);
        
        const expiryMessage = `⚠️ Tu suscripción está por terminar. ¡No pierdas el control de tus finanzas! 📈\n\nAdemás, nos encantaría conocer tu opinión para seguir mejorando. ¿Podrías responder esta breve encuesta? 🙏\n${this.EXPIRY_SURVEY_URL}`;
        
        await whatsappService.sendMessage(user.phone_number, expiryMessage);
        
        // Marcar alerta como enviada para no repetir
        // Nota: requiere la columna expiry_alert_sent en user_profiles o similar
        await this.supabase
          .from('user_profiles')
          .update({ expiry_alert_sent: true })
          .eq('id', user.id);
      }
    } catch (error) {
      console.error(`❌ Error en handleUserSubscriptionExpiry para ${user.phone_number}:`, error);
    }
  }

  /**
   * Envía el mensaje inicial de Día 0 (Activación Inmediata)
   * Solo si el usuario no ha iniciado el onboarding o si se fuerza un reinicio
   */
  async sendDayZeroMessage(phoneNumber, force = false) {
    try {
      // Verificar estado actual
      const { data: user, error } = await this.supabase
        .from('user_profiles')
        .select('onboarding_step')
        .eq('phone_number', phoneNumber)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      // Si ya está en onboarding y no se fuerza el reinicio, no enviar
      if (user && user.onboarding_step !== null && user.onboarding_step >= 0 && !force) {
        console.log(`ℹ️ Usuario ${phoneNumber} ya está en onboarding (Paso ${user.onboarding_step}). Saltando Día 0.`);
        return;
      }

      const message = this.onboardingMessages[0];
      await whatsappService.sendMessage(phoneNumber, message);
      
      // Actualizar a paso 0
      await this.supabase
        .from('user_profiles')
        .update({ 
          onboarding_step: 0,
          last_onboarding_at: new Date().toISOString()
        })
        .eq('phone_number', phoneNumber);
        
      console.log(`✅ Mensaje Día 0 enviado a ${phoneNumber}`);
    } catch (error) {
      console.error(`❌ Error enviando mensaje Día 0 a ${phoneNumber}:`, error);
    }
  }
}

module.exports = new OnboardingService();
