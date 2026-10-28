// Services/metricsService.js - Cálculo de métricas de negocio (MRR, Uso, Retención)
const supabaseService = require('./supabaseService');

class MetricsService {
  constructor() {
    this.PRICE_PER_SUBSCRIPTION = 4; // USD por cada ciclo de suscripción (15 días)
  }

  /**
   * Obtener resumen de métricas generales
   */
  async getBusinessMetrics() {
    try {
      console.log("📊 [MetricsService] Calculando métricas de negocio...");
      
      const [mrrData, usageData, retentionData, churnData] = await Promise.all([
        this.calculateMRR(),
        this.calculateUsage(),
        this.calculateRetention(),
        this.calculateChurn()
      ]);

      // Calculamos ARPU y LTV usando los datos del MRR ya obtenidos
      const revenueData = await this.calculateRevenueMetrics(mrrData);

      return {
        financials: {
          ...mrrData,
          ...revenueData
        },
        usage: usageData,
        retention: retentionData,
        churn: churnData,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error("❌ [MetricsService] Error calculando métricas:", error);
      throw error;
    }
  }

  /**
   * ARPU (Ingreso Promedio por Usuario) y LTV Estimado
   */
  async calculateRevenueMetrics(mrrData) {
    const arpu = mrrData.totalPaidUsers > 0 
      ? mrrData.mrr / mrrData.totalPaidUsers 
      : 0;
    
    // Asumiendo un Churn Rate estimado mensual del 10% (0.1) temporalmente
    // LTV = ARPU / Churn Rate
    const estimatedLtv = arpu / 0.1; 

    return {
      arpu: parseFloat(arpu.toFixed(2)),
      estimatedLtv: parseFloat(estimatedLtv.toFixed(2)),
      currency: 'USD'
    };
  }

  /**
   * Churn Rate = Usuarios que cancelaron o no renovaron en los últimos 30 días
   */
  async calculateChurn() {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoStr = thirtyDaysAgo.toISOString();

      // Usuarios cuya suscripción expiró en los últimos 30 días y no está activa
      const { count: churnedUsers, error } = await supabaseService.supabase
        .from('user_profiles')
        .select('*', { count: 'exact', head: true })
        .eq('subscription_active', false)
        .gte('subscription_end_date', thirtyDaysAgoStr);

      if (error) throw error;

      return {
        churnedUsersTotal: churnedUsers || 0,
        period: 'Last 30 days'
      };
    } catch (error) {
      console.error("Error calculando Churn:", error);
      return { churnedUsersTotal: 0, error: error.message };
    }
  }

  /**
   * MRR = (Usuarios con suscripción activa REAL) * Precio por ciclo * 2 (para mensualizar)
   */
  async calculateMRR() {
    try {
      const now = new Date().toISOString();
      
      // Contar usuarios que tienen subscription_active = true Y la fecha de fin no ha pasado
      const { count: activePaidUsers, error: mrrError } = await supabaseService.supabase
        .from('user_profiles')
        .select('*', { count: 'exact', head: true })
        .eq('subscription_active', true)
        .gt('subscription_end_date', now);

      if (mrrError) throw mrrError;

      const totalPaidUsers = activePaidUsers || 0;
      // Multiplicamos por 2 para estandarizar a un mes (30 días) ya que el ciclo es de 15 días
      const mrr = totalPaidUsers * this.PRICE_PER_SUBSCRIPTION * 2;

      return {
        totalPaidUsers,
        mrr,
        currency: 'USD',
        pricePerCycle: this.PRICE_PER_SUBSCRIPTION,
        monthlyRatePerUser: this.PRICE_PER_SUBSCRIPTION * 2
      };
    } catch (error) {
      console.error("Error calculando MRR:", error);
      return { totalPaidUsers: 0, mrr: 0, error: error.message };
    }
  }

