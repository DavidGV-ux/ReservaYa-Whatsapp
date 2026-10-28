// Services/monthlyFeedbackService.js - SERVICIO DE FEEDBACK MENSUAL
const createPostgrestClient = require("./postgrestClient");
const NodeCache = require("node-cache");
const config = require("../config");
const whatsappService = require("./whatsappService");
const supabaseService = require("./supabaseService");
const openaiService = require("./openaiService");
const profileUpdateService = require("./profileUpdateService");

class MonthlyFeedbackService {
  constructor() {
    this.supabase = createPostgrestClient();
    // Caché simple para perfiles de usuario (evitar múltiples peticiones)
    this.profileCache = new NodeCache({
      stdTTL: 600, // 10 minutos
      checkperiod: 120,
      maxKeys: 500
    });
  }

  /**
   * Obtener usuarios activos con estudio completo
   */
  async getUsersWithCompleteStudy() {
    try {
      const { data, error } = await this.supabase
        .from('user_profiles')
        .select(`
          phone_number,
          user_name,
          monthly_salary,
          currency,
          fixed_expenses,
          country,
          language
        `)
        .not('phone_number', 'is', null)
        .not('user_name', 'is', null)
        .not('monthly_salary', 'is', null)
        .not('currency', 'is', null)
        .not('fixed_expenses', 'is', null)
        .not('country', 'is', null);

      if (error) throw error;

      console.log(`📋 Usuarios con estudio completo: ${data?.length || 0}`);
      return data || [];

    } catch (error) {
      console.error('❌ Error obteniendo usuarios:', error);
      return [];
    }
  }

  /**
   * Obtener usuarios con estudio completo (usando caché cuando sea posible)
   */
  async getUsersWithCompleteStudyCached() {
    try {
      // Intentar obtener del caché
      const cacheKey = 'users_complete_study';
      const cached = this.profileCache.get(cacheKey);
      if (cached) {
        console.log(`✅ Cache hit: usuarios con estudio completo`);
        return cached;
      }

      // Si no está en caché, obtener de BD
      const users = await this.getUsersWithCompleteStudy();
      
      // Guardar en caché por 5 minutos
      this.profileCache.set(cacheKey, users, 300);
      
      return users;
    } catch (error) {
      console.error('❌ Error obteniendo usuarios con caché:', error);
      return await this.getUsersWithCompleteStudy();
    }
  }

  /**
   * Obtener conversaciones del mes pasado para un usuario
   */
  async getMonthlyConversations(userPhone, monthOffset = 1) {
    try {
      const now = new Date();
      const targetMonth = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
      const startDate = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1);
      const endDate = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0, 23, 59, 59);

      const { data, error } = await this.supabase
        .from('conversaciones')
        .select('mensaje, respuesta, fecha')
        .eq('user_phone', userPhone)
        .gte('fecha', startDate.toISOString())
        .lte('fecha', endDate.toISOString())
        .order('fecha', { ascending: true });

      if (error) throw error;

