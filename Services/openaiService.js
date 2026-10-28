// Services/openaiService.js — Motor de conversación del chatbot (coach financiero Fyn).
//
// Llama a Groq (endpoint compatible con la API de OpenAI) VÍA FETCH NATIVO, sin SDK.
// Razones: el SDK (groq-sdk) arrastraba node-fetch + formdata-node + web-streams-polyfill
// (~3MB en el zip de Lambda) y aquí solo se usa `chat.completions.create`.
//
// ⚠️ RESTRICCIÓN IMPORTANTE DEL API (lo aprendimos pagando el bug de los gastos):
// el modelo rechaza las peticiones cuyo ÚLTIMO mensaje no sea de rol "user"
// (400 "last message role must be 'user'"). Por eso TODAS las llamadas envían
// `[{role:"system",...}, {role:"user",...}]` y NUNCA un único mensaje "system".
//
// Además, el modelo devuelve el placeholder "XXX" cuando no infiere la moneda:
// `callGroqCompletions` no lo limpia; cada extractor lo elimina y cae al perfil.
const config = require("../config");
const supabaseService = require("./supabaseService");
const currencyService = require("./currencyService");

class OpenAIService {
  constructor() {
    if (!config.groq.apiKey) {
      throw new Error("GROQ_API_KEY no está configurada. Por favor configura tu API key de Groq.");
    }
    this.modelName = config.groq.model || 'groq/compound-mini';
    console.log(`✅ Modelo Groq configurado: ${this.modelName}`);
    this.conversationHistory = new Map();
    this.MAX_USERS_IN_MEMORY = 1000;
    this.userAccessTime = new Map();
  }

