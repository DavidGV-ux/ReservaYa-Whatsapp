// Services/profileUpdateService.js - SERVICIO PARA ACTUALIZACIONES DE PERFIL CON VALIDACIÓN (v1.1 Coach)
const supabaseService = require("./supabaseService");
const whatsappService = require("./whatsappService");
const currencyService = require("./currencyService");
const openaiService = require("./openaiService");
const NodeCache = require("node-cache");
const cacheService = require("./cacheService");
const budgetAlertService = require("./budgetAlertService");

class ProfileUpdateService {
  constructor() {
    // Caché para estados pendientes de actualización (5 minutos TTL)
    this.pendingUpdates = new NodeCache({
      stdTTL: 300,
      checkperiod: 60,
      maxKeys: 500
    });
  }

  /**
   * Limpiar nombre extraído
   */
  cleanName(extractedName) {
    if (!extractedName || typeof extractedName !== 'string') {
      return null;
    }

    let cleaned = extractedName.trim();
    
    const phrasesToRemove = [
      'mi nombre es', 'me llamo', 'soy', 'ya no me llamo',
      'ahora me llamo', 'me llamaba', 'antes me llamaba',
      'ahora soy', 'mi nombre ahora es', 'cambio de nombre',
      'nombre:', 'name:'
    ];

    for (const phrase of phrasesToRemove) {
      const regex = new RegExp(`^${phrase}\\s+`, 'i');
      cleaned = cleaned.replace(regex, '').trim();
    }

    cleaned = cleaned.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '').trim();
    
    if (cleaned.length < 2 || cleaned.length > 50) {
      return null;
    }

    cleaned = cleaned.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');

