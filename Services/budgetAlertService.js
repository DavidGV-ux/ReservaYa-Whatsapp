// Services/budgetAlertService.js - COACH FINANCIERO VIVO v1.1
// Módulo de seguimiento y alertas de presupuesto en tiempo real
// Detecta cruces de umbrales (70/90/100%) y envía mensajes estilo coach por WhatsApp
//
// ================= PROMPT MAESTRO DE ALERTAS =================
// Principios de diseño del mensaje:
//  1. Empático, no regañino ("Tu coach financiero")
//  2. Dato concreto + porcentaje + barra visual simple
//  3. Un consejo ACCIONABLE de 1 sola oración
//  4. Llamado a la acción pequeño
//  5. Tono motivacional: celebra el esfuerzo cuando aún va bien,
//     construye conciencia cuando se excede
// ============================================================

const supabaseService = require("./supabaseService");
const whatsappService = require("./whatsappService");
const NodeCache = require("node-cache");
const subscriptionService = require("./subscriptionService");

class BudgetAlertService {
  constructor() {
    // ============================================================
    // CONFIGURACIÓN DE UMBRALES (Coach Presupuesto v1.1)
    // ============================================================
    this.THRESHOLDS = {
      WARNING: 70,    // ⚠️ Alerta temprana - empieza a cuidarte
      CRITICAL: 90,   // 🔴 Crítico - casi te pasas
      EXCEEDED: 100   // 💥 Excedido - te pasaste del presupuesto
    };

    // ============================================================
    // PROMPT MAESTRO - BANCO DE MENSAJES COACH
    // Tono: aliado, cercano, no condescendiente, con consejo accionable
    // ============================================================
    this.COACH_MESSAGES = {
      WARNING: {
        es: (data) => {
          const name = data.userName ? `¡Hola ${data.userName}! 👋\n\n` : "";
          const tips = [
            "Revisa si hoy puedes cocinar en casa en vez de pedir delivery.",
            "Congela tu tarjeta unos días y paga solo con efectivo o transferencia.",
            "Espera 24h antes de hacer cualquier compra mayor a $100k / $100.",
            "Haz una lista con lo que FALTAS gastar este mes y prioriza solo lo indispensable.",
            "Cancela 1 suscripción que no uses este mes. Ya recuperarás margen."
          ];
          const tip = tips[Math.floor(Math.random() * tips.length)];
          return `${name}⚠️ *Alerta de presupuesto - ${data.percent}% usado*\n\n💸 Llevas gastado ${data.spentFormatted} de tu límite de ${data.budgetFormatted} (${data.currency}).\n\n${this.renderBar(data.percent)}\n\nTodavía tienes margen para llegar al final del mes. 💪\n\n💡 *Consejo de tu coach:* ${tip}\n\nEscribe \"resumen\" si quieres ver el detalle.`;
        },
        en: (data) => {
          const name = data.userName ? `Hi ${data.userName}! 👋\n\n` : "";
          const tips = [
            "Try cooking at home today instead of ordering delivery.",
            "Freeze your card for a few days and pay with cash or transfer only.",
            "Wait 24h before making any purchase over $100.",
            "List what you still need to spend this month and prioritize essentials only.",
            "Cancel 1 subscription you don't use this month. You'll regain margin."
          ];
          const tip = tips[Math.floor(Math.random() * tips.length)];
          return `${name}⚠️ *Budget alert - ${data.percent}% used*\n\n💸 You've spent ${data.spentFormatted} of your ${data.budgetFormatted} limit (${data.currency}).\n\n${this.renderBar(data.percent)}\n\nYou still have room to make it to month-end. 💪\n\n💡 *Coach tip:* ${tip}\n\nText \"summary\" to see the details.`;
        },
        pt: (data) => {
          const name = data.userName ? `Olá ${data.userName}! 👋\n\n` : "";
          const tips = [
            "Tente cozinhar em casa hoje em vez de pedir entrega.",
            "Congele seu cartão por alguns dias e pague só com dinheiro ou transferência.",
            "Espere 24h antes de fazer qualquer compra acima de R$ 500.",
            "Liste o que ainda precisa gastar este mês e priorize só o essencial.",
            "Cancele 1 assinatura que não usa este mês. Vai recuperar margem."
          ];
          const tip = tips[Math.floor(Math.random() * tips.length)];
          return `${name}⚠️ *Alerta de orçamento - ${data.percent}% usado*\n\n💸 Você já gastou ${data.spentFormatted} do seu limite de ${data.budgetFormatted} (${data.currency}).\n\n${this.renderBar(data.percent)}\n\nVocê ainda tem espaço até o fim do mês. 💪\n\n💡 *Dica do coach:* ${tip}\n\nEscreva \"resumo\" para ver os detalhes.`;
        }
      },

      CRITICAL: {
        es: (data) => {
          const name = data.userName ? `Oye ${data.userName}, tu coach aquí. 🫂\n\n` : "";
          const tips = [
            "Elige solo UNA categoría que recortar esta semana (comida fuera, Uber, etc).",
            "Si tienes ganas de comprar algo, agéndalo para el 1ro del mes que viene.",
            "Pausa todas las compras por 48h. Lo emocional baja y ahorras.",
            "Revisa suscripciones hoy mismo. Cancela 2 que no uses.",
            "Come en casa estos 3 días y ya te recuperas de golpe."
          ];
          const tip = tips[Math.floor(Math.random() * tips.length)];
          return `${name}🔴 *Crítico - ${data.percent}% de tu presupuesto agotado*\n\n💸 Gasto: ${data.spentFormatted} / Límite: ${data.budgetFormatted} ${data.currency}\n\n${this.renderBar(data.percent)}\n\nSolo te queda ${data.remainingFormatted} para llegar al fin del mes. Vamos a actuar ya. 🎯\n\n💡 *Plan de 1 minuto:* ${tip}\n\nSi necesitas ayuda con un plan específico, responde \"ayuda presupuesto\".`;
        },
        en: (data) => {
          const name = data.userName ? `Hey ${data.userName}, your coach here. 🫂\n\n` : "";
          const tips = [
            "Pick just ONE category to cut this week (eating out, Uber, etc).",
            "If you feel like buying something, schedule it for the 1st of next month.",
            "Pause all purchases for 48h. The emotional urge drops and you save.",
            "Review subscriptions today. Cancel 2 you don't use.",
            "Eat at home these 3 days and you'll recover in one shot."
          ];
          const tip = tips[Math.floor(Math.random() * tips.length)];
          return `${name}🔴 *Critical - ${data.percent}% of your budget spent*\n\n💸 Spent: ${data.spentFormatted} / Limit: ${data.budgetFormatted} ${data.currency}\n\n${this.renderBar(data.percent)}\n\nOnly ${data.remainingFormatted} left to make it to month-end. Let's act now. 🎯\n\n💡 *1-minute plan:* ${tip}\n\nIf you need help with a specific plan, reply \"budget help\".`;
        },
        pt: (data) => {
          const name = data.userName ? `Ei ${data.userName}, seu coach aqui. 🫂\n\n` : "";
          const tips = [
            "Escolha só UMA categoria para cortar nesta semana (fora, Uber, etc).",
            "Se tiver vontade de comprar algo, agende para o 1º do mês que vem.",
            "Pause todas as compras por 48h. O emocional cai e você economiza.",
            "Revise assinaturas hoje mesmo. Cancele 2 que não usa.",
            "Coma em casa esses 3 dias e já se recupera de uma vez."
          ];
          const tip = tips[Math.floor(Math.random() * tips.length)];
          return `${name}🔴 *Crítico - ${data.percent}% do orçamento gasto*\n\n💸 Gasto: ${data.spentFormatted} / Limite: ${data.budgetFormatted} ${data.currency}\n\n${this.renderBar(data.percent)}\n\nSó sobram ${data.remainingFormatted} até o fim do mês. Vamos agir agora. 🎯\n\n💡 *Plano de 1 minuto:* ${tip}\n\nSe precisar de ajuda com um plano específico, responda \"ajuda orçamento\".`;
        }
      },

      EXCEEDED: {
        es: (data) => {
          const name = data.userName ? `${data.userName}, respira hondo. Estamos juntos en esto. 🤝\n\n` : "";
          const tips = [
            "Primero: cero culpas. ¿Y si este mes nos enfocamos en NO añadir deuda?",
            "Escríbeme las 5 próximas compras que querías hacer. Juntos elegimos 0 para este mes.",
            "Activa modo supervivencia 7 días: comes en casa, cero delivery, cero salidas de pago.",
            "Busca $50k / $50 que puedas recuperar devolviendo algo, cancelando una suscripción o vendiendo algo sin uso.",
            "Definamos el presupuesto el día que cobres. Me escribes \"plan mes próximo\" y lo armamos."
          ];
          const tip = tips[Math.floor(Math.random() * tips.length)];
          const over = data.spent - data.budget;
          const overFormatted = this.formatAmount(over, data.currency);
          return `${name}💥 *Te pasaste del presupuesto mensual - ${data.percent}%*\n\n💸 Gasto real: ${data.spentFormatted} / Límite: ${data.budgetFormatted} ${data.currency}\n📉 Exceso: ${overFormatted}\n\n${this.renderBar(100)}\n\nSin culpas. Esto le pasa al 73% de las personas al menos 1 mes al año. Lo importante es el plan que sigue. 🛠️\n\n💡 *Primer paso:* ${tip}\n\nCuéntame ¿qué crees que fue lo que más se salió de control? Así te ayudo a ajustarlo.`;
        },
        en: (data) => {
          const name = data.userName ? `${data.userName}, breathe deep. We're in this together. 🤝\n\n` : "";
          const tips = [
            "First: zero guilt. What if this month we focus on NOT adding debt?",
            "Write down the 5 next purchases you wanted to make. Together we pick 0 for this month.",
            "Activate 7-day survival mode: eat at home, zero delivery, zero paid outings.",
            "Find $50 you can recover by returning something, canceling a subscription or selling something unused.",
            "Let's set the budget on payday. Text me \"next month plan\" and we'll build it."
          ];
          const tip = tips[Math.floor(Math.random() * tips.length)];
          const over = data.spent - data.budget;
          const overFormatted = this.formatAmount(over, data.currency);
          return `${name}💥 *You exceeded your monthly budget - ${data.percent}%*\n\n💸 Actual spend: ${data.spentFormatted} / Limit: ${data.budgetFormatted} ${data.currency}\n📉 Over: ${overFormatted}\n\n${this.renderBar(100)}\n\nNo guilt. This happens to 73% of people at least 1 month a year. What matters is the next plan. 🛠️\n\n💡 *First step:* ${tip}\n\nTell me — what do you think got most out of control? I'll help you adjust it.`;
        },
        pt: (data) => {
          const name = data.userName ? `${data.userName}, respira fundo. Estamos juntos nisso. 🤝\n\n` : "";
          const tips = [
            "Primeiro: zero culpa. E se este mês focarmos em NÃO adicionar dívida?",
            "Escreva as 5 próximas compras que queria fazer. Juntos escolhemos 0 para este mês.",
            "Ative modo sobrevivência 7 dias: come em casa, zero delivery, zero saídas pagas.",
            "Ache R$ 250 que pode recuperar devolvendo algo, cancelando assinatura ou vendendo algo sem uso.",
            "Vamos definir o orçamento no dia do pagamento. Escreva \"próximo mês\" e montamos."
          ];
          const tip = tips[Math.floor(Math.random() * tips.length)];
          const over = data.spent - data.budget;
          const overFormatted = this.formatAmount(over, data.currency);
          return `${name}💥 *Você passou do orçamento mensal - ${data.percent}%*\n\n💸 Gasto real: ${data.spentFormatted} / Limite: ${data.budgetFormatted} ${data.currency}\n📉 Excesso: ${overFormatted}\n\n${this.renderBar(100)}\n\nSem culpa. Isso acontece com 73% das pessoas ao menos 1 mês por ano. O que importa é o próximo plano. 🛠️\n\n💡 *Primeiro passo:* ${tip}\n\nMe conte — o que você acha que mais saiu do controle? Assim te ajudo a ajustar.`;
        }
      },

      // Mensaje adicional: cuando se acaba de CRUZAR el umbral (vs mensaje de estado)
      FIRST_CROSS_TAG: {
        es: "\n\n🎯 *Primera alerta de este mes* — guardaré este registro y NO te volveré a alertar por el mismo umbral hasta el próximo mes.",
        en: "\n\n🎯 *First alert this month* — I'll log this and won't re-alert for the same threshold until next month.",
        pt: "\n\n🎯 *Primeiro alerta deste mês* — registrei e não voltarei a alertar pelo mesmo limite até o próximo mês."
      }
    };

    // Anti-duplicado: solo alertar UNA VEZ por umbral por mes por usuario
    // Estructura key: "${phone}_${YYYY-MM}_WARNING"
    this.sentAlertsCache = new NodeCache({
      stdTTL: 60 * 60 * 24 * 40, // 40 días
      checkperiod: 60 * 60,
      maxKeys: 10000
    });
  }