  /**
   * Uso = Mensajes totales, mensajes hoy, usuarios activos hoy
   */
  async calculateUsage() {
    try {
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      
      // 1. Mensajes totales
      const { count: totalMessages, error: msgError } = await supabaseService.supabase
        .from('conversaciones')
        .select('*', { count: 'exact', head: true });

      if (msgError) throw msgError;

      // 2. Mensajes hoy
      const { count: messagesToday, error: todayMsgError } = await supabaseService.supabase
        .from('conversaciones')
        .select('*', { count: 'exact', head: true })
        .gte('fecha', todayStr);

      if (todayMsgError) throw todayMsgError;

      // 3. Usuarios activos hoy (distintos user_phone en conversaciones de hoy)
      const { data: activeUsersTodayData, error: activeUsersError } = await supabaseService.supabase
        .from('conversaciones')
        .select('user_phone')
        .gte('fecha', todayStr);

      if (activeUsersError) throw activeUsersError;
      
      const activeUsersToday = new Set(activeUsersTodayData.map(u => u.user_phone)).size;

      // 4. Mensajes por día (últimos 7 días para gráfico)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(now.getDate() - 7);
      const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

      const { data: lastMessages, error: lastMsgError } = await supabaseService.supabase
        .from('conversaciones')
        .select('fecha')
        .gte('fecha', sevenDaysAgoStr);

      if (lastMsgError) throw lastMsgError;

      const messagesByDay = {};
      lastMessages.forEach(m => {
        const day = m.fecha.split('T')[0];
        messagesByDay[day] = (messagesByDay[day] || 0) + 1;
      });

      return {
        totalMessages,
        messagesToday,
        activeUsersToday,
        messagesByDay: Object.entries(messagesByDay)
          .map(([date, count]) => ({ date, count }))
          .sort((a, b) => a.date.localeCompare(b.date))
      };
    } catch (error) {
      console.error("Error calculando Uso:", error);
      return { error: error.message };
    }
  }

  /**
   * Retención = % de usuarios que regresan
   */
  async calculateRetention() {
    try {
      // 1. Total usuarios
      const { count: totalUsers, error: userError } = await supabaseService.supabase
        .from('user_profiles')
        .select('*', { count: 'exact', head: true });

      if (userError) throw userError;

      // 2. Usuarios recurrentes (que tienen mensajes en al menos 2 días distintos)
      // Optimizamos: solo traer los últimos 30 días para calcular retención reciente
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

      const { data: recurringData, error: recurringError } = await supabaseService.supabase
        .from('conversaciones')
        .select('user_phone, fecha')
        .gte('fecha', thirtyDaysAgoStr);

      if (recurringError) throw recurringError;

      const userDays = {};
      recurringData.forEach(m => {
        const day = m.fecha.split('T')[0];
        if (!userDays[m.user_phone]) userDays[m.user_phone] = new Set();
        userDays[m.user_phone].add(day);
      });

      const recurringUsersCount = Object.values(userDays).filter(days => days.size >= 2).length;
      const retentionRate = totalUsers > 0 ? (recurringUsersCount / totalUsers) * 100 : 0;

      // --- NUEVO: Cálculo de Tasa de Activación de Suscriptores ---
      // 1. Obtener IDs de usuarios con suscripción activa real (booleano true y fecha vigente)
      const now = new Date().toISOString();
      const { data: subscribedUsers, error: subError } = await supabaseService.supabase
        .from('user_profiles')
        .select('phone_number')
        .eq('subscription_active', true)
        .gt('subscription_end_date', now);

      if (subError) throw subError;

      const totalSubscribed = subscribedUsers?.length || 0;
      const subscribedPhones = new Set(subscribedUsers?.map(u => u.phone_number) || []);
      
      // 2. Contar cuántos de esos suscriptores tienen al menos 1 día de actividad en los últimos 30 días
      const activeSubscribedCount = Object.keys(userDays).filter(phone => subscribedPhones.has(phone)).length;
      
      // 3. Calcular ratio (Tasa de Uso de Suscriptores)
      const subscriberUsageRate = totalSubscribed > 0 
        ? parseFloat(((activeSubscribedCount / totalSubscribed) * 100).toFixed(1)) 
        : 0;

      // --- Cálculo de uso promedio por usuario ---
      // Calculamos el promedio de días de actividad por usuario en los últimos 30 días
      const userActivityDays = Object.values(userDays).map(days => days.size);
      const totalActivityDays = userActivityDays.reduce((acc, days) => acc + days, 0);
      const avgUsageDaysPerUser = userActivityDays.length > 0 
        ? parseFloat((totalActivityDays / userActivityDays.length).toFixed(1)) 
        : 0;

      // Calculamos el promedio general (considerando a TODOS los usuarios registrados)
      const avgGeneralUsageDays = totalUsers > 0 
        ? parseFloat((totalActivityDays / totalUsers).toFixed(1)) 
        : 0;

      return {
        totalUsers,
        recurringUsersCount,
        retentionRate: parseFloat(retentionRate.toFixed(1)),
        avgUsageDaysPerUser,
        avgGeneralUsageDays,
        subscriberUsageRate,
        totalSubscribed,
        activeSubscribedCount,
        period: 'Last 30 days'
      };
    } catch (error) {
      console.error("Error calculando Retención:", error);
      return { error: error.message };
    }
  }
}

module.exports = new MetricsService();
