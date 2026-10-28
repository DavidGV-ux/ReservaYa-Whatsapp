// Services/subscriptionService.js - Gestión de suscripciones (2 minutos para pruebas)
const supabaseService = require('./supabaseService');
const onboardingService = require('./onboardingService');

class SubscriptionService {
  constructor() {
    // Duración de suscripción: 15 días
    this.SUBSCRIPTION_DURATION_MS = 15 * 24 * 60 * 60 * 1000; // 15 días en milisegundos
    this.SUBSCRIPTION_DAYS = 15; // Mantener para compatibilidad con código existente
    
    // Mensajes de expiración
    this.EXPIRATION_MESSAGE_ES = "¡Hola! Tu suscripción de 15 días ha terminado. Para seguir disfrutando de tu coach financiero, por favor renueva tu suscripción. ¡Estamos aquí para ayudarte a alcanzar tus metas! 💪";
    this.EXPIRATION_MESSAGE_EN = "Hi! Your 15-day subscription has ended. To continue enjoying your financial coach, please renew your subscription. We're here to help you achieve your goals! 💪";
    this.EXPIRATION_MESSAGE_PT = "Olá! Sua assinatura de 15 dias terminou. Para continuar aproveitando seu coach financeiro, por favor, renove sua assinatura. Estamos aqui para ajudá-lo a alcançar seus objetivos! 💪";
  }

  /**
   * Iniciar suscripción cuando el usuario envía su primer mensaje o hace clic en botón WhatsApp
   * Verifica si es una nueva suscripción o si la anterior ya expiró
   * @param {string} phoneNumber - Número de teléfono
   * @param {boolean} forceRestart - Si es true, reinicia la suscripción incluso si está activa (para botón WhatsApp)
   */
  async startSubscription(phoneNumber, forceRestart = false) {
    try {
      const validatedPhone = supabaseService.validatePhoneNumber(phoneNumber);
      
      // Obtener perfil actual
      const profile = await supabaseService.getUserProfile(validatedPhone);
      
      const now = new Date();
      
      // Verificar si tiene una suscripción previa
      if (profile.subscription_start_date && profile.subscription_end_date) {
        const previousEndDate = new Date(profile.subscription_end_date);
        
        // Si forceRestart es true (botón WhatsApp), siempre reiniciar
        if (forceRestart) {
          console.log(`🔄 [Botón WhatsApp] Reiniciando suscripción para ${validatedPhone} (forzado)`);
        } else if (now < previousEndDate && profile.subscription_active) {
          // Si la suscripción anterior aún no ha expirado y no es forzado, no hacer nada
          console.log(`📅 Usuario ${validatedPhone} ya tiene suscripción activa hasta ${previousEndDate.toISOString()}`);
          return profile;
        } else {
          // Si la suscripción anterior ya expiró, iniciar una nueva
          console.log(`🔄 Usuario ${validatedPhone} tiene suscripción expirada. Iniciando nueva suscripción.`);
        }
      }
      
      // Calcular fechas (usando milisegundos para precisión)
      const startDate = new Date();
      const endDate = new Date(startDate.getTime() + this.SUBSCRIPTION_DURATION_MS);
      
      // Actualizar perfil con nueva suscripción
      const updateData = {
        subscription_start_date: startDate.toISOString(),
        subscription_end_date: endDate.toISOString(),
        subscription_active: true,
        subscription_manual_override: false // Siempre false para activación automática desde botón
      };
      
      const { data, error } = await supabaseService.supabase
        .from("user_profiles")
        .update(updateData)
        .eq("phone_number", validatedPhone)
        .select()
        .single();
      
      if (error) {
        console.error('❌ Error iniciando suscripción:', error);
        throw error;
      }
      
      const durationMinutes = this.SUBSCRIPTION_DURATION_MS / (60 * 1000);
      console.log(`✅ Nueva suscripción iniciada para ${validatedPhone}: ${startDate.toISOString()} - ${endDate.toISOString()} (${durationMinutes} minutos)`);
      
      // 🚀 Iniciar flujo de onboarding (Día 0) si es una nueva suscripción o reinicio forzado
      // El servicio de onboarding ya se encarga de no duplicar mensajes si se llama varias veces
      await onboardingService.sendDayZeroMessage(validatedPhone);
      
      return data;
    } catch (error) {
      console.error("Error en startSubscription:", error);
      throw error;
    }
  }