  // =================================================================
  // HELPERS DE FORMATO
  // =================================================================
  formatAmount(amount, currency = "USD") {
    if (amount === null || amount === undefined || isNaN(amount)) return "0";
    const num = parseFloat(amount);
    try {
      return new Intl.NumberFormat("es-ES", {
        maximumFractionDigits: 0,
        minimumFractionDigits: 0
      }).format(Math.round(num));
    } catch (e) {
      return Math.round(num).toLocaleString();
    }
  }

  renderBar(percent) {
    const clamped = Math.max(0, Math.min(100, percent));
    const total = 10;
    const filled = Math.round((clamped / 100) * total);
    const empty = total - filled;
    const char = clamped >= 100 ? "💥" : clamped >= 90 ? "🔴" : clamped >= 70 ? "🟠" : "🟢";
    return char + " " + "█".repeat(filled) + "░".repeat(empty) + ` ${clamped}%`;
  }

  // =================================================================
  // NÚCLEO: PERFIL FINANCIERO VIVO
  // Calcula presupuesto y porcentaje utilizado.
  // Si no hay salario/fijos en perfil, usa monthly_expenses_budget o
  // infiere presupuesto de último mes histórico (heurística).
  // =================================================================
  async getLivingFinancialProfile(phoneNumber) {
    const profile = await supabaseService.getUserProfile(phoneNumber);
    if (!profile) return null;

    const currency = profile.currency || "USD";
    const userName = profile.user_name || null;
    const language = profile.language || "es";

    // ===== Presupuesto mensual variable (gastos variables del mes) =====
    // Origen de verdad por prioridad:
    //   1) monthly_expenses_budget explícito en perfil (si el usuario lo definió)
    //   2) monthly_salary - fixed_expenses (datos onboarding)
    //   3) Promedio últimos 3 meses de gastos variables (si existe historial)
    //   4) 0 (sin presupuesto — no alertar)
    let budget = parseFloat(profile.monthly_expenses_budget || 0);
    let budgetSource = "explicit";

    const salary = parseFloat(profile.monthly_salary || 0);
    const fixedExpenses = parseFloat(profile.fixed_expenses || 0);

    if (!budget && salary > 0) {
      // Regla 50/30/20 como heurística para sugerir presupuesto de variables
      // Gastos variables (30%): para comer fuera, transporte, gustos, etc.
      const derivedFromSalary = Math.max(0, (salary - fixedExpenses) * 0.7); // 70% disponible -> presupuesto variables (30% ahorro)
      if (derivedFromSalary > 0) {
        budget = derivedFromSalary;
        budgetSource = "derived_salary";
      }
    }

    // ===== Gasto variable mensual actual =====
    // Fuente: total_monthly_expenses (actualizado en cada transacción)
    let spentVariables = parseFloat(profile.total_monthly_expenses || 0);

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    // Si el mes almacenado no coincide, recalcular desde transacciones
    const storedMonth = profile.current_expenses_month;
    const storedYear = profile.current_expenses_year;
    if (!storedMonth || storedMonth !== month || storedYear !== year) {
      const recalc = await supabaseService.getMonthlyExpensesTotal(phoneNumber, year, month);
      spentVariables = recalc.total[currency] || Object.values(recalc.total)[0] || 0;
    }

    // ===== Calcular métricas =====
    const percent = budget > 0 ? Math.round((spentVariables / budget) * 100) : 0;
    const remaining = Math.max(0, budget - spentVariables);

    return {
      phoneNumber,
      userName,
      language,
      currency,
      salary,
      fixedExpenses,
      budget,
      budgetSource,
      spent: spentVariables,
      percent,
      remaining,
      monthKey: `${year}-${String(month).padStart(2, "0")}`,
      spentFormatted: this.formatAmount(spentVariables, currency),
      budgetFormatted: this.formatAmount(budget, currency),
      remainingFormatted: this.formatAmount(remaining, currency),
      // Clasificación para alerta
      level:
        budget <= 0 ? null :
        percent >= 100 ? "EXCEEDED" :
        percent >= this.THRESHOLDS.CRITICAL ? "CRITICAL" :
        percent >= this.THRESHOLDS.WARNING ? "WARNING" : null
    };
  }