      return data || [];

    } catch (error) {
      console.error(`❌ Error obteniendo conversaciones de ${userPhone}:`, error);
      return [];
    }
  }

  /**
   * Analizar gastos del mes desde conversaciones (OPTIMIZADO - sin IA para reducir costos)
   */
  async analyzeMonthlyExpenses(conversations, userProfile) {
    try {
      if (!conversations || conversations.length === 0) {
        return {
          totalVariableExpenses: 0,
          expenseBreakdown: {},
          mainExpenseCategories: []
        };
      }

      // Análisis simple basado en palabras clave (sin usar IA para reducir costos)
      const expenseKeywords = {
        'comida': ['comida', 'restaurante', 'comer', 'almuerzo', 'cena', 'desayuno', 'supermercado', 'mercado', 'gasté en comida', 'gasté comida'],
        'transporte': ['uber', 'taxi', 'gasolina', 'transporte', 'viaje', 'gas', 'combustible', 'metro', 'bus'],
        'entretenimiento': ['cine', 'película', 'netflix', 'spotify', 'streaming', 'juego', 'videojuego', 'diversión'],
        'ropa': ['ropa', 'zapatos', 'camisa', 'pantalón', 'vestido', 'compré ropa'],
        'salud': ['médico', 'farmacia', 'medicina', 'hospital', 'doctor', 'salud'],
        'educación': ['curso', 'libro', 'universidad', 'escuela', 'educación', 'estudio'],
        'otros': ['compré', 'gasté', 'pagué', 'compras']
      };

      let totalExpenses = 0;
      const expenseBreakdown = {};
      const categoryCounts = {};

      // Buscar números y palabras clave en conversaciones
      conversations.forEach(conv => {
        const text = (conv.mensaje + ' ' + conv.respuesta).toLowerCase();
        
        // Buscar números que puedan ser gastos (formato: $100, 100 pesos, gasté 100, etc.)
        const expensePatterns = [
          /\$\s*(\d+(?:\.\d+)?)/g,
          /(\d+(?:\.\d+)?)\s*(?:pesos|dólares|euros|mxn|usd|eur)/gi,
          /gast[ée]\s*(?:de|en)?\s*(\d+(?:\.\d+)?)/gi,
          /pag[oó]\s*(?:de|por)?\s*(\d+(?:\.\d+)?)/gi,
          /compr[ée]\s*(?:de|por)?\s*(\d+(?:\.\d+)?)/gi
        ];

        expensePatterns.forEach(pattern => {
          const matches = text.matchAll(pattern);
          for (const match of matches) {
            const amount = parseFloat(match[1]);
            // Solo considerar gastos razonables (entre 10 y 100,000)
            if (amount >= 10 && amount <= 100000) {
              totalExpenses += amount;
              
              // Categorizar según palabras clave
              for (const [category, keywords] of Object.entries(expenseKeywords)) {
                if (keywords.some(keyword => text.includes(keyword))) {
                  expenseBreakdown[category] = (expenseBreakdown[category] || 0) + amount;
                  categoryCounts[category] = (categoryCounts[category] || 0) + 1;
                  break;
                }
              }
            }
          }
        });
      });

      // Obtener categorías principales (top 3)
      const mainCategories = Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([category]) => category);

      return {
        totalVariableExpenses: Math.round(totalExpenses * 100) / 100,
        expenseBreakdown,
        mainExpenseCategories: mainCategories
      };

    } catch (error) {
      console.error('❌ Error analizando gastos:', error);
      return {
        totalVariableExpenses: 0,
        expenseBreakdown: {},
        mainExpenseCategories: []
      };
    }
  }

  /**
   * Calcular ahorros del mes
   */
  calculateSavings(userProfile, variableExpenses) {
    // Asegurar que los valores sean números válidos
    const income = userProfile.monthly_salary ? parseFloat(userProfile.monthly_salary) : 0;
    const fixedExpenses = userProfile.fixed_expenses !== null && userProfile.fixed_expenses !== undefined 
      ? parseFloat(userProfile.fixed_expenses) 
      : 0;
    const variableExpensesAmount = parseFloat(variableExpenses) || 0;
    
    // Validar que los valores sean válidos
    if (isNaN(income) || income <= 0) {
      console.warn(`⚠️ Ingreso inválido para ${userProfile.phone_number}: ${userProfile.monthly_salary}`);
    }
    if (isNaN(fixedExpenses) || fixedExpenses < 0) {
      console.warn(`⚠️ Gastos fijos inválidos para ${userProfile.phone_number}: ${userProfile.fixed_expenses}`);
    }
    
    const totalExpenses = fixedExpenses + variableExpensesAmount;
    const savings = income - totalExpenses;
    const savingsPercentage = income > 0 ? (savings / income) * 100 : 0;

    console.log(`📊 Cálculo para ${userProfile.phone_number}:`, {
      income,
      fixedExpenses,
      variableExpenses: variableExpensesAmount,
      totalExpenses,
      savings,
      savingsPercentage
    });

    return {
      income,
      fixedExpenses,
      variableExpenses: variableExpensesAmount,
      totalExpenses,
      savings,
      savingsPercentage: Math.round(savingsPercentage * 10) / 10
    };
  }

  /**
   * Generar mensaje de feedback mensual (OPTIMIZADO - usa IA solo si es necesario)
   */
  async generateFeedbackMessage(userProfile, financialData, expenseAnalysis, language = 'es') {
    try {
      // Si no hay gastos variables significativos, usar mensaje simple sin IA
      if (financialData.variableExpenses < 100) {
        return this.generateFallbackMessage(userProfile, financialData, expenseAnalysis, language);
      }

      // Solo usar IA para casos con gastos significativos (reducir costos)
      const currency = userProfile.currency || 'MXN';
      const userName = userProfile.user_name || 'Usuario';
      
      // Prompt optimizado - más corto
      const prompt = `Feedback mensual financiero (máx 150 palabras):
Nombre: ${userName}
Ingreso: ${currency} ${financialData.income} | Fijos: ${currency} ${financialData.fixedExpenses} | Variables: ${currency} ${financialData.variableExpenses}
Ahorros: ${currency} ${financialData.savings} (${financialData.savingsPercentage}%)
Categorías: ${expenseAnalysis.mainExpenseCategories.join(', ') || 'N/A'}

Formato: Saludo breve + resumen + ahorros + 1 recomendación. Idioma: ${language === 'es' ? 'Español' : language === 'en' ? 'English' : 'Português'}. Emojis WhatsApp.`;

      const completion = await openaiService.callGroqCompletions({
        model: openaiService.modelName,
        messages: [
          { role: "system", content: "Asistente financiero. Feedback mensual breve y motivacional (máx 200 palabras)." },
          { role: "user", content: prompt }
        ],
        max_tokens: config.groq.maxTokens || 200, // Reducido para feedback
        temperature: 0.1,
      });
      
      return completion.choices[0]?.message?.content || '';

    } catch (error) {
      console.error('❌ Error generando feedback con IA:', error);
      // Usar fallback si falla IA
      return this.generateFallbackMessage(userProfile, financialData, expenseAnalysis, language);
    }
  }

  /**
   * Mensaje de fallback optimizado (sin IA para reducir costos)
   */
  generateFallbackMessage(userProfile, financialData, expenseAnalysis = {}, language = 'es') {
    const currency = userProfile.currency || 'MXN';
    const userName = userProfile.user_name || 'Usuario';
    
    const isPositive = financialData.savings >= 0;
    const categories = expenseAnalysis.mainExpenseCategories || [];
    const categoryAdvice = categories.length > 0 
      ? `\n💡 *Área de mejora:* Tus principales gastos fueron en ${categories.join(', ')}. Considera revisar estos rubros.`
      : '';
    
    if (language === 'es') {
      return `📊 *Feedback Mensual - ${userName}*\n\n` +
        `💰 *Resumen del Mes:*\n` +
        `Ingresos: ${currency} ${financialData.income.toLocaleString()}\n` +
        `Gastos fijos: ${currency} ${financialData.fixedExpenses.toLocaleString()}\n` +
        `Gastos variables: ${currency} ${financialData.variableExpenses.toLocaleString()}\n` +
        `Total gastos: ${currency} ${financialData.totalExpenses.toLocaleString()}\n\n` +
        `${isPositive ? '✅' : '⚠️'} *Ahorros: ${currency} ${Math.abs(financialData.savings).toLocaleString()}* (${financialData.savingsPercentage}%)\n\n` +
        `${isPositive 
          ? `¡Excelente trabajo! Estás ahorrando ${financialData.savingsPercentage}% de tus ingresos. Sigue así. 💪`
          : `Has gastado ${currency} ${Math.abs(financialData.savings).toLocaleString()} más de lo que ingresaste. Revisa tus gastos variables. 📉`
        }${categoryAdvice}\n\n` +
        `💡 *Recomendación:* Intenta seguir la regla 50/30/20:\n` +
        `• 50% necesidades\n` +
        `• 30% gustos\n` +
        `• 20% ahorro\n\n` +
        `¡Sigue trabajando en tus finanzas! 🚀`;
    } else if (language === 'en') {
      return `📊 *Monthly Feedback - ${userName}*\n\n` +
        `💰 *Month Summary:*\n` +
        `Income: ${currency} ${financialData.income}\n` +
        `Fixed expenses: ${currency} ${financialData.fixedExpenses}\n` +
        `Variable expenses: ${currency} ${financialData.variableExpenses}\n` +
        `Total expenses: ${currency} ${financialData.totalExpenses}\n\n` +
        `${isPositive ? '✅' : '⚠️'} *Savings: ${currency} ${Math.abs(financialData.savings)}* (${financialData.savingsPercentage}%)\n\n` +
        `${isPositive 
          ? `Great job! You're saving ${financialData.savingsPercentage}% of your income. Keep it up! 💪`
          : `You spent ${Math.abs(financialData.savings)} more than you earned. Review your variable expenses and find areas for improvement. 📉`
        }\n\n` +
        `💡 *Recommendation:* Try following the 50/30/20 rule:\n` +
        `• 50% needs\n` +
        `• 30% wants\n` +
        `• 20% savings\n\n` +
        `Keep working on your finances! 🚀`;
    } else {
      return `📊 *Feedback Mensal - ${userName}*\n\n` +
        `💰 *Resumo do Mês:*\n` +
        `Renda: ${currency} ${financialData.income}\n` +
        `Despesas fixas: ${currency} ${financialData.fixedExpenses}\n` +
        `Despesas variáveis: ${currency} ${financialData.variableExpenses}\n` +
        `Total de despesas: ${currency} ${financialData.totalExpenses}\n\n` +
        `${isPositive ? '✅' : '⚠️'} *Economias: ${currency} ${Math.abs(financialData.savings)}* (${financialData.savingsPercentage}%)\n\n` +
        `${isPositive 
          ? `Ótimo trabalho! Você está economizando ${financialData.savingsPercentage}% da sua renda. Continue assim! 💪`
          : `Você gastou ${Math.abs(financialData.savings)} a mais do que ganhou. Revise suas despesas variáveis e encontre áreas para melhorar. 📉`
        }\n\n` +
        `💡 *Recomendação:* Tente seguir a regra 50/30/20:\n` +
        `• 50% necessidades\n` +
        `• 30% desejos\n` +
        `• 20% economia\n\n` +
        `Continue trabalhando em suas finanças! 🚀`;
    }
  }

  /**
   * Detectar cambios de nombre y moneda en conversaciones (solo para feedback mensual)
   * Nota: No actualiza directamente, solo detecta para que el usuario pueda actualizar después
   */
  async detectProfileChanges(userPhone, conversations) {
    try {
      if (!conversations || conversations.length === 0) {
        return null;
      }

      let detectedChanges = null;
      const messagesToCheck = conversations.slice(-20); // Últimas 20 conversaciones

      for (const conv of messagesToCheck) {
        const changes = profileUpdateService.detectProfileChange(conv.mensaje);
        
        if (changes.name && !detectedChanges?.name) {
          detectedChanges = { ...detectedChanges, name: true };
        }
        
        if (changes.currency && !detectedChanges?.currency) {
          detectedChanges = { ...detectedChanges, currency: true };
        }
      }

      return detectedChanges;
    } catch (error) {
      console.error(`❌ Error detectando cambios de perfil:`, error);
      return null;
    }
  }

  /**
   * Obtener perfil de usuario con caché
   */
  async getCachedUserProfile(userPhone) {
    try {
      // Intentar obtener del caché
      const cached = this.profileCache.get(userPhone);
      if (cached) {
        console.log(`✅ Cache hit: ${userPhone}`);
        return cached;
      }

      // Si no está en caché, obtener de BD
      console.log(`📥 Cache miss: ${userPhone}, obteniendo de BD`);
      const profile = await supabaseService.getUserProfile(userPhone);
      
      if (profile) {
        // Guardar en caché
        this.profileCache.set(userPhone, profile);
      }
      
      return profile;
    } catch (error) {
      console.error(`❌ Error obteniendo perfil con caché:`, error);
      return null;
    }
  }

  /**
   * Enviar feedback mensual a un usuario
   */
  async sendMonthlyFeedback(userPhone, userProfile) {
    try {
      console.log(`📊 Generando feedback mensual para: ${userPhone}`);

      // Obtener conversaciones del mes pasado
      const conversations = await this.getMonthlyConversations(userPhone, 1);
      
      // ⚠️ NUEVO: Detectar cambios de nombre/moneda (solo detección, no actualización directa)
      // Los cambios se manejarán cuando el usuario responda en el flujo normal
      const detectedChanges = await this.detectProfileChanges(userPhone, conversations);
      
      // Obtener perfil actualizado (con caché)
      let currentProfile = await this.getCachedUserProfile(userPhone);
      
      // Usar perfil actualizado
      const profileToUse = currentProfile || userProfile;
      
      // Analizar gastos
      const expenseAnalysis = await this.analyzeMonthlyExpenses(conversations, profileToUse);
      
      // Calcular datos financieros
      const financialData = this.calculateSavings(profileToUse, expenseAnalysis.totalVariableExpenses);
      
      // Generar mensaje de feedback
      const feedbackMessage = await this.generateFeedbackMessage(
        profileToUse,
        financialData,
        expenseAnalysis,
        profileToUse.language || 'es'
      );

      // 🆕 ARCHIVAR EL MES ANTERIOR EN EL HISTORIAL (dashboard web).
      // Cada 1ro de mes el mes cerrado pasa al historial con sus gastos, el ahorro
      // (ingreso - fijos - variables) y el mensaje de felicitación/recomendación.
      // Se hace ANTES del envío por WhatsApp: si el envío falla, el informe ya quedó guardado.
      // El gasto archivado viene de transacciones (fuente de verdad del dashboard), no de
      // conversaciones; así la página siempre coincide con lo que el usuario gastó.
      const currentDate = new Date();
      const nowMonth = currentDate.getMonth();
      const prevYear = nowMonth === 0 ? currentDate.getFullYear() - 1 : currentDate.getFullYear();
      const prevMonth = nowMonth === 0 ? 12 : nowMonth;

      const prevData = await supabaseService.getMonthlyExpensesTotal(userPhone, prevYear, prevMonth);
      const prevCurrency = profileToUse.currency || 'MXN';
      const prevVariableExpenses = prevData.total[prevCurrency] || 0;
      const archiveIncome = parseFloat(profileToUse.monthly_salary) || 0;
      const archiveFixed = parseFloat(profileToUse.fixed_expenses) || 0;
      const archiveSavings = archiveIncome - archiveFixed - prevVariableExpenses;

      await supabaseService.archiveMonthlyExpense(profileToUse, {
        year: prevYear,
        month: prevMonth,
        total: prevVariableExpenses,
        currency: prevCurrency,
        savings: archiveSavings,
        savings_percentage: archiveIncome > 0 ? Math.round((archiveSavings / archiveIncome) * 1000) / 10 : 0,
        message: feedbackMessage
      });

      // Enviar por WhatsApp
      await whatsappService.sendMessage(userPhone, feedbackMessage);

      console.log(`✅ Feedback mensual enviado exitosamente a ${userPhone}`);
      return { success: true, financialData, detectedChanges };

    } catch (error) {
      console.error(`❌ Error enviando feedback a ${userPhone}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Enviar feedback mensual a todos los usuarios
   */
  async sendMonthlyFeedbackToAll() {
    try {
      console.log('🚀 Iniciando envío de feedback mensual...');
      
      // Usar caché para obtener usuarios
      const users = await this.getUsersWithCompleteStudyCached();
      
      if (users.length === 0) {
        console.log('⚠️ No hay usuarios con estudio completo para enviar feedback');
        return { total: 0, sent: 0, failed: 0 };
      }

      let sent = 0;
      let failed = 0;

      // Enviar con delay optimizado (2 segundos para reducir tiempo de ejecución)
      for (const user of users) {
        const result = await this.sendMonthlyFeedback(user.phone_number, user);

        if (result.success) {
          sent++;
        } else {
          failed++;
        }

        // Delay reducido de 3s a 2s para optimizar tiempo de Lambda
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      console.log(`✅ Feedback enviado: ${sent}/${users.length}`);
      console.log(`❌ Fallos: ${failed}`);

      return {
        total: users.length,
        sent,
        failed
      };

    } catch (error) {
      console.error('❌ Error en envío masivo de feedback:', error);
      throw error;
    }
  }

  /**
   * Obtener estadísticas de feedback
   */
  async getStats() {
    try {
      const { data, error } = await this.supabase
        .from('monthly_feedback_log')
        .select('user_phone, savings, savings_percentage, sent_at')
        .gte('sent_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());

      if (error) throw error;

      const uniqueUsers = new Set(data.map(d => d.user_phone)).size;
      const avgSavings = data.length > 0 
        ? data.reduce((sum, d) => sum + (d.savings || 0), 0) / data.length 
        : 0;
      const avgSavingsPercentage = data.length > 0
        ? data.reduce((sum, d) => sum + (d.savings_percentage || 0), 0) / data.length
        : 0;

      return {
        totalFeedbackSent: data.length,
        uniqueUsersReached: uniqueUsers,
        averageSavings: Math.round(avgSavings * 100) / 100,
        averageSavingsPercentage: Math.round(avgSavingsPercentage * 10) / 10,
        last90Days: data.length
      };

    } catch (error) {
      console.error('❌ Error obteniendo estadísticas:', error);
      return {
        totalFeedbackSent: 0,
        uniqueUsersReached: 0,
        averageSavings: 0,
        averageSavingsPercentage: 0,
        last90Days: 0
      };
    }
  }
}

module.exports = new MonthlyFeedbackService();