  /**
   * Verificar si la suscripción está activa
   * ⚠️ CRÍTICO: Siempre lee directamente de la BD para obtener el estado más reciente
   * NO usa caché para asegurar que los cambios desde el admin se reflejen inmediatamente
   * Devuelve un objeto con información completa
   */
  async isSubscriptionActive(phoneNumber) {
    try {
      const validatedPhone = supabaseService.validatePhoneNumber(phoneNumber);
      
      // ⚠️ CRÍTICO: Leer SIEMPRE directamente de la BD (no usar caché ni getUserProfile)
      // Esto asegura que los cambios desde el admin panel se reflejen inmediatamente
      const { data: profile, error } = await supabaseService.supabase
        .from("user_profiles")
        .select("subscription_active, subscription_manual_override, subscription_start_date, subscription_end_date, language")
        .eq("phone_number", validatedPhone)
        .single();
      
      if (error || !profile) {
        console.error(`❌ Error obteniendo perfil para verificación de suscripción: ${error?.message || 'Perfil no encontrado'}`);
        // Si hay error, asumir inactivo por seguridad
        return {
          isActive: false,
          daysRemaining: 0,
          message: this.EXPIRATION_MESSAGE_ES
        };
      }
      
      // Log detallado para debugging
      console.log(`🔍 [Suscripción] Verificando ${validatedPhone}:`, {
        subscription_active: profile.subscription_active,
        subscription_manual_override: profile.subscription_manual_override,
        subscription_start_date: profile.subscription_start_date,
        subscription_end_date: profile.subscription_end_date
      });
      
      // ⚠️ PRIORIDAD 1: Verificar el estado booleano directamente de la BD
      // Si subscription_active = false, la suscripción está INACTIVA (sin importar fechas o override)
      if (profile.subscription_active === false) {
        const userLanguage = profile.language || 'es';
        const expirationMessage = userLanguage === 'es' 
          ? this.EXPIRATION_MESSAGE_ES 
          : userLanguage === 'en' 
          ? this.EXPIRATION_MESSAGE_EN 
          : this.EXPIRATION_MESSAGE_PT;
        
        console.log(`⛔ [Suscripción] INACTIVA para ${validatedPhone} (subscription_active = false en BD)`);
        return {
          isActive: false,
          daysRemaining: 0,
          message: expirationMessage
        };
      }
      
      // Si no tiene suscripción iniciada (no tiene fechas)
      if (!profile.subscription_start_date || !profile.subscription_end_date) {
        const daysRemaining = 0;
        const userLanguage = profile.language || 'es';
        console.log(`⛔ [Suscripción] NO INICIADA para ${validatedPhone}`);
        return {
          isActive: false,
          daysRemaining: daysRemaining,
          message: userLanguage === 'es' 
            ? this.EXPIRATION_MESSAGE_ES 
            : userLanguage === 'en' 
            ? this.EXPIRATION_MESSAGE_EN 
            : this.EXPIRATION_MESSAGE_PT
        };
      }
      
      const now = new Date();
      const endDate = new Date(profile.subscription_end_date);
      const daysRemaining = await this.getDaysRemaining(validatedPhone);
      const userLanguage = profile.language || 'es';
      
      // Obtener mensaje de expiración según idioma
      const getExpirationMessage = () => {
        return userLanguage === 'es' 
          ? this.EXPIRATION_MESSAGE_ES 
          : userLanguage === 'en' 
          ? this.EXPIRATION_MESSAGE_EN 
          : this.EXPIRATION_MESSAGE_PT;
      };
      
      // ⚠️ PRIORIDAD 2: Verificación automática basada en fechas (incluye manuales)
      // Si la fecha de fin ya pasó, desactivar automáticamente
      if (now > endDate) {
        // Actualizar estado si está activa
        if (profile.subscription_active) {
          await this.deactivateSubscription(validatedPhone, false);
        }
        console.log(`⛔ [Suscripción] EXPIRADA para ${validatedPhone} (fecha pasada)`);
        return {
          isActive: false,
          daysRemaining: 0,
          message: getExpirationMessage()
        };
      }
      
      // Suscripción activa (subscription_active = true y fecha no expirada)
      console.log(`✅ [Suscripción] ACTIVA para ${validatedPhone} (${profile.subscription_manual_override ? 'manual' : 'automática'}, fecha válida)`);
      return {
        isActive: true,
        daysRemaining: daysRemaining,
        message: null
      };
    } catch (error) {
      console.error("❌ Error verificando suscripción:", error);
      return {
        isActive: false,
        daysRemaining: 0,
        message: this.EXPIRATION_MESSAGE_ES
      };
    }
  }