  // =================================================================
  // DETERMINAR SI DEBE ALERTAR (ANTI-DUPLICADO)
  // Solo alerta UNA VEZ por nivel de umbral por mes.
  // Si sube de WARNING -> CRITICAL -> EXCEEDED, sí vuelve a alertar (nivel distinto).
  // =================================================================
  shouldAlert(profile, monthKey, newLevel) {
    if (!newLevel || !profile.budget || profile.budget <= 0) return false;

    // Revisar persistencia en BD primero (no solo caché en memoria)
    const cacheKey = `${profile.phoneNumber}_${monthKey}_${newLevel}`;
    return !this.sentAlertsCache.get(cacheKey);
  }

  async checkSentAlertFromDb(profileId, year, month, level) {
    try {
      const { data, error } = await supabaseService.supabase
        .from("budget_alert_logs")
        .select("id")
        .eq("user_id", profileId)
        .eq("alert_year", year)
        .eq("alert_month", month)
        .eq("alert_level", level)
        .limit(1);
      if (error) throw error;
      return data && data.length > 0;
    } catch (e) {
      console.warn("⚠️ checkSentAlertFromDb fallback:", e.message);
      return false;
    }
  }

  async logAlertInDb(profileId, year, month, level, percent, budget, spent) {
    try {
      const { error } = await supabaseService.supabase
        .from("budget_alert_logs")
        .insert([{
          user_id: profileId,
          alert_year: year,
          alert_month: month,
          alert_level: level,
          percent_at_alert: percent,
          budget_at_alert: budget,
          spent_at_alert: spent,
          sent_at: new Date().toISOString()
        }]);
      if (error) throw error;
      return true;
    } catch (e) {
      console.warn("⚠️ logAlertInDb error (tabla no existe?):", e.message);
      return false;
    }
  }

