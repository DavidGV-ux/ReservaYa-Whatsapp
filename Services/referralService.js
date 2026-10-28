// Services/referralService.js - Lógica del sistema de referidos
const supabaseService = require('./supabaseService');

class ReferralService {
  constructor() {
    this.TRIAL_DAYS = 3;
    this.REWARD_COOLDOWN_DAYS = 15;
  }

  /**
   * Aplicar un código de referido a un usuario
   * @param {string} userPhone - Teléfono del usuario que ingresa el código (referido)
   * @param {string} code - Código de referido ingresado
   */
  async applyReferralCode(userPhone, code) {
    try {
      const codeUpper = code.trim().toUpperCase();
      
      // 1. Obtener el usuario que ingresa el código
      const referee = await supabaseService.getUserProfile(userPhone);
      if (!referee) throw new Error('Usuario no encontrado');
      
      if (referee.referred_by) {
        throw new Error('Ya has utilizado un código de referido anteriormente');
      }

      // 2. Buscar al dueño del código (referrer)
      const { data: referrer, error: referrerError } = await supabaseService.supabase
        .from('user_profiles')
        .select('*')
        .eq('referral_code', codeUpper)
        .maybeSingle();

      if (referrerError || !referrer) {
        throw new Error('El código de referido no es válido');
      }

      if (referrer.id === referee.id) {
        throw new Error('No puedes usar tu propio código de referido');
      }

      // 3. Verificar límite de recompensa para el referrer (1 vez cada 15 días para prueba gratis)
      const now = new Date();
      let rewardType = '3_days_free';
      let canGetTrial = true;

      if (referrer.last_referral_reward_at) {
        const lastReward = new Date(referrer.last_referral_reward_at);
        const diffDays = (now - lastReward) / (1000 * 60 * 60 * 24);
        
        if (diffDays < this.REWARD_COOLDOWN_DAYS) {
          canGetTrial = false;
          // Si no puede recibir prueba gratis, le damos el beneficio de "descuento pendiente" para su próxima renovación
          rewardType = '10_percent_discount';
        }
      }

      // 4. Aplicar beneficios
      const results = [];

      // A. Marcar al referee como referido por alguien
      await supabaseService.supabase
        .from('user_profiles')
        .update({ referred_by: referrer.id })
        .eq('id', referee.id);

      // B. Dar beneficio al referrer
      if (canGetTrial) {
        // Extender suscripción actual del referrer por 3 días
        const currentEndDate = referrer.subscription_end_date ? new Date(referrer.subscription_end_date) : new Date();
        const baseDate = currentEndDate > now ? currentEndDate : now;
        const newEndDate = new Date(baseDate.getTime() + (this.TRIAL_DAYS * 24 * 60 * 60 * 1000));

        await supabaseService.supabase
          .from('user_profiles')
          .update({ 
            subscription_end_date: newEndDate.toISOString(),
            subscription_active: true,
            last_referral_reward_at: now.toISOString()
          })
          .eq('id', referrer.id);
        
        results.push(`¡Éxito! Se han añadido ${this.TRIAL_DAYS} días gratis a la cuenta del referente.`);
      } else {
        // Marcar descuento del 10% pendiente para el referrer
        await supabaseService.supabase
          .from('user_profiles')
          .update({ 
            referral_discount_pending: true,
            last_referral_reward_at: now.toISOString()
          })
          .eq('id', referrer.id);
        
        results.push('¡Éxito! Se ha registrado un descuento del 10% para la próxima renovación del referente.');
      }

      // 5. Registrar en el historial de referidos
      await supabaseService.supabase
        .from('referrals')
        .insert([{
          referrer_id: referrer.id,
          referred_id: referee.id,
          reward_type: rewardType
        }]);

      return {
        success: true,
        message: results.join(' '),
        rewardType
      };

    } catch (error) {
      console.error('Error aplicando código de referido:', error.message);
      throw error;
    }
  }

  /**
   * Obtener lista de usuarios con descuentos o promos activas (Admin)
   */
  async getReferralStatusList() {
    try {
      const { data, error } = await supabaseService.supabase
        .from('user_profiles')
        .select('id, phone_number, user_name, referral_code, referral_discount_pending, last_referral_reward_at')
        .or('referral_discount_pending.eq.true, last_referral_reward_at.not.is.null')
        .order('last_referral_reward_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error obteniendo lista de referidos:', error);
      throw error;
    }
  }

  /**
   * Marcar descuento como aplicado (Admin)
   */
  async markDiscountAsApplied(userId) {
    try {
      const { error } = await supabaseService.supabase
        .from('user_profiles')
        .update({ referral_discount_pending: false })
        .eq('id', userId);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('Error marcando descuento como aplicado:', error);
      throw error;
    }
  }
}

module.exports = new ReferralService();
