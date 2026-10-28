// ============================================================
// TEST: COACH FINANCIERO VIVO v1.1 - BudgetAlertService
// Stub self-contained (sin dependencias externas).
// NO envía WhatsApp real, NO toca Supabase real.
// ============================================================
// Ejecutar desde FYN/:
//   export PATH="/opt/homebrew/opt/node/bin:$PATH"
//   node tests/test-budget-alerts.js
// ============================================================

const path = require("path");

// ---- Stubear variables de entorno antes de require de servicios ----
process.env.NODE_ENV = "test";

// ---- Cargar servicios (una sola vez - Node los cachea) ----
const whatsappService = require("../Services/whatsappService");
const subscriptionService = require("../Services/subscriptionService");
const supabaseService = require("../Services/supabaseService");
const budgetAlertService = require("../Services/budgetAlertService");

// ============================================================
// STORAGE & HELPERS
// ============================================================
const sentMessages = []; // [{to, text, ts}]
let mockProfiles = {};    // phone -> profile obj
let mockMonthlyTotals = {}; // `${phone}_${year}-${month}` -> spent
let subscriptionActiveMap = {}; // phone -> boolean

// Valor del mes actual para coherencia
const NOW = new Date();
const YEAR = NOW.getFullYear();
const MONTH = NOW.getMonth() + 1;
const MONTH_KEY = `${YEAR}-${String(MONTH).padStart(2, "0")}`;

function setMockProfile(phone, patch = {}) {
  const base = {
    id: 999,
    user_name: patch.user_name || null,
    language: patch.language || "es",
    currency: patch.currency || "USD",
    monthly_salary: patch.monthly_salary || 0,
    fixed_expenses: patch.fixed_expenses ?? 0,
    monthly_expenses_budget: patch.monthly_expenses_budget || 0,
    total_monthly_expenses: patch.total_monthly_expenses || 0,
    current_expenses_month: MONTH,   // Coincide con actual para NO recalcular
    current_expenses_year: YEAR,
    subscription_active: true,
    ...patch
  };
  mockProfiles[phone] = base;
  return base;
}

function setSpent(phone, spent) {
  if (mockProfiles[phone]) {
    mockProfiles[phone].total_monthly_expenses = spent;
  }
  mockMonthlyTotals[`${phone}_${MONTH_KEY}`] = spent;
}

function setSubscriptionActive(phone, isActive) {
  subscriptionActiveMap[phone] = isActive;
}

function clearAll() {
  sentMessages.length = 0;
  mockProfiles = {};
  mockMonthlyTotals = {};
  subscriptionActiveMap = {};
  budgetAlertService.sentAlertsCache.flushAll(); // limpia anti-duplicado
}

// ============================================================
// STUB OVERRIDES (sobre-escriben los métodos reales de los servicios cargados)
// ============================================================
const origWA = whatsappService.sendMessage.bind(whatsappService);
whatsappService.sendMessage = async (to, text) => {
  sentMessages.push({ to, text, ts: Date.now() });
  return { success: true, stub: true };
};

const origSub = subscriptionService.isSubscriptionActive.bind(subscriptionService);
subscriptionService.isSubscriptionActive = async (phone) => {
  const explicit = subscriptionActiveMap[phone];
  if (explicit !== undefined) {
    return {
      isActive: explicit,
      daysRemaining: explicit ? 15 : 0,
      message: explicit ? null : "TEST-SUSCRIPCION-INACTIVA"
    };
  }
  return { isActive: true, daysRemaining: 15 };
};

const origGetProfile = supabaseService.getUserProfile.bind(supabaseService);
supabaseService.getUserProfile = async (phone) => {
  return mockProfiles[phone] || null;
};

const origGetMonthly = supabaseService.getMonthlyExpensesTotal
  ? supabaseService.getMonthlyExpensesTotal.bind(supabaseService)
  : null;