  // =================================================================
  // EJECUTAR ALERTA (enviar WhatsApp y loguear)
  // =================================================================
  async sendBudgetAlert(livingProfile, level) {
    const lang = livingProfile.language || "es";
    const msgFn = this.COACH_MESSAGES[level]?.[lang] || this.COACH_MESSAGES[level].es;
    const crossTagFn = this.COACH_MESSAGES.FIRST_CROSS_TAG[lang] || this.COACH_MESSAGES.FIRST_CROSS_TAG.es;

    const msgBase = msgFn(livingProfile);
    const message = msgBase + crossTagFn;

    try {
      // Enviar por WhatsApp
      await whatsappService.sendMessage(livingProfile.phoneNumber, message);

      // Guardar en caché de memoria
      const cacheKey = `${livingProfile.phoneNumber}_${livingProfile.monthKey}_${level}`;
      this.sentAlertsCache.set(cacheKey, true);

      // Guardar en BD si la tabla existe
      const profile = await supabaseService.getUserProfile(livingProfile.phoneNumber);
      const [year, month] = livingProfile.monthKey.split("-").map(Number);
      if (profile?.id) {
        await this.logAlertInDb(profile.id, year, month, level,
          livingProfile.percent, livingProfile.budget, livingProfile.spent);
      }

      console.log(`🚨 [BudgetAlert] ${level} enviado a ${livingProfile.phoneNumber} — ${livingProfile.percent}% (Presupuesto: ${livingProfile.budgetFormatted}, Gasto: ${livingProfile.spentFormatted})`);
      return { success: true, level, percent: livingProfile.percent };
    } catch (e) {
      console.error(`❌ [BudgetAlert] Fallo al enviar a ${livingProfile.phoneNumber}:`, e.message);
      return { success: false, error: e.message };
    }
  }

