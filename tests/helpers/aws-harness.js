// tests/helpers/aws-harness.js
// Harness para probar el backend "como si estuviera en AWS":
// invoca lambda.handler con eventos API Gateway v1 (proxy), igual que el deploy real.
//
// IMPORTANTE: los servicios externos (WhatsApp/IA/Supabase/Make) se reemplazan
// por stubs para que las pruebas no hagan llamadas de red ni gasten créditos.
'use strict';

const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');

// --- Configurar entorno ANTES de cargar módulos ---
// dotenv (config.js) no sobrescribe variables ya definidas.
process.env.NODE_ENV = 'development';
process.env.WHATSAPP_APP_SECRET = 'test_app_secret';
process.env.ADMIN_SECRET = 'test_admin_secret';
process.env.WHATSAPP_VERIFY_TOKEN = 'test_verify_token';
process.env.GROQ_API_KEY = 'test_groq_key';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_KEY = 'test_supabase_key';
process.env.WHATSAPP_API_URL = 'https://graph.facebook.com/v18.0';
process.env.WHATSAPP_PHONE_ID = '111222';
process.env.WHATSAPP_TOKEN = 'test_whatsapp_token';
process.env.BLOCKED_USERS = '';
process.env.SUPABASE_JWT_SECRET = 'test_supabase_jwt_secret';