  /**
   * Obtener tiempo restante de suscripción (en milisegundos)
   * Para mostrar en formato legible (días, horas, minutos, segundos)
   */
  async getTimeRemainingMs(phoneNumber) {
    try {
      const validatedPhone = supabaseService.validatePhoneNumber(phoneNumber);
      const profile = await supabaseService.getUserProfile(validatedPhone);
      
      if (!profile.subscription_end_date) {
        return 0;
      }
      
      const now = new Date();
      const endDate = new Date(profile.subscription_end_date);
      const diffTime = endDate - now;
      
      return Math.max(0, diffTime);
    } catch (error) {
      console.error("Error calculando tiempo restante:", error);
      return 0;
    }
  }

  /**
   * Obtener días restantes de suscripción (para compatibilidad)
   */
  async getDaysRemaining(phoneNumber) {
    try {
      const timeRemainingMs = await this.getTimeRemainingMs(phoneNumber);
      const diffDays = Math.ceil(timeRemainingMs / (1000 * 60 * 60 * 24));
      return Math.max(0, diffDays);
    } catch (error) {
      console.error("Error calculando días restantes:", error);
      return 0;
    }
  }

  /**
   * Obtener tiempo restante formateado (días, horas, minutos, segundos)
   */
  formatTimeRemaining(timeRemainingMs) {
    if (timeRemainingMs <= 0) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0, formatted: '0 segundos' };
    }
    
    const seconds = Math.floor(timeRemainingMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    const remainingHours = hours % 24;
    const remainingMinutes = minutes % 60;
    const remainingSeconds = seconds % 60;
    
    let formatted = '';
    if (days > 0) {
      formatted += `${days} día${days > 1 ? 's' : ''} `;
    }
    if (remainingHours > 0 || days > 0) {
      formatted += `${remainingHours} hora${remainingHours !== 1 ? 's' : ''} `;
    }
    if (remainingMinutes > 0 || hours > 0) {
      formatted += `${remainingMinutes} minuto${remainingMinutes !== 1 ? 's' : ''} `;
    }
    if (remainingSeconds > 0 || minutes === 0) {
      formatted += `${remainingSeconds} segundo${remainingSeconds !== 1 ? 's' : ''}`;
    }
    
    return {
      days,
      hours: remainingHours,
      minutes: remainingMinutes,
      seconds: remainingSeconds,
      formatted: formatted.trim()
    };
  }

  /**
   * Obtener información completa de suscripción
   */
  async getSubscriptionInfo(phoneNumber) {
    try {
      const validatedPhone = supabaseService.validatePhoneNumber(phoneNumber);
      const profile = await supabaseService.getUserProfile(validatedPhone);
      
      if (!profile) {
        console.log(`⚠️ No se encontró perfil para ${validatedPhone}`);
        return null;
      }
      
      const subscriptionStatus = await this.isSubscriptionActive(validatedPhone);
      const daysRemaining = await this.getDaysRemaining(validatedPhone);
      
      return {
        phoneNumber: validatedPhone,
        startDate: profile.subscription_start_date,
        endDate: profile.subscription_end_date,
        isActive: subscriptionStatus.isActive,
        daysRemaining: daysRemaining,
        manualOverride: profile.subscription_manual_override || false,
        message: subscriptionStatus.message
      };
    } catch (error) {
      console.error("Error obteniendo info de suscripción:", error);
      return null;
    }
  }

  /**
   * Activar suscripción manualmente (admin)
   * @param {string} phoneNumber - Número de teléfono
   * @param {number} days - Días de duración (por defecto usa SUBSCRIPTION_DURATION_MS)
   */
  async activateSubscription(phoneNumber, days = null) {
    try {
      const validatedPhone = supabaseService.validatePhoneNumber(phoneNumber);
      const startDate = new Date();
      let endDate;
      
      if (days !== null) {
        // Si se especifican días, usar días
        endDate = new Date();
        endDate.setDate(endDate.getDate() + days);
      } else {
        // Si no, usar la duración configurada (2 minutos para pruebas)
        endDate = new Date(startDate.getTime() + this.SUBSCRIPTION_DURATION_MS);
      }
      
      const updateData = {
        subscription_start_date: startDate.toISOString(),
        subscription_end_date: endDate.toISOString(),
        subscription_active: true,
        subscription_manual_override: true
      };
      
      const { data, error } = await supabaseService.supabase
        .from("user_profiles")
        .update(updateData)
        .eq("phone_number", validatedPhone)
        .select()
        .single();
      
      if (error) throw error;
      
      const duration = days !== null ? `${days} días` : `${this.SUBSCRIPTION_DURATION_MS / (60 * 1000)} minutos`;
      console.log(`✅ Suscripción activada manualmente para ${validatedPhone} por ${duration}`);
      return data;
    } catch (error) {
      console.error("Error activando suscripción:", error);
      throw error;
    }
  }

  /**
   * Extender suscripción (o activar si no existe)
   * Suma días a la fecha de fin actual si es válida, o inicia desde hoy.
   */
  async extendSubscription(phoneNumber, days) {
    try {
      const validatedPhone = supabaseService.validatePhoneNumber(phoneNumber);
      const profile = await supabaseService.getUserProfile(validatedPhone);
      
      const now = new Date();
      let startDate = new Date();
      let endDate = new Date();
      
      // Verificar si ya tiene suscripción activa y vigente
      if (profile.subscription_active && profile.subscription_end_date) {
        const currentEndDate = new Date(profile.subscription_end_date);
        
        if (currentEndDate > now) {
          // Si no ha expirado, sumar días a la fecha de fin existente
          endDate = new Date(currentEndDate);
          endDate.setDate(endDate.getDate() + days);
          startDate = new Date(profile.subscription_start_date); // Mantener fecha de inicio original
          console.log(`🔄 Extendiendo suscripción vigente para ${validatedPhone}. Nueva fin: ${endDate.toISOString()}`);
        } else {
          // Si ya expiró, iniciar desde hoy
          endDate.setDate(now.getDate() + days);
          console.log(`🔄 Renovando suscripción expirada para ${validatedPhone}. Nueva fin: ${endDate.toISOString()}`);
        }
      } else {
        // Si no tiene suscripción, crear nueva desde hoy
        endDate.setDate(now.getDate() + days);
        console.log(`✨ Iniciando nueva suscripción para ${validatedPhone}. Fin: ${endDate.toISOString()}`);
      }
      
      const updateData = {
        subscription_start_date: startDate.toISOString(),
        subscription_end_date: endDate.toISOString(),
        subscription_active: true,
        // No cambiamos manual_override automáticamente aquí, o tal vez sí? 
        // Mejor dejarlo como estaba o false si es nueva.
        // Si el usuario paga, debería ser válida.
        subscription_manual_override: profile.subscription_manual_override || false
      };
      
      const { data, error } = await supabaseService.supabase
        .from("user_profiles")
        .update(updateData)
        .eq("phone_number", validatedPhone)
        .select()
        .single();
      
      if (error) throw error;
      
      return data;
    } catch (error) {
      console.error("Error extendiendo suscripción:", error);
      throw error;
    }
  }

  /**
   * Canjear una licencia
   */
  async redeemLicense(phoneNumber, keyCode) {
    try {
      console.log(`🎟️ Intentando canjear licencia ${keyCode} para ${phoneNumber}`);
      
      // 1. Activar licencia en BD (marca como usada y valida estado)
      // Esto lanzará error si la licencia no es válida o no está pendiente
      await supabaseService.activateLicenseKey(phoneNumber, keyCode);
      
      // 2. Extender suscripción 15 días
      await this.extendSubscription(phoneNumber, 15);
      
      return { 
        success: true, 
        message: "Licencia activada exitosamente. Se han agregado 15 días a tu suscripción." 
      };
    } catch (error) {
      console.error("Error en redeemLicense:", error);
      throw error;
    }
  }

  /**
   * Desactivar suscripción manualmente (admin)
   */
  async deactivateSubscription(phoneNumber, isManual = true) {
    try {
      const validatedPhone = supabaseService.validatePhoneNumber(phoneNumber);
      
      const updateData = {
        subscription_active: false,
        subscription_manual_override: isManual
      };
      
      const { data, error } = await supabaseService.supabase
        .from("user_profiles")
        .update(updateData)
        .eq("phone_number", validatedPhone)
        .select()
        .single();
      
      if (error) throw error;
      
      console.log(`❌ Suscripción desactivada para ${validatedPhone} (${isManual ? 'manual' : 'automática'})`);
      return data;
    } catch (error) {
      console.error("Error desactivando suscripción:", error);
      throw error;
    }
  }

  /**
   * Obtener todos los usuarios con sus suscripciones (admin)
   */
  async getAllUsersWithSubscriptions() {
    try {
      console.log("📊 [SubscriptionService] Obteniendo todos los usuarios...");
      
      const { data, error } = await supabaseService.supabase
        .from("user_profiles")
        .select("phone_number, user_name, subscription_start_date, subscription_end_date, subscription_active, subscription_manual_override, created_at")
        .order("created_at", { ascending: false });
      
      if (error) {
        console.error("❌ [SubscriptionService] Error en consulta Supabase:", error);
        throw new Error(`Error consultando usuarios: ${error.message}`);
      }
      
      if (!data || data.length === 0) {
        console.log("⚠️ [SubscriptionService] No se encontraron usuarios");
        return [];
      }

      // Obtener actividad de los últimos 30 días para todos los usuarios de una vez
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

      const { data: activityData, error: activityError } = await supabaseService.supabase
        .from('conversaciones')
        .select('user_id, fecha')
        .gte('fecha', thirtyDaysAgoStr);

      const userActivityMap = {};
      if (!activityError && activityData) {
        activityData.forEach(msg => {
          const userId = msg.user_id;
          const day = msg.fecha.split('T')[0];
          if (!userActivityMap[userId]) userActivityMap[userId] = new Set();
          userActivityMap[userId].add(day);
        });
      }
      
      console.log(`✅ [SubscriptionService] ${data.length} usuarios encontrados, calculando información...`);
      
      // Calcular tiempo restante para cada usuario (con manejo de errores individual)
      const usersWithInfo = await Promise.all(
        data.map(async (user) => {
          try {
            const timeRemainingMs = await this.getTimeRemainingMs(user.phone_number);
            const timeFormatted = this.formatTimeRemaining(timeRemainingMs);
            const daysRemaining = await this.getDaysRemaining(user.phone_number);
            const subscriptionStatus = await this.isSubscriptionActive(user.phone_number);
            
            // Días de actividad (usar phone_number como llave ya que user_id en conversaciones es el teléfono)
            const activityDays = userActivityMap[user.phone_number] ? userActivityMap[user.phone_number].size : 0;

            return {
              ...user,
              daysRemaining,
              timeRemainingMs,
              timeFormatted: timeFormatted.formatted,
              isActive: subscriptionStatus.isActive,
              activityDays
            };
          } catch (userError) {
            console.error(`⚠️ [SubscriptionService] Error procesando usuario ${user.phone_number}:`, userError.message);
            // Retornar usuario con información básica si falla el procesamiento
            return {
              ...user,
              daysRemaining: 0,
              timeRemainingMs: 0,
              timeFormatted: 'Error',
              isActive: false,
              activityDays: 0
            };
          }
        })
      );
      
      console.log(`✅ [SubscriptionService] ${usersWithInfo.length} usuarios procesados exitosamente`);
      return usersWithInfo;
    } catch (error) {
      console.error("❌ [SubscriptionService] Error obteniendo usuarios:", error);
      throw error;
    }
  }
}

module.exports = new SubscriptionService();