    return cleaned;
  }

  /**
   * Limpiar y normalizar moneda extraída
   */
  cleanCurrency(extractedCurrency) {
    if (!extractedCurrency || typeof extractedCurrency !== 'string') {
      return null;
    }

    let cleaned = extractedCurrency.trim().toLowerCase();
    
    const currencyMap = {
      'pesos colombianos': 'COP', 'peso colombiano': 'COP',
      'pesos mexicanos': 'MXN', 'peso mexicano': 'MXN',
      'pesos argentinos': 'ARS', 'peso argentino': 'ARS',
      'pesos chilenos': 'CLP', 'peso chileno': 'CLP',
      'dólares': 'USD', 'dolares': 'USD', 'dólar': 'USD', 'dolar': 'USD',
      'dólares americanos': 'USD', 'dolares americanos': 'USD',
      'euros': 'EUR', 'euro': 'EUR',
      'cop': 'COP', 'mxn': 'MXN', 'usd': 'USD', 'eur': 'EUR',
      'ars': 'ARS', 'clp': 'CLP',
      'colombianos': 'COP', 'mexicanos': 'MXN',
      'argentinos': 'ARS', 'chilenos': 'CLP'
    };

    const phrasesToRemove = [
      'mi moneda', 'moneda actual', 'moneda son', 'moneda es',
      'uso', 'manejo', 'trabajo con', 'cambio de moneda',
      'moneda:', 'currency:', 'son', 'es'
    ];

    for (const phrase of phrasesToRemove) {
      const regex = new RegExp(`^${phrase}\\s+`, 'i');
      cleaned = cleaned.replace(regex, '').trim();
      const regexEnd = new RegExp(`\\s+${phrase}$`, 'i');
      cleaned = cleaned.replace(regexEnd, '').trim();
    }

    if (currencyMap[cleaned]) {
      return currencyMap[cleaned];
    }

    if (/^[a-z]{3}$/i.test(cleaned)) {
      return cleaned.toUpperCase();
    }

    return null;
  }

  /**
   * Parsea un texto numérico a valor (soporta "5 millones", "2k", etc.)
   */
  parseMoneyValue(text) {
    if (!text) return null;
    if (typeof text === 'number') return { amount: text, currency: null };
    
    let str = text.toString().toLowerCase().trim();
    let currency = null;

    // Detectar moneda en el string
    if (str.includes('usd') || str.includes('dolar') || str.includes('dólar')) currency = 'USD';
    else if (str.includes('eur') || str.includes('euro')) currency = 'EUR';
    else if (str.includes('cop') || str.includes('peso colomb')) currency = 'COP';
    else if (str.includes('mxn') || str.includes('peso mex')) currency = 'MXN';
    
    // Si no encontró por nombre común, buscar código de 3 letras al final
    if (!currency) {
      const currencyMatch = str.match(/\b([a-z]{3})\b$/i);
      if (currencyMatch) {
         const code = currencyMatch[1].toUpperCase();
         if (['USD', 'EUR', 'COP', 'MXN', 'ARS', 'CLP', 'PEN', 'BRL'].includes(code)) {
           currency = code;
         }
      }
    }
    
    // Limpiar moneda del string para parsear número
    str = str.replace(/usd|eur|cop|mxn|ars|clp|pen|brl|dolar|dólar|euro|peso/gi, '').trim();
    
    let multiplier = 1;
    if (str.includes('millon') || str.includes('millones') || str.endsWith('m')) {
      multiplier = 1000000;
      str = str.replace(/millones|millon|m/g, '');
    } else if (str.endsWith('k') || str.includes('mil')) {
      multiplier = 1000;
      str = str.replace(/k|mil/g, '');
    }

    str = str.replace(/[^\d.,]/g, '');
    
    if (!str) return null;

    if ((str.match(/\./g) || []).length > 1) {
      str = str.replace(/\./g, '');
    } else if (str.includes('.') && !str.includes(',')) {
       // Si hay punto y parece miles (3 dígitos finales > 000), asumimos miles
       const parts = str.split('.');
       if (parts.length > 1 && parts[parts.length-1].length === 3) {
           str = str.replace(/\./g, '');
       }
    }
    
    let val = parseFloat(str.replace(',', '.'));
    if (isNaN(val)) return null;
    
    // RETORNAR OBJETO CON MONEDA DETECTADA
    return { amount: val * multiplier, currency };
  }

  cleanSalary(extractedSalary) {
    const parsed = this.parseMoneyValue(extractedSalary);
    return parsed ? parsed.amount : null;
  }
  
  cleanExpenses(extractedExpenses) {
    const parsed = this.parseMoneyValue(extractedExpenses);
    return parsed ? parsed.amount : null;
  }

  /**
   * Determina si el mensaje parece un gasto diario (transaction) y NO una actualización de perfil
   * Función AUXILIAR para evitar falsos positivos
   */
  shouldIgnoreUpdate(msg) {
    // Si dice "gasto" o "gasté" pero NO dice "fijo", "salario", "sueldo" ni keywords explícitas de perfil
    const isSpending = (msg.includes('gasto') || msg.includes('gasté') || msg.includes('compre') || msg.includes('pague')) && 
                       !msg.includes('fijo') && !msg.includes('mensual') && !msg.includes('arriendo') && 
                       !msg.includes('salario') && !msg.includes('sueldo');
    
    return isSpending;
  }

  /**
   * Extraer valores para ACTUALIZACIÓN DE PERFIL
   * Solo extrae gastos si explícitamente se mencionan como "fijos" o en contexto de actualización
   */
  extractUpdateValues(message) {
    const msg = message.toLowerCase();
    const result = {
      salary: null,
      fixed_expenses: null,
      monthly_expenses_budget: null,
      is_correction: false,
      is_budget_summary_query: false
    };

    // 0. Consulta explícita de resumen de presupuesto (no es actualización)
    if ((msg.includes('resumen') && (msg.includes('presupuesto') || msg.includes('gastos'))) ||
        (msg.startsWith('resumen')) ||
        (msg.includes('presupuesto') && (msg.includes('ver') || msg.includes('dime') || msg.includes('cual') || msg.includes('estado'))) ||
        msg.trim() === 'resumen' || msg.trim() === 'presupuesto' ||
        msg.includes('como va mi presupuesto') || msg.includes('como va mi gasto')) {
      result.is_budget_summary_query = true;
      return result;
    }

    // 1. Detectar intención de corrección de gasto mensual (NO perfil)
    if (msg.includes('ajustar gasto') || msg.includes('corregir gasto') || 
        msg.includes('cambiar el gasto') || msg.includes('error en gasto') ||
        msg.includes('corrige') || msg.includes('corregir') ||
        msg.includes('borrar gasto') || msg.includes('eliminar gasto') ||
        msg.includes('elimina el gasto') || msg.includes('borra el gasto') ||
        ((msg.includes('elimina') || msg.includes('borra')) && msg.includes('gasto')) ||
        (msg.includes('gasto') && (msg.includes('mes') || msg.includes('mal') || msg.includes('error')))) {
      
      // EXCEPCIÓN: Si pregunta por resumen ("dime mis gastos"), NO es corrección
      if (msg.includes('dime mis gastos') || msg.includes('cuales son mis gastos') || 
          msg.includes('ver mis gastos') || msg.includes('gastos del mes') || 
          msg.includes('resumen del mes') || msg.includes('cuanto he gastado') ||
          msg.includes('gastos de este mes') || msg.includes('resumen de gastos') ||
          msg.includes('total de gastos') || msg.includes('mis gastos este mes') ||
          msg.includes('me dices mis gastos')) {
        return result; // is_correction false
      }

      result.is_correction = true;
      return result; 
    }

    // 2. Extracción de Salario
    const salaryRegex = /(?:salario|sueldo|ingreso|ganancia|gano|ganando|cobro|mensual)\s*(?:es|son|de|a|:|en)?\s*(\$?\s*[\d.,]+(?:\s*(?:millones|millon|m|k|mil))?)/i;
    const salaryMatch = msg.match(salaryRegex);
    if (salaryMatch) {
      const parsed = this.parseMoneyValue(salaryMatch[1]);
      result.salary = parsed ? parsed.amount : null;
    }

    // 3. Extracción de PRESUPUESTO MENSUAL (v1.1 Coach)
    const budgetKeywords = ['presupuesto mensual', 'presupuesto de gastos', 'mi presupuesto es',
      'mi presupuesto son', 'mi presupuesto de', 'establecer presupuesto',
      'definir presupuesto', 'configurar presupuesto', 'mi limite mensual',
      'mi límite mensual', 'limite de gasto', 'límite de gasto', 'presupuesto semanal'];
    const hasBudgetKeyword = budgetKeywords.some(kw => msg.includes(kw));
    const budgetRegex = /(?:presupuesto|limite|límite|tope)(?:\s*(?:mensual|de\s*gasto|de\s*gastos))?\s*(?:es|son|de|a|:|en|para\s*este\s*mes)?\s*(\$?\s*[\d.,]+(?:\s*(?:millones|millon|m|k|mil))?)/i;
    const budgetMatch = msg.match(budgetRegex);

    if (hasBudgetKeyword && budgetMatch) {
      const parsed = this.parseMoneyValue(budgetMatch[1]);
      if (parsed && parsed.amount > 0) {
        result.monthly_expenses_budget = parsed.amount;
      }
    } else if (budgetMatch && !salaryMatch) {
      const parsed = this.parseMoneyValue(budgetMatch[1]);
      if (parsed && parsed.amount > 0) {
        result.monthly_expenses_budget = parsed.amount;
      }
    }

    // 4. Extracción de Gastos FIJOS
    const fixedKeywords = ['fijo', 'fijos', 'arriendo', 'alquiler', 'base', 'obligatorio'];
    const isFixedContext = fixedKeywords.some(kw => msg.includes(kw)) ||
                           (msg.includes('gastos') && (msg.includes('mensual') || msg.includes('fijos')));

    if (isFixedContext && !result.monthly_expenses_budget) {
      const expenseRegex = /(?:gastos|gasto|egresos|costos|fijos|arriendo)\s*(?:fijos|mensuales|base)?\s*(?:es|son|de|a|:|en)?\s*(\$?\s*[\d.,]+(?:\s*(?:millones|millon|m|k|mil))?)/i;
      const expenseMatch = msg.match(expenseRegex);
      if (expenseMatch) {
        const parsed = this.parseMoneyValue(expenseMatch[1]);
        result.fixed_expenses = parsed ? parsed.amount : null;
      }
    } else if (result.salary && msg.includes('gastos') && !result.monthly_expenses_budget) {
       const contextRegex = /gastos\s*(?:es|son|de|a|:|en)?\s*(\$?\s*[\d.,]+(?:\s*(?:millones|millon|m|k|mil))?)/i;
       const contextMatch = msg.match(contextRegex);
       if (contextMatch) {
         const parsed = this.parseMoneyValue(contextMatch[1]);
         result.fixed_expenses = parsed ? parsed.amount : null;
       }
    }

    return result;
  }

  /**
   * Detectar si el mensaje indica una intención de cambio de PERFIL
   */
  detectProfileChange(message) {
    const messageLower = message.toLowerCase();
    
    // Filtro negativo: Si parece un gasto puntual ("gasto 10k"), IGNORAR para que pase al servicio de transacciones
    if (this.shouldIgnoreUpdate(messageLower)) {
      return { name: false, currency: false, salary: false, fixed_expenses: false, correction: false };
    }

    const nameKeywords = [
      'me llamo', 'mi nombre es', 'soy', 'ya no me llamo', 
      'ahora me llamo', 'cambié mi nombre', 'me llamaba',
      'antes me llamaba', 'ahora soy', 'mi nombre ahora es',
      'cambio de nombre', 'quiero cambiar mi nombre'
    ];

    const currencyKeywords = [
      'moneda', 'pesos', 'dólares', 'euros', 'moneda actual',
      'mi moneda', 'moneda son', 'pesos colombianos', 'pesos mexicanos',
      'dólares americanos', 'cambio de moneda', 'quiero cambiar mi moneda',
      'quiero cambiar de moneda'
    ];

    const salaryKeywords = [
      'quiero cambiar mi salario', 'quiero cambiar de salario',
      'cambiar salario', 'actualizar salario', 'cambiar mi ingreso',
      'actualizar ingreso', 'cambiar mi sueldo', 'actualizar sueldo',
      'quiero actualizar mi salario', 'quiero actualizar mi ingreso',
      'ahora gano', 'gano', 'mi nuevo sueldo', 'aumento de sueldo'
    ];

    // Para gastos de perfil, DEBE ser explícito "gastos fijos"
    const fixedExpensesKeywords = [
      'cambiar gastos fijos', 'actualizar gastos fijos', 'mis gastos fijos',
      'nuevo gasto fijo', 'actualizar arriendo', 'cambiar egresos fijos',
      'mis fijos son'
    ];

    // PRESUPUESTO MENSUAL (v1.1 Coach)
    const budgetKeywords = [
      'mi presupuesto es', 'mi presupuesto son', 'mi presupuesto de',
      'cambiar presupuesto', 'actualizar presupuesto', 'configurar presupuesto',
      'definir presupuesto', 'establecer presupuesto', 'presupuesto mensual',
      'nuevo presupuesto', 'limite mensual', 'límite mensual',
      'mi limite es', 'mi límite es', 'tope de gasto', 'tope mensual'
    ];
    
    // Intención de CORREGIR un gasto puntual (gasto del mes)
    const correctionKeywords = [
      'ajustar gasto', 'corregir gasto', 'cambiar gasto del mes', 
      'gasto mal puesto', 'me equivoque en el gasto', 'borrar gasto',
      'editar gasto', 'corrige', 'corregir', 'eliminar gasto'
    ];

    return {
      name: nameKeywords.some(k => messageLower.includes(k)),
      currency: currencyKeywords.some(k => messageLower.includes(k)),
      salary: salaryKeywords.some(k => messageLower.includes(k)),
      fixed_expenses: fixedExpensesKeywords.some(k => messageLower.includes(k)),
      budget: budgetKeywords.some(k => messageLower.includes(k)),
      correction: correctionKeywords.some(k => messageLower.includes(k))
    };
  }

  /**
   * Solicitar al usuario que escriba solo el nombre
   */
  async requestNameUpdate(userPhone, language = 'es') {
    const messages = {
      'es': '📝 Para actualizar tu nombre, por favor escríbelo SOLO, sin frases ni símbolos.\n\nEjemplo: "David García"',
      'en': '📝 To update your name, please write it ONLY, without phrases or symbols.\n\nExample: "David Garcia"',
      'pt': '📝 Para atualizar seu nome, por favor escreva APENAS o nome, sem frases ou símbolos.\n\nExemplo: "David Garcia"'
    };

    const message = messages[language] || messages['es'];
    this.pendingUpdates.set(`${userPhone}_name`, { type: 'name', timestamp: Date.now() });
    await whatsappService.sendMessage(userPhone, message);
  }

  async requestCurrencyUpdate(userPhone, language = 'es') {
    const messages = {
      'es': '💰 Para actualizar tu moneda, por favor escribe SOLO el código (COP, MXN, USD, EUR) o el nombre.',
      'en': '💰 To update your currency, please write ONLY the code (COP, MXN, USD, EUR) or the name.',
      'pt': '💰 Para atualizar sua moeda, por favor escreva APENAS o código (COP, MXN, USD, EUR) ou o nome.'
    };

    const message = messages[language] || messages['es'];
    this.pendingUpdates.set(`${userPhone}_currency`, { type: 'currency', timestamp: Date.now() });
    await whatsappService.sendMessage(userPhone, message);
  }

  async requestSalaryUpdate(userPhone, language = 'es') {
    const messages = {
      'es': '💰 Para actualizar tu salario, escribe SOLO el número.\n\nEjemplo: "6000000" o "1500 USD"',
      'en': '💰 To update your salary, write ONLY the number.\n\nExample: "5000" or "100000"',
      'pt': '💰 Para atualizar seu salário, escreva APENAS o número.\n\nExemplo: "5000" ou "100000"'
    };

    const message = messages[language] || messages['es'];
    this.pendingUpdates.set(`${userPhone}_salary`, { type: 'salary', timestamp: Date.now() });
    await whatsappService.sendMessage(userPhone, message);
  }

  /**
   * Solicitar gastos FIJOS
   */
  async requestFixedExpensesUpdate(userPhone, language = 'es', force = false) {
    // Verificar primero si YA tiene gastos fijos (si no es forzado)
    if (!force) {
      const userProfile = await supabaseService.getUserProfile(userPhone);
      if (userProfile && userProfile.fixed_expenses !== null && userProfile.fixed_expenses !== undefined) {
        // Ya tiene datos, NO pedir actualización
        return false;
      }
    }

    const messages = {
      'es': '📉 Para actualizar tus **gastos fijos** (arriendo, servicios, etc), escribe SOLO el número total.\n\nEjemplo: "2000000"',
      'en': '📉 To update your **fixed expenses**, write ONLY the total number.\n\nExample: "1500"',
      'pt': '📉 Para atualizar suas **despesas fixas**, escreva APENAS o número total.\n\nExemplo: "1500"'
    };

    const message = messages[language] || messages['es'];
    this.pendingUpdates.set(`${userPhone}_fixed_expenses`, { type: 'fixed_expenses', timestamp: Date.now() });
    await whatsappService.sendMessage(userPhone, message);
    return true;
  }

  /**
   * Enviar instrucciones para corregir un gasto mal ingresado
   */
  async sendCorrectionInstructions(userPhone, language = 'es') {
    const messages = {
      'es': '⚠️ **Para corregir un gasto del mes:**\n\nPor favor escribe explícitamente: "ajustar gasto de [valor]"\n\nEjemplo: "ajustar gasto de 50000"\n\nEsto buscará tu último gasto por ese valor y te permitirá corregirlo.',
      'en': '⚠️ **To correct a monthly expense:**\n\nPlease write explicitly: "adjust expense of [amount]"\n\nExample: "adjust expense of 50"\n\nThis will find your last expense of that amount and let you fix it.',
      'pt': '⚠️ **Para corrigir uma despesa do mês:**\n\nPor favor escreva explicitamente: "ajustar despesa de [valor]"\n\nExemplo: "ajustar despesa de 50"\n\nIsso buscará sua última despesa desse valor e permitirá corrigi-la.'
    };
    
    await whatsappService.sendMessage(userPhone, messages[language] || messages['es']);
  }

  /**
   * Procesar respuesta del usuario para actualización pendiente
   */
  async processPendingUpdate(userPhone, userMessage, userProfile) {
    const language = userProfile?.language || 'es';
    
    // 1. NOMBRE
    const pendingName = this.pendingUpdates.get(`${userPhone}_name`);
    if (pendingName) {
      this.pendingUpdates.del(`${userPhone}_name`);
      const cleanedName = this.cleanName(userMessage);
      
      if (!cleanedName) {
        await whatsappService.sendMessage(userPhone, '❌ Nombre inválido. Intenta de nuevo solo con el nombre.');
        await this.requestNameUpdate(userPhone, language);
        return { processed: true, success: false };
      }

      await supabaseService.updateUserProfile(userPhone, { user_name: cleanedName });
      await whatsappService.sendMessage(userPhone, `✅ Nombre actualizado a: ${cleanedName}`);
      return { processed: true, success: true, field: 'name', value: cleanedName };
    }

    // 2. MONEDA
    const pendingCurrency = this.pendingUpdates.get(`${userPhone}_currency`);
    if (pendingCurrency) {
      this.pendingUpdates.del(`${userPhone}_currency`);
      const cleanedCurrency = this.cleanCurrency(userMessage);
      
      if (!cleanedCurrency) {
        await whatsappService.sendMessage(userPhone, '❌ Moneda inválida.');
        await this.requestCurrencyUpdate(userPhone, language);
        return { processed: true, success: false };
      }

      await supabaseService.updateUserProfile(userPhone, { currency: cleanedCurrency });
      if (cacheService) await cacheService.invalidateUserCache(userPhone);
      await whatsappService.sendMessage(userPhone, `✅ Moneda actualizada a: ${cleanedCurrency}`);
      return { processed: true, success: true, field: 'currency', value: cleanedCurrency };
    }

    // 3. SALARIO
    const pendingSalary = this.pendingUpdates.get(`${userPhone}_salary`);
    if (pendingSalary) {
      this.pendingUpdates.del(`${userPhone}_salary`);
      const cleanedSalary = this.cleanSalary(userMessage);
      
      if (!cleanedSalary) {
        await whatsappService.sendMessage(userPhone, '❌ Salario inválido. Escribe solo el número.');
        await this.requestSalaryUpdate(userPhone, language);
        return { processed: true, success: false };
      }

      await supabaseService.updateUserProfile(userPhone, { monthly_salary: cleanedSalary });
      if (cacheService) await cacheService.invalidateUserCache(userPhone);
      await whatsappService.sendMessage(userPhone, `✅ Salario actualizado a: ${cleanedSalary.toLocaleString()}`);
      return { processed: true, success: true, field: 'monthly_salary', value: cleanedSalary };
    }

    // 4. GASTOS FIJOS (Solo se activa si el usuario pidió actualizar fijos)
    const pendingFixedExpenses = this.pendingUpdates.get(`${userPhone}_fixed_expenses`);
    if (pendingFixedExpenses) {
      // Verificar si el usuario quiere cancelar o cambiar de tema
      // Si el mensaje es largo (> 3 palabras) o contiene keywords de cancelación/resumen
      const isCancellation = userMessage.split(' ').length > 3 || 
                             ['cancelar', 'salir', 'ayuda', 'resumen', 'hola', 'menu', 'menú', 'inicio', 'gracias'].some(w => userMessage.toLowerCase().includes(w));

      if (isCancellation) {
        this.pendingUpdates.del(`${userPhone}_fixed_expenses`);
        return { processed: false }; // Dejar pasar el mensaje al flujo normal
      }

      this.pendingUpdates.del(`${userPhone}_fixed_expenses`);
      const cleanedExpenses = this.cleanExpenses(userMessage);
      
      if (!cleanedExpenses) {
        await whatsappService.sendMessage(userPhone, '❌ Valor inválido. Escribe solo el número (ej: 2000000). O escribe "cancelar" para salir.');
        // Restaurar estado pendiente
        this.pendingUpdates.set(`${userPhone}_fixed_expenses`, pendingFixedExpenses);
        return { processed: true, success: false };
      }

      await supabaseService.updateUserProfile(userPhone, { fixed_expenses: cleanedExpenses });
      if (cacheService) await cacheService.invalidateUserCache(userPhone);
      
      await whatsappService.sendMessage(userPhone, `✅ Gastos FIJOS actualizados a: ${cleanedExpenses.toLocaleString()}`);
      return { processed: true, success: true, field: 'fixed_expenses', value: cleanedExpenses };
    }

    // 4.5 PRESUPUESTO MENSUAL (v1.1 Coach)
    const pendingBudget = this.pendingUpdates.get(`${userPhone}_budget`);
    if (pendingBudget) {
      const isCancellation = userMessage.split(' ').length > 3 ||
                             ['cancelar', 'salir', 'ayuda', 'resumen', 'hola', 'menu', 'menú', 'inicio', 'gracias']
                               .some(w => userMessage.toLowerCase().includes(w));

      if (isCancellation) {
        this.pendingUpdates.del(`${userPhone}_budget`);
        return { processed: false };
      }

      this.pendingUpdates.del(`${userPhone}_budget`);
      const parsedBudget = this.parseMoneyValue(userMessage);
      const budgetAmount = parsedBudget ? parsedBudget.amount : null;

      if (!budgetAmount || budgetAmount <= 0) {
        const errorMsg = language === 'es'
          ? '❌ Presupuesto inválido. Escribe solo el número (ej: 2,000,000) o "cancelar" para salir.'
          : language === 'pt'
          ? '❌ Orçamento inválido. Escreva só o número (ex: 2000) ou "cancelar" para sair.'
          : '❌ Invalid budget. Write only the number (ex: 2000) or "cancel" to exit.';
        this.pendingUpdates.set(`${userPhone}_budget`, pendingBudget);
        await whatsappService.sendMessage(userPhone, errorMsg);
        return { processed: true, success: false };
      }

      await supabaseService.updateUserProfile(userPhone, { monthly_expenses_budget: budgetAmount });
      if (cacheService) await cacheService.invalidateUserCache(userPhone);

      const formatted = budgetAmount.toLocaleString();
      const currency = userProfile?.currency || 'USD';
      let confirmMsg = language === 'es'
        ? `✅ Presupuesto mensual actualizado a: ${formatted} ${currency}\n\n`
        : language === 'pt'
        ? `✅ Orçamento mensal atualizado para: ${formatted} ${currency}\n\n`
        : `✅ Monthly budget updated to: ${formatted} ${currency}\n\n`;

      try {
        const summary = await budgetAlertService.getBudgetSummary(userPhone);
        if (summary) confirmMsg += summary;
      } catch (e) { console.warn("Budget summary after update:", e.message); }

      await whatsappService.sendMessage(userPhone, confirmMsg);
      return { processed: true, success: true, field: 'monthly_expenses_budget', value: budgetAmount };
    }

    // 5. CORRECCIÓN DE GASTO (Valor nuevo o eliminación)
    const pendingCorrection = this.pendingUpdates.get(`${userPhone}_correction`);
    if (pendingCorrection) {
      this.pendingUpdates.del(`${userPhone}_correction`);
      
      // Intentar extraer el número y moneda del mensaje
      const parsedValue = this.parseMoneyValue(userMessage);
      let newAmount = parsedValue ? parsedValue.amount : null;
      const newCurrency = parsedValue ? parsedValue.currency : null;
      
      if (newAmount === null || newAmount < 0) {
        await whatsappService.sendMessage(userPhone, '❌ Valor inválido. Por favor escribe solo el nuevo valor numérico (ej: 25000) o 0 para eliminarlo.');
        // Restaurar estado pendiente
        this.pendingUpdates.set(`${userPhone}_correction`, pendingCorrection);
        return { processed: true, success: false };
      }

      try {
        if (newAmount === 0) {
          // Eliminar la transacción
          await supabaseService.deleteTransaction(pendingCorrection.transactionId);
          // Recalcular total del mes
          await supabaseService.updateMonthlyExpensesTotal(userPhone, null, false, pendingCorrection.date);
          await whatsappService.sendMessage(userPhone, `🗑️ Gasto eliminado exitosamente.\n\nValor anterior: ${pendingCorrection.oldAmount.toLocaleString()}`);
        } else {
          // Si hay moneda diferente, convertir
          const userProfile = await supabaseService.getUserProfile(userPhone);
          const userCurrency = userProfile?.currency || 'MXN';
          let finalAmount = newAmount;
          let description = pendingCorrection.description ? `${pendingCorrection.description} (Corregido)` : 'Gasto corregido';

          if (newCurrency && newCurrency !== userCurrency) {
             try {
                const conversion = await currencyService.convert(newAmount, newCurrency, userCurrency);
                if (conversion) {
                   finalAmount = conversion.amount;
                   description = `${description} (Conv. de ${newCurrency} ${newAmount.toLocaleString()})`;
                   await whatsappService.sendMessage(userPhone, `💱 Convirtiendo ${newAmount} ${newCurrency} a ${finalAmount} ${userCurrency}...`);
                }
             } catch (e) {
                console.error("Error convirtiendo en corrección:", e);
             }
          }

          // Actualizar la transacción
          await supabaseService.updateTransaction(pendingCorrection.transactionId, { 
            amount: finalAmount,
            description: description
          });
          
          // Recalcular total del mes
          await supabaseService.updateMonthlyExpensesTotal(userPhone, null, false, pendingCorrection.date);
          
          await whatsappService.sendMessage(userPhone, `✅ Gasto corregido exitosamente.\n\nAnterior: ${pendingCorrection.oldAmount.toLocaleString()}\nNuevo: ${finalAmount.toLocaleString()}`);
        }
        
        if (cacheService) await cacheService.invalidateUserCache(userPhone);
        
        return { processed: true, success: true, field: 'transaction_correction', value: newAmount };
      } catch (error) {
        console.error('Error corrigiendo transacción:', error);
        await whatsappService.sendMessage(userPhone, '❌ Hubo un error actualizando el gasto. Por favor intenta de nuevo más tarde.');
        return { processed: true, success: false };
      }
    }

    return { processed: false };
  }

  /**
   * Manejar detección de cambio de perfil
   */
  async handleProfileChange(userPhone, userMessage, userProfile) {
    const language = userProfile?.language || 'es';

    // 1. Intentar EXTRACCIÓN DIRECTA de valores primero
    // Si el usuario ya dio el dato (ej: "Gano 5M"), se actualiza de una vez.
    const extracted = this.extractUpdateValues(userMessage);

    // Si detectamos intención de corrección o si la extracción indica corrección
    if (extracted.is_correction) {
       // Intentar extraer el monto a corregir del mensaje
       const parsedValue = this.parseMoneyValue(userMessage);
       const amountToCorrect = parsedValue ? parsedValue.amount : null;
       const parsedCurrency = parsedValue ? parsedValue.currency : null;
       
       // DETECTAR INTENCIÓN DE ELIMINACIÓN EXPLÍCITA
       const isDeletion = userMessage.toLowerCase().includes('elimina') || 
                          userMessage.toLowerCase().includes('borra');
       
       if (amountToCorrect && amountToCorrect > 0) {
         // Buscar transacción
         const transactions = await supabaseService.getMonthlyTransactions(userPhone);
         
         // 1. Intentar buscar por coincidencia exacta (si es la misma moneda)
         let match = transactions.find(t => Math.abs(parseFloat(t.amount) - amountToCorrect) < 1);

         // 2. Si no hay match, intentar detectar moneda y convertir
         if (!match) {
            // Extraer moneda del mensaje
            const extractedCurrency = parsedCurrency || this.cleanCurrency(userMessage);
            const userCurrency = userProfile?.currency || 'MXN';

            if (extractedCurrency && extractedCurrency !== userCurrency) {
              try {
                // Convertir el monto ingresado a la moneda del perfil para buscar coincidencia
                const conversion = await currencyService.convert(amountToCorrect, extractedCurrency, userCurrency);
                if (conversion) {
                   const convertedAmount = conversion.amount;
                   // Buscar match con valor convertido (margen de error del 5% por fluctuaciones)
                   match = transactions.find(t => {
                     const tAmount = parseFloat(t.amount);
                     const diff = Math.abs(tAmount - convertedAmount);
                     // Permitir 5% de diferencia o 1000 unidades (lo que sea mayor) para ser flexibles
                     return diff < (tAmount * 0.05) || diff < 1000;
                   });
                   
                   if (match) {
                     console.log(`✅ Match encontrado por conversión: ${amountToCorrect} ${extractedCurrency} ~= ${match.amount} ${userCurrency}`);
                   }
                }
              } catch (e) {
                console.error("Error en conversión para corrección:", e);
              }
            }
         }

         // 3. Si aun no hay match, buscar en la descripción (por si se guardó como "Conv. de EUR 100")
         if (!match) {
            // Regex para buscar el monto original en la descripción: "Conv. de USD 100"
            // Buscamos el número "amountToCorrect" dentro de la descripción
            match = transactions.find(t => {
              if (!t.description) return false;
              // Normalizar descripción y buscar el número
              // Ejemplo descripción: "Cena (Conv. de EUR 12)"
              // Buscamos "12"
              return t.description.includes(amountToCorrect.toString()) || 
                     t.description.replace(/[.,]/g, '').includes(amountToCorrect.toString());
            });
            
            if (match) {
               console.log(`✅ Match encontrado por descripción: ${amountToCorrect} en "${match.description}"`);
            }
         }
         
         if (match) {
           // 4. Si es una orden explícita de ELIMINAR, borrar inmediatamente
           const isDeletion = userMessage.toLowerCase().includes('elimina') || userMessage.toLowerCase().includes('borra');
           
           if (isDeletion) {
             await supabaseService.deleteTransaction(match.id);
             await supabaseService.updateMonthlyExpensesTotal(userPhone, null, false, match.date);
             
             const msg = language === 'es'
               ? `🗑️ Gasto eliminado: ${match.description} (${parseFloat(match.amount).toLocaleString()})`
               : `🗑️ Expense deleted: ${match.description} (${parseFloat(match.amount).toLocaleString()})`;
               
             await whatsappService.sendMessage(userPhone, msg);
             if (cacheService) await cacheService.invalidateUserCache(userPhone);
             return { handled: true, type: 'deletion_success' };
           }

           // Guardar estado pendiente
           this.pendingUpdates.set(`${userPhone}_correction`, {
             type: 'correction_value',
             transactionId: match.id,
             oldAmount: parseFloat(match.amount),
             description: match.description,
             date: match.date,
             timestamp: Date.now()
           });
           
           const dateStr = new Date(match.date).toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US');
          const msg = language === 'es'
            ? `🔍 Encontré un gasto de $${parseFloat(match.amount).toLocaleString()} del ${dateStr} (${match.description}).\n\n¿Cuál es el valor CORRECTO? (Escribe solo el número. Si quieres ELIMINAR este gasto, escribe 0)`
            : `🔍 Found an expense of $${parseFloat(match.amount).toLocaleString()} on ${dateStr} (${match.description}).\n\nWhat is the CORRECT amount? (Write only the number. If you want to DELETE this expense, type 0)`;
             
           await whatsappService.sendMessage(userPhone, msg);
           return { handled: true, type: 'correction_found' };
         } else {
           const msg = language === 'es'
             ? `❌ No encontré ningún gasto de $${amountToCorrect.toLocaleString()} en este mes (ni en tu moneda ni convertido). Por favor verifica el valor o la moneda.`
             : `❌ I couldn't find any expense of $${amountToCorrect.toLocaleString()} this month. Please check the amount or currency.`;
           await whatsappService.sendMessage(userPhone, msg);
           // Aun así enviamos instrucciones por si acaso
           await this.sendCorrectionInstructions(userPhone, language);
           return { handled: true, type: 'correction_not_found' };
         }
       }
       
       await this.sendCorrectionInstructions(userPhone, language);
       return { handled: true, type: 'correction_help' };
    }

    // Preparar actualizaciones directas
    const updates = {};
    let updateMsg = [];
    let updatedSomething = false;
    let budgetUpdated = false;

    if (extracted.salary) {
      updates.monthly_salary = extracted.salary;
      updateMsg.push(language === 'es' ? `Salario: ${extracted.salary.toLocaleString()}`
        : language === 'pt' ? `Salário: ${extracted.salary.toLocaleString()}`
        : `Salary: ${extracted.salary.toLocaleString()}`);
      updatedSomething = true;
    }
    
    if (extracted.fixed_expenses) {
      updates.fixed_expenses = extracted.fixed_expenses;
      updateMsg.push(language === 'es' ? `Gastos Fijos: ${extracted.fixed_expenses.toLocaleString()}`
        : language === 'pt' ? `Despesas Fixas: ${extracted.fixed_expenses.toLocaleString()}`
        : `Fixed Expenses: ${extracted.fixed_expenses.toLocaleString()}`);
      updatedSomething = true;
    }

    if (extracted.monthly_expenses_budget) {
      updates.monthly_expenses_budget = extracted.monthly_expenses_budget;
      const currency = userProfile?.currency || 'USD';
      const formatted = extracted.monthly_expenses_budget.toLocaleString();
      updateMsg.push(language === 'es' ? `Presupuesto Mensual: ${formatted} ${currency}`
        : language === 'pt' ? `Orçamento Mensal: ${formatted} ${currency}`
        : `Monthly Budget: ${formatted} ${currency}`);
      updatedSomething = true;
      budgetUpdated = true;
    }

    if (updatedSomething) {
      await supabaseService.updateUserProfile(userPhone, updates);
      if (cacheService) await cacheService.invalidateUserCache(userPhone);
      
      const successTitle = language === 'es' ? '✅ Datos actualizados:'
        : language === 'pt' ? '✅ Dados atualizados:'
        : '✅ Data updated:';
      let successMsg = `${successTitle}\n${updateMsg.join('\n')}`;

      if (budgetUpdated) {
        try {
          const summary = await budgetAlertService.getBudgetSummary(userPhone);
          if (summary) {
            successMsg += `\n\n${summary}`;
          }
        } catch (e) {
          console.warn("⚠️ Budget summary fallback:", e.message);
        }
      }
        
      await whatsappService.sendMessage(userPhone, successMsg);
      return { handled: true, type: 'direct_update', updates };
    }

    // 1.5. Consulta RESUMEN PRESUPUESTO sin actualización (ej: "resumen", "presupuesto")
    if (extracted.is_budget_summary_query) {
      try {
        const summary = await budgetAlertService.getBudgetSummary(userPhone);
        if (summary) {
          await whatsappService.sendMessage(userPhone, summary);
          return { handled: true, type: 'budget_summary' };
        }
      } catch (e) {
        console.warn("⚠️ Budget summary query fallback:", e.message);
      }
    }

    // 2. Si NO hay valores directos, verificar intenciones generales (para preguntar)
    // Pero antes, verificar que NO sea un gasto diario
    if (this.shouldIgnoreUpdate(userMessage.toLowerCase())) {
        return { handled: false }; // Dejar pasar al servicio de transacciones
    }

    const changes = this.detectProfileChange(userMessage);

    if (changes.name) {
      // Si ya tiene nombre y no pide explícitamente cambiarlo, dejar pasar
      const hasName = !!userProfile?.user_name;
      const isExplicitChange = userMessage.toLowerCase().includes('cambiar') || userMessage.toLowerCase().includes('actualizar') || userMessage.toLowerCase().includes('nuevo') || userMessage.toLowerCase().includes('nombre es');
      
      if (!hasName || isExplicitChange) {
        await this.requestNameUpdate(userPhone, language);
        return { handled: true, type: 'name' };
      }
    }

    if (changes.currency) {
      const hasCurrency = !!userProfile?.currency;
      const isExplicitChange = userMessage.toLowerCase().includes('cambiar') || userMessage.toLowerCase().includes('actualizar') || userMessage.toLowerCase().includes('nueva');
      
      if (!hasCurrency || isExplicitChange) {
        await this.requestCurrencyUpdate(userPhone, language);
        return { handled: true, type: 'currency' };
      }
    }

    if (changes.salary) {
      const hasSalary = !!userProfile?.monthly_salary;
      const isExplicitChange = userMessage.toLowerCase().includes('cambiar') || userMessage.toLowerCase().includes('actualizar') || userMessage.toLowerCase().includes('nuevo');
      
      if (!hasSalary || isExplicitChange) {
        await this.requestSalaryUpdate(userPhone, language);
        return { handled: true, type: 'salary' };
      }
    }

    if (changes.fixed_expenses) {
      const hasFixedExpenses = userProfile?.fixed_expenses !== null && userProfile?.fixed_expenses !== undefined;
      const isExplicitChange = userMessage.toLowerCase().includes('cambiar') || userMessage.toLowerCase().includes('actualizar') || userMessage.toLowerCase().includes('nuevo');
      
      if (!hasFixedExpenses || isExplicitChange) {
        const sent = await this.requestFixedExpensesUpdate(userPhone, language, isExplicitChange);
        if (sent) {
          return { handled: true, type: 'fixed_expenses' };
        }
      }
    }

    // PRESUPUESTO: intención declarada pero sin monto (pide dato)
    if (changes.budget) {
      const hasBudget = userProfile?.monthly_expenses_budget !== null && userProfile?.monthly_expenses_budget !== undefined && userProfile?.monthly_expenses_budget > 0;
      const isExplicitChange = !hasBudget || ['cambiar', 'actualizar', 'nuevo', 'establecer', 'definir', 'configurar']
        .some(w => userMessage.toLowerCase().includes(w));
      
      if (isExplicitChange) {
        const prompts = {
          es: '💰 Para configurar tu **presupuesto mensual**, escribe SOLO el número total que quieres destinar a gastos variables.\n\nEjemplo: "2000000" o "1200 USD"',
          en: '💰 To set your **monthly budget**, write ONLY the total number you want for variable expenses.\n\nExample: "2000" or "1200 USD"',
          pt: '💰 Para configurar seu **orçamento mensal**, escreva APENAS o número total que você quer destinar a despesas variáveis.\n\nExemplo: "2000" or "1200 USD"'
        };
        this.pendingUpdates.set(`${userPhone}_budget`, { type: 'budget', timestamp: Date.now() });
        await whatsappService.sendMessage(userPhone, prompts[language] || prompts.es);
        return { handled: true, type: 'budget_request' };
      }
    }
    
    // Si detectamos corrección pero no valores (caso raro si falló el regex)
    if (changes.correction) {
       // Si el usuario pregunta "mis gastos del mes", NO es una corrección
       // Esto evita falsos positivos cuando el usuario pide resumen
       const isAskingSummary = userMessage.toLowerCase().includes('dime mis gastos') || 
                               userMessage.toLowerCase().includes('cuales son mis gastos') ||
                               userMessage.toLowerCase().includes('resumen');
                               
       if (!isAskingSummary) {
          await this.sendCorrectionInstructions(userPhone, language);
          return { handled: true, type: 'correction_help' };
       }
    }

    return { handled: false };
  }
}

module.exports = new ProfileUpdateService();