// --- Mini "Supabase" en memoria con fixtures (modificable por los tests) ---
const fixtures = {
  user_profiles: [
    {
      id: 'user-123',
      phone_number: '521551234567',
      email: 'test@fyn.com',
      user_name: 'Test User',
      monthly_salary: 1500,
      fixed_expenses: 300,
      currency: 'MXN',
      referral_code: 'TESTREF',
      subscription_active: true,
      subscription_end_date: null,
      financial_health_score: 80,
      financial_health_level: 'Bueno',
      financial_health_updated_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ],
  transactions: [
    { id: 't1', amount: 120, transaction_type: 'expense', date: '2026-09-02', description: 'Super', category: 'food', user_id: 'user-123' },
  ],
  financial_health_scores: [
    { id: 's1', score: 80, level: 'Bueno', total_points: 80, category_breakdown: {}, answers: {}, attempt_count: 1, created_at: '2026-01-01T00:00:00Z', last_updated_at: '2026-01-01T00:00:00Z', user_id: 'user-123', phone_number: '521551234567' },
  ],
};

function setFixture(table, rows) {
  fixtures[table] = rows;
}
function getFixture(table) {
  return fixtures[table];
}

function rowsMeetFilters(rows, filters) {
  return rows.filter((row) =>
    filters.every(({ col, val }) => {
      if (Array.isArray(val)) return val.includes(row[col]);
      return String(row[col]) === String(val);
    })
  );
}

// Cadena "thenable" inmutable que imita la API de @supabase/postgrest-js
function createQueryBuilder(state) {
  const s = state || { table: null, filters: [], single: false, mode: 'read' };
  const next = (partial) => createQueryBuilder(Object.assign({}, s, partial));

  const qb = {
    from(table) { return next({ table }); },
    select() { return qb; },
    insert(row) { return next({ mode: 'insert', insertRow: row }); },
    update(row) { return next({ mode: 'update', updateRow: row }); },
    delete() { return next({ mode: 'delete' }); },
    upsert(row) { return next({ mode: 'upsert', insertRow: row }); },
    eq(col, val) { return next({ filters: s.filters.concat([{ col, val }]) }); },
    in(col, val) { return next({ filters: s.filters.concat([{ col, val }]) }); },
    match(filters) { return next({ filters: s.filters.concat(Object.keys(filters).map((col) => ({ col, val: filters[col] }))) }); },
    neq() { return qb; }, gt() { return qb; }, gte() { return qb; }, lt() { return qb; }, lte() { return qb; },
    or() { return qb; }, order() { return qb; }, limit() { return qb; }, range() { return qb; },
    maybeSingle() { return next({ single: true }); },
    single() { return next({ single: true }); },

    then(resolve, reject) {
      let data = null;
      let error = null;
      const tableRows = fixtures[s.table] || [];

      if (s.mode === 'insert' || s.mode === 'upsert') {
        const inserted = Array.isArray(s.insertRow) ? s.insertRow[0] : s.insertRow;
        const merged = s.mode === 'upsert'
          ? Object.assign({}, (tableRows.find((r) => r.id === inserted.id) || {}), inserted)
          : inserted;
        if (s.mode === 'upsert' && s.insertRow) {
          const idx = tableRows.findIndex((r) => r.id === merged.id);
          if (idx >= 0) { tableRows[idx] = merged; } else { tableRows.push(merged); }
        } else {
          tableRows.push(merged);
        }
        data = s.single ? merged : [merged];
      } else if (s.mode === 'update') {
        const matched = rowsMeetFilters(tableRows, s.filters);
        if (matched.length) {
          const idx = tableRows.indexOf(matched[0]);
          tableRows[idx] = Object.assign({}, matched[0], s.updateRow);
        }
        data = s.single ? (tableRows[idx !== undefined ? idx : -1] ?? null) : [tableRows[idx]];
      } else if (s.mode === 'delete') {
        const matched = rowsMeetFilters(tableRows, s.filters);
        matched.forEach((m) => { const i = tableRows.indexOf(m); if (i >= 0) tableRows.splice(i, 1); });
        data = null;
      } else {
        const rows = rowsMeetFilters(tableRows, s.filters);
        data = s.single ? (rows[0] ?? null) : rows;
      }

      return Promise.resolve({ data, error }).then(resolve, reject);
    },
    catch(rej) { return Promise.resolve({ data: null, error: null }).catch(rej); },
    finally(fn) { return Promise.resolve({ data: null, error: null }).finally(fn); },
  };

  return qb;
}

const supabaseClientStub = {
  auth: {
    getUser: () => Promise.resolve({ data: { user: { id: 'stub-user' } }, error: null }),
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
  },
  from: (table) => createQueryBuilder().from(table),
};

// --- Stubs de los servicios que requiere index.js ---
const services = {
  'Services/whatsappService.js': {
    sendMessage: async () => ({ id: 'stub' }),
    sendMediaMessage: async () => ({ id: 'stub' }),
    downloadImage: async () => Buffer.from('fake-image'),
    verifyWebhook: (mode, token) => mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN,
  },
  'Services/openaiService.js': {
    generateResponse: async () => 'Respuesta de prueba del stub',
    clearHistory: () => {},
    analyzeImage: async () => ({ esFactura: false, resumen: 'stub' }),
    generateFallbackResponse: () => 'Respuesta de prueba del stub',
    extractUserInfo: async () => ({}),
    parseUserInfoManually: () => ({}),
    extractUserData: async () => ({}),
    searchPreviousConversations: async () => [],
  },
  'Services/supabaseService.js': Object.assign(
    {
      validatePhoneNumber: (p) => String(p || '').replace(/[^0-9]/g, ''),
      normalizePhoneNumber: (p) => String(p || '').replace(/[^0-9]/g, ''),
      getUserProfile: async () => ({}),
      createUserProfile: async () => ({}),
      updateUserProfile: async () => ({}),
      updateUserProfileById: async () => ({}),
      saveMessage: async () => ({}),
      getConversationHistory: async () => [],
      getAllSurveys: async () => [],
      getAvailableLicenseKey: async () => ({ key_code: 'TEST-AAAA-BBBB' }),
      getFinancialHealthScore: async () => null,
      saveFinancialHealthScore: async () => ({}),
      getMonthlyHistory: async () => [],
      saveTransaction: async () => ({}),
      getMonthlyTransactions: async () => [],
      getMonthlyExpensesTotal: async () => ({ total: {}, count: 0, transactions: [] }),
      getAvailableBalance: async () => null,
      getMonthlyExpensesSummary: async () => null,
    },
    { supabase: supabaseClientStub }
  ),
  'Services/makeService.js': {
    sendToMake: async () => ({}),
  },
  'Services/subscriptionService.js': {
    getAllUsersWithSubscriptions: async () => [],
    getSubscriptionInfo: async () => ({ daysRemaining: 5, isActive: true, endDate: null }),
    isSubscriptionActive: async () => ({ isActive: true, daysRemaining: 5, message: null }),
    activateSubscription: async () => ({}),
    deactivateSubscription: async () => ({}),
    redeemLicense: async () => ({ success: true }),
    startSubscription: async () => ({}),
  },
  'Services/userProfileService.js': {
    updateProfileFromFrontend: async () => ({}),
    startSubscriptionFromFrontend: async () => ({}),
  },
  'Services/metricsService.js': {
    getBusinessMetrics: async () => ({}),
  },
  'Services/referralService.js': {
    getReferralStatusList: async () => [],
    markDiscountAsApplied: async () => ({}),
    applyReferralCode: async () => ({ success: true }),
  },
  'Services/budgetAlertService.js': {
    getLivingFinancialProfile: async () => ({}),
    getBudgetSummary: async () => '',
    evaluateAndAlertAfterExpense: async () => ({ alerted: false }),
    runNightlyBudgetReview: async () => ({}),
  },
  'Services/dailyTipsService.js': {
    sendDailyTipsToAll: async () => ({ sent: 0 }),
    getStats: async () => ({}),
    sendDailyTip: async () => ({ sent: 1 }),
  },
  'Services/monthlyFeedbackService.js': {
    sendMonthlyFeedbackToAll: async () => ({ sent: 0 }),
    getStats: async () => ({}),
    sendMonthlyFeedback: async () => ({ sent: 1 }),
  },
  'Services/profileUpdateService.js': {
    processPendingUpdate: async () => ({ processed: false }),
    handleProfileChange: async () => ({ handled: false }),
  },
};

function installStubs() {
  for (const [rel, stub] of Object.entries(services)) {
    const abs = require.resolve(path.join(ROOT, rel));
    require.cache[abs] = { id: abs, filename: abs, loaded: true, exports: stub };
  }
}

function getHandler() {
  installStubs();
  delete require.cache[require.resolve(path.join(ROOT, 'index.js'))];
  delete require.cache[require.resolve(path.join(ROOT, 'lambda.js'))];
  delete require.cache[require.resolve(path.join(ROOT, 'config.js'))];
  const lambda = require(path.join(ROOT, 'lambda.js'));
  return lambda.handler;
}

// Se usa UNA sola instancia del handler (como una Lambda "caliente"):
// el estado en memoria (rate limiters, caché) persiste entre invocaciones.
let _handler = null;
function handler() {
  if (!_handler) {
    _handler = getHandler();
  }
  return _handler;
}

/**
 * Invocar el handler como lo haría AWS (API Gateway proxy v1).
 * @param {object} evento - {httpMethod, path, headers, body, queryStringParameters, isBase64Encoded}
 */
async function invoke(evento) {
  const h = handler();

  const defaultHeaders = {
    'X-Forwarded-For': '203.0.113.1',
    Host: 'execute-api.us-east-1.amazonaws.com',
    'Content-Type': 'application/json',
  };

  const event = Object.assign(
    {
      version: '1.0',
      resource: evento.path,
      path: evento.path,
      httpMethod: evento.httpMethod || 'GET',
      headers: {},
      multiValueHeaders: {},
      queryStringParameters: evento.queryStringParameters || null,
      multiValueQueryStringParameters: null,
      requestContext: {
        resourceId: 'stub',
        resourcePath: evento.path,
        httpMethod: evento.httpMethod || 'GET',
        requestId: `req-${Date.now()}`,
        identity: { sourceIp: '203.0.113.1' },
        path: evento.path,
        stage: 'dev',
      },
      body: evento.body || '',
      isBase64Encoded: evento.isBase64Encoded || false,
    },
    evento
  );

  // Fusionar headers de prueba con los defaults (importante: Content-Type)
  event.headers = Object.assign(defaultHeaders, evento.headers || {});

  return h(event, { awsRequestId: `awsreq-${Date.now()}` });
}

/** Computar firma HMAC-SHA256 (X-Hub-Signature-256) que envía Meta */
function sign(body, secret) {
  const digest = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${digest}`;
}

/** Firmar un JWT HS256 como lo hace Supabase Auth (para pruebas). */
function signJwt(payload, secret, options = {}) {
  const now = Math.floor(Date.now() / 1000);
  const ttlSec = options.ttlSec == null ? 3600 : options.ttlSec;
  const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const header = b64url({ alg: 'HS256', typ: 'JWT' });
  const claims = Object.assign({ iat: now, exp: now + ttlSec }, payload);
  const body = `${header}.${b64url(claims)}`;
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

module.exports = { invoke, sign, signJwt, setFixture, getFixture, ROOT };