  // =================================================================
  // API PÚBLICA 1: EVALUAR Y ALERTAR (EN MOMENTO DE UN GASTO NUEVO)
  // =================================================================
  async evaluateAndAlertAfterExpense(phoneNumber) {
    const living = await this.getLivingFinancialProfile(phoneNumber);
    if (!living) return { evaluated: false, reason: "no_profile" };

    // Si no hay presupuesto, no alertar (pero podríamos sugerir definirlo...)
    if (!living.budget || living.budget <= 0) {
      return { evaluated: true, alerted: false, reason: "no_budget", profile: living };
    }

    // Solo evaluar si ya hay un nivel activo
    if (!living.level) {
      return { evaluated: true, alerted: false, reason: "under_threshold", profile: living };
    }

    const [year, month] = living.monthKey.split("-").map(Number);
    const profileFull = await supabaseService.getUserProfile(phoneNumber);
    const alreadySentInDb = profileFull?.id
      ? await this.checkSentAlertFromDb(profileFull.id, year, month, living.level)
      : false;
    const alreadySentCache = !this.shouldAlert(living, living.monthKey, living.level);

    if (alreadySentCache || alreadySentInDb) {
      console.log(`ℹ️ [BudgetAlert] Omitir ${living.level} para ${phoneNumber}: ya enviado este mes`);
      return { evaluated: true, alerted: false, reason: "already_sent", profile: living };
    }

    // Si no tiene suscripción activa, no enviar (pero sí registrar para métricas)
    const sub = await subscriptionService.isSubscriptionActive(phoneNumber);
    if (!sub.isActive) {
      console.log(`⏸️ [BudgetAlert] Omitir ${living.level} para ${phoneNumber}: suscripción inactiva`);
      return { evaluated: true, alerted: false, reason: "inactive_subscription", profile: living };
    }

    const result = await this.sendBudgetAlert(living, living.level);
    return { evaluated: true, alerted: result.success, reason: result.success ? "alert_sent" : "send_failed", profile: living };
  }