  // POST /openai/v1/chat/completions vía fetch. Timeout 30s para no dejar
  // la Lambda colgada esperando al modelo. El error SIEMPRE lleva el status HTTP
  // en el mensaje (p. ej. "429 rate limited") para que la lógica de retry
  // de generateResponse() funcione igual que con el SDK.
  async callGroqCompletions({ model, messages, max_tokens, temperature }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.groq.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens,
          temperature,
        }),
        signal: controller.signal,
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        const err = new Error(`${response.status} ${body.error?.message || body.error?.code || "Groq API error"}`);
        err.status = response.status;
        throw err;
      }
      return body;
    } finally {
      clearTimeout(timeout);
    }
  }

  needsHistorySearch(userMessage) {
    const messageLower = userMessage.toLowerCase();
    
    const searchKeywords = [
      'dijiste', 'mencionaste', 'hablamos', 'conversación', 'anterior',
      'antes', 'recuerdo', 'recuerdas', 'pregunta', 'cuando', 'te pregunté',
      'la otra vez', 'hace', 'último', 'última vez', 'referencia',
      'contexto', 'tema', 'acerca de', 'sobre lo que', 'lo que me'
    ];

    return searchKeywords.some(keyword => messageLower.includes(keyword));
  }

  extractSearchTerms(userMessage) {
    const stopWords = new Set([
      'el', 'la', 'de', 'que', 'y', 'a', 'en', 'un', 'ser', 'se', 'no',
      'haber', 'por', 'con', 'su', 'para', 'como', 'estar', 'tener',
      'dijiste', 'mencionaste', 'recuerdas', 'hablamos', 'pregunta',
      'acerca', 'sobre', 'cuando', 'vez', 'otra'
    ]);

    const words = userMessage
      .toLowerCase()
      .replace(/[^\wáéíóúñü\s]/g, ' ')
      .split(/\s+/)
      .filter(word => 
        word.length > 3 && 
        !stopWords.has(word)
      );

    const datePatterns = [
      /(\d+)\s*(de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i,
      /(ayer|anteayer|hace\s+\d+\s+(día|días|semana|semanas|mes|meses))/i,
      /(la\s+semana\s+pasada|el\s+mes\s+pasado)/i
    ];

    let dateInfo = '';
    for (const pattern of datePatterns) {
      const match = userMessage.match(pattern);
      if (match) {
        dateInfo = match[0];
        break;
      }
    }

    return {
      keywords: words.slice(0, 5),
      dateContext: dateInfo
    };
  }

  async searchPreviousConversations(userId, userMessage, limit = 5) {
    try {
      console.log(`🔍 [${userId}] Buscando conversaciones previas...`);

      const { keywords, dateContext } = this.extractSearchTerms(userMessage);
      
      if (keywords.length === 0) {
        console.log(`⚠️ [${userId}] No se encontraron términos de búsqueda`);
        return [];
      }

      console.log(`📝 [${userId}] Términos de búsqueda: [${keywords.join(', ')}]`);
      
      const messageLower = userMessage.toLowerCase();
      const isAskingAboutExpenses = ['gasto', 'gastos', 'gastado', 'gasté', 'compré', 'compras', 
                                      'expense', 'expenses', 'spent'].some(keyword => messageLower.includes(keyword));
      
      let startDate = null;
      let endDate = null;
      
      if (isAskingAboutExpenses) {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        console.log(`💰 [${userId}] Búsqueda limitada al mes actual: ${startDate} a ${endDate}`);
      } else if (dateContext) {
        const dateRange = this.calculateDateRange(dateContext);
        if (dateRange) {
          startDate = dateRange.start;
          endDate = dateRange.end;
          console.log(`📅 [${userId}] Rango de fechas: ${startDate} a ${endDate}`);
        }
      }

      const orConditions = [];
      keywords.forEach(keyword => {
        orConditions.push(`mensaje.ilike.%${keyword}%`);
        orConditions.push(`respuesta.ilike.%${keyword}%`);
      });
      
      const orQuery = orConditions.join(',');
      console.log(`🔎 [${userId}] Query construida: ${orQuery.substring(0, 100)}...`);

      let query = supabaseService.supabase
        .from('conversaciones')
        .select('id, mensaje, respuesta, fecha, hora')
        .eq('user_phone', userId)
        .or(orQuery);

      if (startDate && endDate) {
        query = query.gte('fecha', startDate);
        query = query.lte('fecha', endDate);
      }

      const { data, error } = await query
        .order('fecha', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('❌ Error buscando en Supabase:', error);
        return await this.searchSimple(userId, keywords[0], limit);
      }

      console.log(`✅ [${userId}] Encontradas ${data?.length || 0} conversaciones relevantes`);
      
      return data || [];

    } catch (error) {
      console.error('❌ Error en búsqueda de historial:', error);
      return [];
    }
  }

  async searchSimple(userId, searchTerm, limit = 5) {
    try {
      console.log(`🔄 [${userId}] Búsqueda simple fallback: "${searchTerm}"`);
      
      const { data, error } = await supabaseService.supabase
        .from('conversaciones')
        .select('id, mensaje, respuesta, fecha, hora')
        .eq('user_phone', userId)
        .or(`mensaje.ilike.%${searchTerm}%,respuesta.ilike.%${searchTerm}%`)
        .order('fecha', { ascending: false })
        .limit(limit);

      if (error) throw error;

      console.log(`✅ [${userId}] Búsqueda simple encontró ${data?.length || 0} resultados`);
      return data || [];

    } catch (error) {
      console.error('❌ Error en búsqueda simple:', error);
      return [];
    }
  }

  calculateDateRange(dateContext) {
    const now = new Date();
    const lowerContext = dateContext.toLowerCase();

    try {
      const monthMatch = lowerContext.match(/(\d+)\s*de\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i);
      if (monthMatch) {
        const day = parseInt(monthMatch[1]);
        const months = {
          'enero': 0, 'febrero': 1, 'marzo': 2, 'abril': 3, 
          'mayo': 4, 'junio': 5, 'julio': 6, 'agosto': 7,
          'septiembre': 8, 'octubre': 9, 'noviembre': 10, 'diciembre': 11
        };
        const month = months[monthMatch[2].toLowerCase()];
        const year = now.getFullYear();
        
        const targetDate = new Date(year, month, day);
        const start = new Date(targetDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(targetDate);
        end.setHours(23, 59, 59, 999);
        
        return {
          start: start.toISOString(),
          end: end.toISOString()
        };
      }

      const relativeMatch = lowerContext.match(/hace\s+(\d+)\s+(día|días|semana|semanas|mes|meses)/i);
      if (relativeMatch) {
        const amount = parseInt(relativeMatch[1]);
        const unit = relativeMatch[2].toLowerCase();
        
        const start = new Date(now);
        if (unit.includes('día')) {
          start.setDate(start.getDate() - amount - 1);
        } else if (unit.includes('semana')) {
          start.setDate(start.getDate() - (amount * 7) - 3);
        } else if (unit.includes('mes')) {
          start.setMonth(start.getMonth() - amount - 1);
        }
        
        return {
          start: start.toISOString(),
          end: now.toISOString()
        };
      }

      if (lowerContext.includes('ayer')) {
        const yesterday = new Date(now);
        if (lowerContext.includes('ante')) {
          yesterday.setDate(yesterday.getDate() - 2);
        } else {
          yesterday.setDate(yesterday.getDate() - 1);
        }
        yesterday.setHours(0, 0, 0, 0);
        const end = new Date(yesterday);
        end.setHours(23, 59, 59, 999);
        
        return {
          start: yesterday.toISOString(),
          end: end.toISOString()
        };
      }

    } catch (error) {
      console.error('Error calculando rango de fechas:', error);
      return null;
    }

    return null;
  }

  formatSearchResults(results) {
    if (!results || results.length === 0) {
      return '';
    }

    const shortFormatted = results.slice(0, 2).map((r, i) => {
      const fecha = new Date(r.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
      return `[${fecha}] Usuario: "${r.mensaje.substring(0, 50)}..." | Bot: "${r.respuesta.substring(0, 50)}..."`;
    }).join('\n');

    return `📚 Conversaciones previas:\n${shortFormatted}\n⚠️ Usa esta info para responder.`;
  }

  convertHistoryToGroqFormat(history) {
    return history.map(msg => ({
      role: msg.role === 'assistant' ? 'assistant' : msg.role === 'system' ? 'system' : 'user',
      content: msg.content
    }));
  }

  async generateResponse(userId, userMessage, userProfile) {
    try {
      this.userAccessTime.set(userId, Date.now());
      const isDemo = String(userId).startsWith('demo:');

      if (this.conversationHistory.size > this.MAX_USERS_IN_MEMORY) {
        this.cleanupInactiveUsers();
      }

      let historicalContext = '';
      const needsSearch = !isDemo && this.needsHistorySearch(userMessage);
      
      if (needsSearch) {
        try {
          const searchResults = await this.searchPreviousConversations(userId, userMessage, 5);
          if (searchResults.length > 0) {
            historicalContext = this.formatSearchResults(searchResults);
          }
        } catch (error) {
          console.error(`❌ [${userId}] Error en búsqueda de historial:`, error);
        }
      }

      // ⚠️ OBTENER CONTEXTO FINANCIERO SIEMPRE (Mejora de precisión)
      let financialContext = '';
      let healthScoreContext = '';
      if (!isDemo) {
        try {
          const now = new Date();
          const currentMonth = now.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
          
          const [expensesData, balanceData, healthScoreRow] = await Promise.all([
            supabaseService.getMonthlyExpensesTotal(userId),
            supabaseService.getAvailableBalance(userId),
            supabaseService.getFinancialHealthScore({ phoneNumber: userId }).catch(() => null)
          ]);
          
          const currency = userProfile?.currency || 'MXN';
          const totalExpenses = expensesData.total[currency] || 0;
          
          financialContext = `\n\n📊 ESTADO FINANCIERO ACTUAL (${currentMonth}):
- Salario Mensual: ${currency} ${(balanceData?.monthlySalary || userProfile?.monthly_salary || 0).toLocaleString()}
- Gastos Fijos: ${currency} ${(balanceData?.fixedExpenses || userProfile?.fixed_expenses || 0).toLocaleString()}
- Gastos Variables (Este mes): ${currency} ${totalExpenses.toLocaleString()}
- Disponible hoy: ${currency} ${(balanceData?.availableBalance || 0).toLocaleString()}
- Porcentaje de presupuesto usado: ${balanceData?.budgetPercentage || 0}%`;

          // ===== FYN HEALTH SCORE CONTEXT =====
          if (healthScoreRow && typeof healthScoreRow.score === 'number') {
            const level = healthScoreRow.level || 'Regular';
            const breakdown = healthScoreRow.category_breakdown || {};
            const attempts = healthScoreRow.attempt_count || 1;

            const categories = Object.entries(breakdown);
            const sorted = [...categories].sort((a, b) => (a[1]?.pct || 0) - (b[1]?.pct || 0));
            const weak = sorted.filter(([, v]) => (v?.pct || 0) < 50).map(([k]) => k);
            const strong = [...sorted].reverse().filter(([, v]) => (v?.pct || 0) >= 75).map(([k]) => k);

            healthScoreContext = `\n\n🎯 SCORE DE SALUD FINANCIERA FYN (PERFIL DEL USUARIO):
- Score actual: ${healthScoreRow.score}/100
- Nivel: ${level}
- Intento #${attempts} ${healthScoreRow.created_at ? `(calculado: ${new Date(healthScoreRow.created_at).toLocaleDateString('es-ES')})` : ''}
- Áreas MÁS DÉBILES (prioridad para Fyn): ${weak.length ? weak.join(', ') : 'Ninguna — excelente perfil!'}
- Áreas MÁS FUERTES (seguir así): ${strong.length ? strong.join(', ') : 'Por definir'}
- Desglose por categoría (0%-100%):
  ${categories.map(([k, v]) => `- ${k}: ${v?.pct || 0}% (${v?.points || 0}/4pts)`).join('\n  ')}

=== INSTRUCCIONES DE COACHING ESPECÍFICAS PARA ESTE USUARIO ===
Dependiendo del NIVEL de score, adapta TODO tu estilo y prioridades:

1. NIVEL CRÍTICO (0-39): ACTIVA EL MODO "Acompañamiento INTENSIVO".
   - No des consejos generales: empieza SIEMPRE por su categoría MÁS DÉBIL.
   - Formula planes de 1 SEMANA (pasos concretos de acción, no teoría).
   - Usa tono comprensivo, empático, sin juzgar. Anímalo mucho, da esperanza.
   - Sugiere hablar 1 vez al día para hacer seguimiento.

2. NIVEL REGULAR (40-59): MODO "Plan estructurado + metas semanales".
   - Organiza tus consejos por PRIORIDAD: ataca primero 2 categorías más débiles.
   - Propón METAS SEMANALES MEDIBLES (ej: "esta semana ahorra el 5%").
   - Al final de cada consejo, pregunta "¿Te ayudo a arrancar con X hoy?".

3. NIVEL BUENA (60-79): MODO "Optimización + aceleración de metas".
   - Refuerza las áreas fuertes pero sugiere mejorar las regulares.
   - Empieza a recomendar ESTRATEGIAS DE INVERSIÓN y 50/30/20 proactivo.
   - Pregunta por metas a mediano plazo (viajes, carro, casa, emprendimiento).

4. NIVEL EXCELENTE (80-100): MODO "Mentor patrimonial avanzado".
   - Ya NO hables de ahorro básico: enfócate en INVERSIONES, DIVERSIFICACIÓN, cobertura, protección.
   - Presúntale estrategias avanzadas (CDT, fondos indexados, dolarización, bienes raíces, etc.).
   - Motívalo a ser embajador Fyn y enseñar a otros su método.

Si el usuario sube de nivel comparado con intentos anteriores, RECONÓCELO y felicítalo mucho.
Si su score baja, pregúntale qué pasó y ayúdalo a volver a la senda.`;
          }
          // ===================================

          const messageLower = userMessage.toLowerCase();
          const isAskingForDetails = ['cuáles', 'cuales', 'qué', 'que', 'lista', 'detalle', 'ver', 'dime'].some(k => messageLower.includes(k)) && 
                                    ['gasto', 'gastos', 'compras', 'transacciones'].some(k => messageLower.includes(k));
          
          if (isAskingForDetails) {
            const expensesList = await supabaseService.getCurrentMonthExpensesList(userId);
            if (expensesList && expensesList.length > 0) {
              financialContext += `\n\n📝 ÚLTIMOS MOVIMIENTOS:`;
              expensesList.slice(0, 5).forEach(e => {
                financialContext += `\n- ${new Date(e.date).toLocaleDateString('es-ES', {day:'2-digit', month:'short'})}: ${e.description} (${currency} ${e.amount.toLocaleString()})`;
              });
            }
          }
        } catch (err) {
          console.error(`❌ [${userId}] Error obteniendo contexto financiero:`, err);
        }
      }

      if (!this.conversationHistory.has(userId)) {
        const profileContext = this.buildProfileContext(userProfile);
        const userLanguage = userProfile?.language || 'es';
        
        const basePrompts = {
          'es': `Eres Fyn, un coach financiero experto y cercano. Tu misión es dar recomendaciones específicas basadas en los números reales del usuario.

REGLAS DE ORO:
1. USA EL CONTEXTO: Si el usuario te pregunta "¿cómo voy?", analiza su "Disponible hoy" y "Porcentaje de presupuesto usado" para dar un diagnóstico real.
2. SÉ PROACTIVO: Si ves que le queda poco dinero y es temprano en el mes, adviértele amigablemente.
3. PERSONALIZACIÓN: Llama al usuario por su nombre si lo conoces y usa su moneda (${userProfile?.currency || 'MXN'}).
4. BREVEDAD: Máximo 3 oraciones. Sé directo pero empático.

Datos del usuario: ${profileContext}.`,
          'en': `You are Fyn, an expert and friendly financial coach. Your mission is to provide specific recommendations based on the user's real numbers.

GOLDEN RULES:
1. USE CONTEXT: If the user asks "how am I doing?", analyze their "Available today" and "Budget percentage used" to give a real diagnosis.
2. BE PROACTIVE: If you see they have little money left and it's early in the month, warn them friendly.
3. PERSONALIZATION: Call the user by name if you know it and use their currency (${userProfile?.currency || 'USD'}).
4. BREVITY: Maximum 3 sentences. Be direct but empathetic.

User data: ${profileContext}.`,
          'pt': `Você é o Fyn, um coach financeiro especialista e amigável. Sua missão é fornecer recomendações específicas com base nos números reais do usuário.

REGRAS DE OURO:
1. USE O CONTEXTO: Se o usuário perguntar "como estou?", analise o "Disponível hoje" e a "Porcentagem do orçamento usado" para dar um diagnóstico real.
2. SEJA PROATIVO: Se vir que resta pouco dinheiro e ainda é cedo no mês, avise-o amigavelmente.
3. PERSONALIZAÇÃO: Chame o usuário pelo nome, se o conhecer, e use sua moeda (${userProfile?.currency || 'BRL'}).
4. BREVIDADE: No máximo 3 frases. Seja direto, mas empático.

Dados do usuário: ${profileContext}.`
        };
        
        const systemPrompt = basePrompts[userLanguage] || basePrompts['es'];
        
        this.conversationHistory.set(userId, [{ role: "system", content: systemPrompt }]);
      }

      const history = this.conversationHistory.get(userId);
      
      if (financialContext) {
        history.push({ role: "system", content: `ESTADO ACTUAL DEL USUARIO:${financialContext}` });
      }

      if (healthScoreContext) {
        history.push({ role: "system", content: healthScoreContext });
      }

      if (historicalContext) {
        history.push({ role: "system", content: historicalContext });
      }

      history.push({ role: "user", content: userMessage });

      const maxHistory = config.groq.maxHistoryMessages || 6;
      if (history.length > maxHistory) {
        const systemMessages = history.filter(m => m.role === "system").slice(0, 1);
        const userAssistantMessages = history.filter(m => m.role !== "system").slice(-(maxHistory - 1));
        this.conversationHistory.set(userId, [...systemMessages, ...userAssistantMessages]);
      }

      const messages = this.convertHistoryToGroqFormat(history);

      let assistantMessage = "";
      let retryCount = 0;
      const maxRetries = 2;

      while (retryCount <= maxRetries) {
        try {
          const completion = await this.callGroqCompletions({
            model: this.modelName,
            messages: messages,
            max_tokens: config.groq.maxTokens || 150,
            temperature: 0.1,
          });

          assistantMessage = completion.choices[0]?.message?.content || "";
          if (assistantMessage) break;
        } catch (error) {
          const isRateLimit = error.message && (error.message.includes('429') || error.message.includes('503') || error.message.includes('rate limit'));
          if (isRateLimit && retryCount < maxRetries) {
            retryCount++;
            await new Promise(resolve => setTimeout(resolve, retryCount * 2000));
            continue;
          }
          throw error;
        }
      }

      if (!assistantMessage) throw new Error("No response from Groq.");

      history.push({ role: "assistant", content: assistantMessage });
      return assistantMessage;

    } catch (error) {
      console.error("Error con Groq:", error);
      const isRecoverable = error.message && (error.message.includes('429') || error.message.includes('503') || error.message.includes('rate limit'));
      if (isRecoverable) return this.generateFallbackResponse(userMessage, userProfile);
      throw error;
    }
  }

  buildProfileContext(profile) {
    if (!profile) return "";
    const parts = [];
    if (profile.user_name) parts.push(`Nombre: ${profile.user_name}`);
    if (profile.city && profile.country) parts.push(`Ubicación: ${profile.city}, ${profile.country}`);
    else if (profile.country) parts.push(`País: ${profile.country}`);
    const currency = profile.currency || 'COP';
    if (profile.monthly_salary) parts.push(`Salario Mensual: ${profile.monthly_salary} ${currency}`);
    if (profile.fixed_expenses !== null && profile.fixed_expenses !== undefined) parts.push(`Gastos Fijos: ${profile.fixed_expenses} ${currency}`);
    parts.push(`IMPORTANTE: Los gastos variables se reinician cada mes automáticamente.`);
    return parts.join('. ') + '.';
  }

  generateFallbackResponse(userMessage, userProfile) {
    const userLanguage = userProfile?.language || 'es';
    const messageLower = userMessage.toLowerCase();
    const userName = userProfile?.user_name ? userProfile.user_name.split(' ')[0] : '';
    if (messageLower.includes('hola')) return `¡Hola${userName ? ' ' + userName : ''}! Soy Fyn, tu coach financiero. Estoy teniendo un poquito de demora, pero aquí estoy. ¿En qué puedo ayudarte?`;
    return `¡Soy Fyn! Estoy teniendo una pequeña demora temporal. Por favor intenta de nuevo en un momento.`;
  }

  cleanExtractedName(name) {
    if (!name || typeof name !== 'string') return null;
    let cleaned = name.trim();
    const phrasesToRemove = ['mi nombre es', 'me llamo', 'soy', 'nombre:'];
    for (const phrase of phrasesToRemove) {
      const regex = new RegExp(`^${phrase}\\s+`, 'i');
      cleaned = cleaned.replace(regex, '').trim();
    }
    cleaned = cleaned.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '').trim();
    if (cleaned.length < 2) return null;
    return cleaned.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
  }

  parseStudyInfoManually(message) {
    const info = {};
    const lines = message.split('\n').map(l => l.trim()).filter(l => l);
    const countries = ['Colombia', 'México', 'Mexico', 'España', 'Argentina', 'Chile', 'Perú', 'Ecuador', 'Venezuela', 'Brasil', 'Estados Unidos'];
    const currencies = ['MXN', 'USD', 'EUR', 'COP', 'ARS', 'CLP', 'PEN', 'BRL', 'VES'];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lowerLine = line.toLowerCase();
      if (lowerLine.startsWith('nombre:')) info.user_name = this.cleanExtractedName(line.substring(7));
      if (lowerLine.startsWith('ingreso:')) info.monthly_salary = parseFloat(line.substring(8).replace(/[^\d.]/g, ''));
      if (lowerLine.startsWith('moneda:')) info.currency = line.substring(7).trim().toUpperCase();
      if (lowerLine.includes('gasto') && lowerLine.includes('fijo')) info.fixed_expenses = parseFloat(line.replace(/[^\d.]/g, ''));
      if (lowerLine.startsWith('país:')) info.country = line.substring(5).trim();
    }
    return info;
  }

  async extractUserInfo(message) {
    const manualInfo = this.parseStudyInfoManually(message);
    if (manualInfo.user_name && manualInfo.monthly_salary && manualInfo.currency) return manualInfo;
    try {
      const prompt = `Extrae JSON con: user_name, monthly_salary, currency, fixed_expenses, country. Mensaje: ${message}`;
      const completion = await this.callGroqCompletions({
        model: this.modelName,
        messages: [
          { role: "system", content: "Eres un extractor de datos financieros. Responde SOLO con JSON válido, sin texto adicional." },
          { role: "user", content: prompt }
        ],
        max_tokens: 100,
        temperature: 0.1,
      });
      const content = completion.choices[0]?.message?.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) return { ...JSON.parse(jsonMatch[0]), ...manualInfo };
    } catch (e) {
      console.warn("Error Groq extract:", e.message);
    }
    return manualInfo;
  }

  async extractUserData(message, currentProfile) {
    try {
      const lowerMessage = message.toLowerCase();
      const expenseKeywords = ["gasto", "gasté", "compré", "pagué"];
      const profileKeywords = ["mi salario", "ingreso mensual", "gastos fijos"];
      
      if (profileKeywords.some(k => lowerMessage.includes(k))) return await this.extractUserInfo(message);
      if (expenseKeywords.some(k => lowerMessage.includes(k))) return { transaction: await this.extractTransactionInfo(message, currentProfile) };
      return { transaction: await this.extractTransactionInfo(message, currentProfile) };
    } catch (error) {
      return {};
    }
  }

  // Extracción de transacción de un mensaje libre ("gasto de 100000", "gasté 50 en Uber").
  // Estrategia de dos capas:
  //   1) parseTransactionManually(): fast-path con regex para los patrones más comunes.
  //      Evita LATENCIA, COSTO y FALLAS de la IA en lo trivial. (Este fast-path fue la
  //      solución al bug: "gasto de 100000" no se registraba).
  //   2) Si el parser manual no aplica, se pregunta al modelo con system+user (el rol user
  //      es obligatorio; ver header del archivo).
  // La moneda "XXX" (placeholder del modelo) se descarta y cae al perfil del usuario.
  async extractTransactionInfo(message, userProfile) {
    const manualTx = this.parseTransactionManually(message, userProfile);
    if (manualTx) return manualTx;
    try {
      const currencyHint = userProfile?.currency ? ` Si el usuario no menciona una moneda, usa ${userProfile.currency}.` : '';
      const prompt = `Extrae JSON de transacción: { "isTransaction": true, "type": "expense"|"income", "amount": number, "currency": "XXX", "description": "string", "category": "string" }.${currencyHint} Mensaje: ${message}`;
      const completion = await this.callGroqCompletions({
        model: this.modelName,
        messages: [
          { role: "system", content: "Eres un extractor de datos financieros. Responde SOLO con JSON válido, sin texto adicional." },
          { role: "user", content: prompt }
        ],
        max_tokens: 150,
        temperature: 0.1,
      });
      const jsonMatch = (completion.choices[0]?.message?.content || '').match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        if (data.isTransaction && data.amount > 0) {
          const currency = String(data.currency || '').toUpperCase();
          if (currency && currency !== 'XXX' && /^[A-Z]{3}$/.test(currency)) {
            data.currency = currency;
          } else {
            delete data.currency;
          }
          return data;
        }
      }
    } catch (e) {
      console.warn('Error Groq tx:', e.message);
    }
    return null;
  }

  // Fast-path sin IA: reconoce frases de gasto simples y devuelve la transacción en ~1ms.
  // Nunca debe devolver null de forma incorrecta para frases SIN gasto (solo activa con
  // verbos de compra/pago). No maneja ingresos a propósito: evita clasificar mal.
  parseTransactionManually(message, userProfile) {
    try {
      const lower = message.toLowerCase();
      const isExpense = /(gast(e|é|o|ó)|gasto de|compr[ée]|pagu[ée]|pago de)/.test(lower);
      if (!isExpense) return null;
      const amountMatch = lower.match(/\d{1,3}(?:[.,]\d{3})+|\d+/);
      if (!amountMatch) return null;
      const amount = parseFloat(amountMatch[0].replace(/\./g, '').replace(/,/g, ''));
      if (!(amount > 0)) return null;
      const currencyMap = { usd: 'USD', dolar: 'USD', dolares: 'USD', dólar: 'USD', dólares: 'USD', euro: 'EUR', euros: 'EUR', mxn: 'MXN', peso: 'MXN', pesos: 'MXN', cop: 'COP', ars: 'ARS', soles: 'PEN', pen: 'PEN', brl: 'BRL', real: 'BRL', reales: 'BRL' };
      const currencyToken = (lower.match(/(usd|d[oó]lares?|eur(?:o|os)?|pesos?|mxc|mxn|cop|ars|soles|pen|brl|reales?)/) || [])[1];
      const currency = (currencyToken && currencyMap[currencyToken]) || userProfile?.currency || null;
      const descriptionMatch = lower.match(/en\s+([a-záéíóúñ ]+)$/);
      const description = descriptionMatch ? descriptionMatch[1].trim() : message.slice(0, 60);
      return { isTransaction: true, type: 'expense', amount, currency, description, category: null };
    } catch (e) {
      return null;
    }
  }

  clearHistory(userId) {
    this.conversationHistory.delete(userId);
  }

  cleanupInactiveUsers() {
    const now = Date.now();
    for (const [userId, lastAccess] of this.userAccessTime.entries()) {
      if (now - lastAccess > 30 * 60 * 1000) {
        this.conversationHistory.delete(userId);
        this.userAccessTime.delete(userId);
      }
    }
  }

  async analyzeImage(imageBuffer, userLanguage = 'es') {
    return { esFactura: false, resumen: "Análisis de imagen no disponible." };
  }
}

module.exports = new OpenAIService();