if (origGetMonthly) {
  supabaseService.getMonthlyExpensesTotal = async (phone, y, m) => {
    const key = `${phone}_${y}-${String(m).padStart(2, "0")}`;
    const spent = mockMonthlyTotals[key] || 0;
    const currency = mockProfiles[phone]?.currency || "USD";
    return { total: { [currency]: spent } };
  };
}

// Stubear cliente Supabase para budget_alert_logs -> devuelve error
// así budgetAlertService cae en el fallback NodeCache
if (supabaseService.supabase) {
  supabaseService.supabase = {
    from: (table) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              limit: () => Promise.resolve({
                data: [],
                error: null  // No enviamos error, data vacía para no colisionar con caché
              })
            })
          })
        })
      }),
      insert: () => Promise.resolve({ error: new Error("TEST-stub-no-db") })
    })
  };
}

// ============================================================
// ASSERTIONS
// ============================================================
let passed = 0;
let failed = 0;
const failures = [];

function assert(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    failures.push({ name, detail });
    console.log(`  ❌ ${name}${detail ? " — " + detail : ""}`);
  }
}

// ============================================================
// RUN TEST CASES
// ============================================================
(async function runAll() {
  console.log("\n============================================================");
  console.log("🧪 COACH FINANCIERO VIVO v1.1 - Pruebas BudgetAlertService");
  console.log("============================================================\n");

  // -----------------------------------------------------------
  // TEST 1 — SIN PRESUPUESTO (no hay budget, no alertar)
  // -----------------------------------------------------------
  console.log("TEST 1: Usuario sin presupuesto definido");
  clearAll();
  const p1 = setMockProfile("570000000001", {
    user_name: "Sin Presupuesto",
    language: "es",
    currency: "USD",
    monthly_salary: 0,
    fixed_expenses: 0,
    monthly_expenses_budget: 0,
    total_monthly_expenses: 500
  });
  setSpent("570000000001", 500);
  const r1 = await budgetAlertService.evaluateAndAlertAfterExpense("570000000001");
  assert("Retorna evaluated=true", r1.evaluated === true);
  assert("alerted=false (sin presupuesto)", r1.alerted === false);
  assert("reason=no_budget", r1.reason === "no_budget");
  assert("No se llamó a WhatsApp", sentMessages.length === 0);
  console.log("");

  // -----------------------------------------------------------
  // TEST 2 — WARNING 72% (umbral ≥70%) — PRIMERA VEZ
  // -----------------------------------------------------------
  console.log("TEST 2: WARNING umbral 72% — PRIMERA VEZ");
  clearAll();
  const PHONE_WARN = "570000000002";
  const BUDGET = 1000000; // 1M
  const SPENT_72 = 720000;  // 72%
  setMockProfile(PHONE_WARN, {
    user_name: "María Coach",
    language: "es",
    currency: "COP",
    monthly_salary: 0,       // Para que NO derive salario
    fixed_expenses: 0,
    monthly_expenses_budget: BUDGET,
    total_monthly_expenses: SPENT_72
  });
  setSpent(PHONE_WARN, SPENT_72);
  const r2 = await budgetAlertService.evaluateAndAlertAfterExpense(PHONE_WARN);
  assert("alerted=true", r2.alerted === true);
  assert("reason=alert_sent", r2.reason === "alert_sent");
  assert("Nivel = WARNING", r2.profile.level === "WARNING");
  assert("Percent = 72", r2.profile.percent === 72);
  assert("1 mensaje WhatsApp enviado", sentMessages.length === 1);
  const m2 = sentMessages[0];
  assert("Destino correcto", m2.to === PHONE_WARN);
  assert("Contiene 72%", m2.text.includes("72%"));
  assert("Contiene ⚠️ (WARNING)", m2.text.includes("⚠️"));
  assert("Contiene barra 🟠 (WARNING)", m2.text.includes("🟠"));
  assert("Contiene tag 'Primera alerta de este mes'", m2.text.includes("Primera alerta de este mes"));
  assert("Contiene consejo coach (5 tips posibles)",
    /cocinar|tarjeta|24h|lista|suscripción/.test(m2.text)
  );
  console.log(`     📩 Mensaje enviado (preview):\n${m2.text.split("\n").slice(0, 6).map(l => "        " + l).join("\n")}\n       ...\n`);

  // -----------------------------------------------------------
  // TEST 3 — WARNING 75% (mismo nivel) — NO DEBE VOLVER A ALERTAR
  // -----------------------------------------------------------
  console.log("TEST 3: WARNING 75% — ANTI-DUPLICADO (mismo umbral)");
  setSpent(PHONE_WARN, 750000); // 75% (sigue WARNING)
  const r3 = await budgetAlertService.evaluateAndAlertAfterExpense(PHONE_WARN);
  assert("alerted=false (duplicado)", r3.alerted === false);
  assert("reason=already_sent", r3.reason === "already_sent");
  assert("Seguimos en nivel WARNING", r3.profile.level === "WARNING");
  assert("No se envía nuevo mensaje (total sigue = 1)", sentMessages.length === 1);
  console.log("");

  // -----------------------------------------------------------
  // TEST 4 — CRITICAL 92% (sube de nivel) — SÍ ALERTA
  // -----------------------------------------------------------
  console.log("TEST 4: CRITICAL 92% — SÍ ALERTA (nivel distinto)");
  setSpent(PHONE_WARN, 920000); // 92%
  const r4 = await budgetAlertService.evaluateAndAlertAfterExpense(PHONE_WARN);
  assert("alerted=true (CRITICAL)", r4.alerted === true);
  assert("reason=alert_sent", r4.reason === "alert_sent");
  assert("Nivel = CRITICAL", r4.profile.level === "CRITICAL");
  assert("Percent = 92", r4.profile.percent === 92);
  assert("Ahora hay 2 mensajes totales", sentMessages.length === 2);
  const m4 = sentMessages[1];
  assert("Contiene 92%", m4.text.includes("92%"));
  assert("Contiene 🔴 (CRITICAL)", m4.text.includes("🔴"));
  assert("Contiene 'Crítico'", m4.text.includes("Crítico"));
  assert("Contiene plan 1 minuto", /Elige|agéndalo|Pausa|Revisa|Come en casa/.test(m4.text));
  console.log("");

  // -----------------------------------------------------------
  // TEST 5 — EXCEEDED 103% (te pasaste) — SÍ ALERTA
  // -----------------------------------------------------------
  console.log("TEST 5: EXCEEDED 103% — SÍ ALERTA (te pasaste)");
  setSpent(PHONE_WARN, 1030000); // 103%
  const r5 = await budgetAlertService.evaluateAndAlertAfterExpense(PHONE_WARN);
  assert("alerted=true (EXCEEDED)", r5.alerted === true);
  assert("Nivel = EXCEEDED", r5.profile.level === "EXCEEDED");
  assert("Percent = 103", r5.profile.percent === 103);
  assert("3 mensajes totales", sentMessages.length === 3);
  const m5 = sentMessages[2];
  assert("Contiene 'Te pasaste del presupuesto'", m5.text.includes("Te pasaste del presupuesto"));
  assert("Contiene 💥", m5.text.includes("💥"));
  assert("Menciona exceso 30,000", m5.text.includes("30.000") || m5.text.includes("30000"));
  assert("Tono sin culpas ('Sin culpas' o 'cero culpas')",
    m5.text.includes("Sin culpas") || m5.text.includes("cero culpas")
  );
  console.log("");

  // -----------------------------------------------------------
  // TEST 6 — getBudgetSummary (string formateado)
  // -----------------------------------------------------------
  console.log("TEST 6: getBudgetSummary — texto resumen con barra");
  const summary = await budgetAlertService.getBudgetSummary(PHONE_WARN);
  assert("Retorna string", typeof summary === "string" && summary.length > 0);
  assert("Contiene título 'Presupuesto Vivo del Mes'", summary.includes("Presupuesto Vivo del Mes"));
  assert("Muestra gasto 1,030,000", summary.includes("1.030.000") || summary.includes("1,030,000"));
  assert("Muestra presupuesto 1,000,000", summary.includes("1.000.000") || summary.includes("1,000,000"));
  assert("Barra visual 💥 (EXCEEDED)", summary.includes("💥"));
  assert("Estado 'Excedido'", summary.includes("Excedido"));
  assert("Percent 103%", summary.includes("103%"));
  console.log(`     📊 Resumen preview:\n${summary.split("\n").map(l => "        " + l).join("\n")}\n`);

  // -----------------------------------------------------------
  // TEST 7 — Suscripción INACTIVA en 95% -> NO alertar
  // -----------------------------------------------------------
  console.log("TEST 7: Suscripción INACTIVA a pesar de 95% CRITICAL — NO alerta");
  clearAll();
  const PHONE_EXPIRED = "570000000007";
  setMockProfile(PHONE_EXPIRED, {
    user_name: "Usuario Expirado",
    language: "es",
    currency: "USD",
    monthly_expenses_budget: 1000,
    total_monthly_expenses: 950
  });
  setSpent(PHONE_EXPIRED, 950);
  setSubscriptionActive(PHONE_EXPIRED, false);
  const r7 = await budgetAlertService.evaluateAndAlertAfterExpense(PHONE_EXPIRED);
  assert("evaluated=true", r7.evaluated === true);
  assert("alerted=false (sub inactiva)", r7.alerted === false);
  assert("reason=inactive_subscription", r7.reason === "inactive_subscription");
  assert("Nivel sería CRITICAL (95%)", r7.profile.level === "CRITICAL");
  assert("Ningún mensaje enviado", sentMessages.length === 0);
  console.log("");

  // -----------------------------------------------------------
  // TEST 8 — Idioma EN + presupuesto DERIVADO (sin explícito)
  //   salario=3000 USD, fijos=1500 USD -> derivado (3000-1500)*0.7 = 1050
  //   gastado=740 (70.47%) -> WARNING 70%
  // -----------------------------------------------------------
  console.log("TEST 8: Presupuesto DERIVADO (salario-fijos)*0.7 — Idioma EN");
  clearAll();
  const PHONE_EN = "15551234567";
  setMockProfile(PHONE_EN, {
    user_name: "John",
    language: "en",
    currency: "USD",
    monthly_salary: 3000,
    fixed_expenses: 1500,
    monthly_expenses_budget: 0,    // sin explícito -> derivar
    total_monthly_expenses: 740
  });
  setSpent(PHONE_EN, 740);
  const r8 = await budgetAlertService.evaluateAndAlertAfterExpense(PHONE_EN);
  assert("Budget derivado = 1050 USD", r8.profile.budget === 1050);
  assert("budgetSource = derived_salary", r8.profile.budgetSource === "derived_salary");
  assert("Percent = 70 (redondeado)", r8.profile.percent === 70 || r8.profile.percent === 71);
  assert("Nivel = WARNING", r8.profile.level === "WARNING");
  assert("alerted=true", r8.alerted === true);
  assert("1 mensaje enviado", sentMessages.length === 1);
  const m8 = sentMessages[0];
  assert("Está en inglés ('Budget alert')", m8.text.includes("Budget alert"));
  assert("Contiene tag 'First alert this month'", m8.text.includes("First alert this month"));
  console.log("");

  // -----------------------------------------------------------
  // TEST 9 — Presupuesto 0% (sin gastar) + getSummary con sin-budget message
  // -----------------------------------------------------------
  console.log("TEST 9: Sin presupuesto → getBudgetSummary sugiere escribir 'mi presupuesto es X'");
  clearAll();
  const PHONE_EMPTY = "570000000009";
  setMockProfile(PHONE_EMPTY, {
    user_name: "Nuevo Usuario",
    language: "es",
    currency: "COP",
    monthly_salary: 0,
    fixed_expenses: 0,
    monthly_expenses_budget: 0,
    total_monthly_expenses: 0
  });
  const s9 = await budgetAlertService.getBudgetSummary(PHONE_EMPTY);
  assert("Contiene 'Aún no has definido tu presupuesto'", s9.includes("Aún no has definido tu presupuesto"));
  assert("Contiene ejemplo 'mi presupuesto es 2,000,000'", s9.includes("mi presupuesto es"));
  console.log("");

  // -----------------------------------------------------------
  // TEST 10 — runNightlyBudgetReview (cron nocturno stub)
  //   mete 3 perfiles: 1 sin presup, 1 warning 72% sin cache, 1 warning 72% YA alertado
  //   espera solo 1 alerta.
  // -----------------------------------------------------------
  console.log("TEST 10: runNightlyBudgetReview — solo alerta los que no han sido alertados");
  clearAll();

  const USERS = [
    { phone: "570000000010", spent: 0, budget: 0, name: "SinPresup", expectAlert: false },
    { phone: "570000000011", spent: 720000, budget: 1000000, name: "NuevoWarning", expectAlert: true },  // 72%
    { phone: "570000000012", spent: 750000, budget: 1000000, name: "YaAlertado", expectAlert: false }
  ];
  for (const u of USERS) {
    setMockProfile(u.phone, {
      id: Math.floor(Math.random() * 1e6),
      user_name: u.name,
      language: "es",
      currency: "COP",
      monthly_expenses_budget: u.budget,
      total_monthly_expenses: u.spent,
      subscription_active: true
    });
    setSpent(u.phone, u.spent);
  }
  // Pre-marcar 012 como alertado vía cache
  const key12 = `570000000012_${MONTH_KEY}_WARNING`;
  budgetAlertService.sentAlertsCache.set(key12, true);
  // Stubear supabase.from("user_profiles").select() para devolver estos 3
  supabaseService.supabase = {
    from: (table) => {
      if (table === "user_profiles") {
        return {
          select: () => ({
            not: () => ({
              eq: () => Promise.resolve({
                data: USERS.map(u => ({
                  phone_number: u.phone,
                  user_name: u.name,
                  language: "es",
                  subscription_active: true,
                  subscription_end_date: null
                })),
                error: null
              })
            })
          })
        };
      }
      return {
        select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }) }),
        insert: () => Promise.resolve({ error: new Error("stub") })
      };
    }
  };
  const review = await budgetAlertService.runNightlyBudgetReview();
  assert("Total = 3 usuarios", review.total === 3);
  assert("Alertados = 1", review.alerted === 1);
  assert("Skip (sin-presup + ya-alertado) = 2", review.skipped === 2);
  assert("WhatsApp enviados exactamente 1", sentMessages.length === 1);
  console.log("");

  // -----------------------------------------------------------
  // REPORTE FINAL
  // -----------------------------------------------------------
  console.log("============================================================");
  console.log(`📋 RESULTADOS: ${passed} pasados, ${failed} fallidos`);
  console.log("============================================================");
  if (failed > 0) {
    console.log("\n❌ Fallos:");
    failures.forEach((f, i) => console.log(`   ${i + 1}. ${f.name}${f.detail ? " — " + f.detail : ""}`));
    process.exit(1);
  } else {
    console.log("\n🎉 TODOS LOS TESTS PASARON ✅");
    console.log("   Coach Financiero Vivo v1.1 listo para deploy.");
    process.exit(0);
  }
})().catch(err => {
  console.error("\n💥 FATAL ERROR en runner de tests:", err);
  console.error(err.stack);
  process.exit(2);
});