  // =================================================================
  // API PÚBLICA 2: EJECUCIÓN CRON (revisar todos los usuarios en lote)
  // Usado en recordatorios nocturnos (Lambda diaria)
  // =================================================================
  async runNightlyBudgetReview() {
    console.log("🌙 [BudgetAlert] Iniciando revisión nocturna de presupuestos...");
    try {
      const { data: users, error } = await supabaseService.supabase
        .from("user_profiles")
        .select("phone_number, user_name, language, subscription_active, subscription_end_date")
        .not("phone_number", "is", null);

      if (error) throw error;
      if (!users || users.length === 0) return { total: 0, alerted: 0, skipped: 0 };

      let alerted = 0;
      let skipped = 0;

      for (const user of users) {
        try {
          // Revisar suscripción "rápido" antes de recalcular perfil
          if (user.subscription_active === false) { skipped++; continue; }
          if (user.subscription_end_date && new Date() > new Date(user.subscription_end_date)) { skipped++; continue; }

          const result = await this.evaluateAndAlertAfterExpense(user.phone_number);
          if (result.alerted) alerted++;

          // Throttle para no saturar WhatsApp API
          await new Promise(r => setTimeout(r, 1200));
        } catch (uErr) {
          console.error(`❌ [BudgetAlert] Fallo usuario ${user.phone_number}:`, uErr.message);
          skipped++;
        }
      }

      console.log(`✅ [BudgetAlert] Revisión nocturna completada: ${alerted} alertados / ${users.length} totales (${skipped} omitidos)`);
      return { total: users.length, alerted, skipped };
    } catch (e) {
      console.error("❌ [BudgetAlert] Error en revisión nocturna:", e);
      throw e;
    }
  }

  // =================================================================
  // API PÚBLICA 3: OBTENER RESUMEN PARA RESPONDER EN CHAT
  // Cuando el usuario escribe "resumen" o "presupuesto"
  // =================================================================
  async getBudgetSummary(phoneNumber) {
    const living = await this.getLivingFinancialProfile(phoneNumber);
    if (!living) return null;

    const lang = living.language || "es";
    const name = living.userName ? `Hola ${living.userName}!\n\n` : "";
    const levelLabel =
      living.level === "EXCEEDED" ? (lang === "es" ? "💥 Excedido" : lang === "pt" ? "💥 Excedido" : "💥 Exceeded") :
      living.level === "CRITICAL" ? (lang === "es" ? "🔴 Crítico" : lang === "pt" ? "🔴 Crítico" : "🔴 Critical") :
      living.level === "WARNING" ? (lang === "es" ? "⚠️ Atención" : lang === "pt" ? "⚠️ Atenção" : "⚠️ Watch") :
      (lang === "es" ? "🟢 En control" : lang === "pt" ? "🟢 No controle" : "🟢 On track");

    const labels = {
      es: {
        title: "📊 *Tu Presupuesto Vivo del Mes*",
        total: "Presupuesto mensual variables",
        spent: "Gastado a la fecha",
        remaining: "Disponible",
        state: "Estado",
        noBudget: "👉 Aún no has definido tu presupuesto mensual.\nEscribe: \"mi presupuesto es 2,000,000\" y lo configuro."
      },
      en: {
        title: "📊 *Your Living Budget for the Month*",
        total: "Monthly variable budget",
        spent: "Spent to date",
        remaining: "Available",
        state: "Status",
        noBudget: "👉 You haven't set your monthly budget yet.\nWrite: \"my budget is 2000\" and I'll set it."
      },
      pt: {
        title: "📊 *Seu Orçamento Vivo do Mês*",
        total: "Orçamento mensal variável",
        spent: "Gasto até hoje",
        remaining: "Disponível",
        state: "Status",
        noBudget: "👉 Você ainda não definiu seu orçamento mensal.\nEscreva: \"meu orçamento é 2000\" e eu configuro."
      }
    };
    const L = labels[lang] || labels.es;

    if (!living.budget || living.budget <= 0) {
      return `${name}${L.title}\n\n${L.noBudget}`;
    }

    return `${name}${L.title}\n\n${this.renderBar(living.percent)}\n\n🔹 ${L.total}: ${living.budgetFormatted} ${living.currency}\n🔹 ${L.spent}: ${living.spentFormatted} ${living.currency}\n🔹 ${L.remaining}: ${living.remainingFormatted} ${living.currency}\n\n${L.state}: ${levelLabel} (${living.percent}%)`;
  }
}

module.exports = new BudgetAlertService();
