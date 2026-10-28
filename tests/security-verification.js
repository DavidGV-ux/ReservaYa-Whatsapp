// tests/security-verification.js
// Suite de seguridad: verifica endpoints uno por uno con invocaciones "como en AWS"
// (lambda.handler + eventos API Gateway proxy v1).
//
// Ejecutar: node tests/security-verification.js
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const { invoke, sign, signJwt, setFixture, getFixture, ROOT } = require('./helpers/aws-harness');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, extra = '') {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    failures.push({ name, extra });
    console.log(`  ❌ ${name}${extra ? ' -> ' + extra : ''}`);
  }
}

function withSecret(headers = {}) {
  return Object.assign({ Authorization: 'Bearer test_admin_secret' }, headers);
}

async function run() {
  console.log('\n=== 1) FIRMA DEL WEBHOOK (X-Hub-Signature-256) ===');

  const payload = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'wsid',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '57300', phone_number_id: '111222' },
              contacts: [{ profile: { name: 'Test' }, wa_id: '573001234567' }],
              messages: [
                { from: '573001234567', id: 'wamid.1', timestamp: '1700000000', type: 'reaction' },
              ],
            },
            field: 'messages',
          },
        ],
      },
    ],
  });

  // 1.1 Sin header de firma -> debe rechazar (403)
  let r = await invoke({ httpMethod: 'POST', path: '/webhook', body: payload });
  check('POST /webhook sin firma -> 403', r.statusCode === 403, `status=${r.statusCode}`);

  // 1.2 Firma incorrecta -> 403
  r = await invoke({
    httpMethod: 'POST',
    path: '/webhook',
    headers: { 'X-Hub-Signature-256': 'sha256=' + '0'.repeat(64) },
    body: payload,
  });
  check('POST /webhook con firma incorrecta -> 403', r.statusCode === 403, `status=${r.statusCode}`);

  // 1.3 Header malformado (sin prefijo sha256=) -> 403
  r = await invoke({
    httpMethod: 'POST',
    path: '/webhook',
    headers: { 'X-Hub-Signature-256': 'abc123' },
    body: payload,
  });
  check('POST /webhook con header malformado -> 403', r.statusCode === 403, `status=${r.statusCode}`);

  // 1.4 Firma válida -> 200 (acepta el webhook)
  r = await invoke({
    httpMethod: 'POST',
    path: '/webhook',
    headers: { 'X-Hub-Signature-256': sign(payload, 'test_app_secret') },
    body: payload,
  });
  check('POST /webhook con firma válida -> 200', r.statusCode === 200, `status=${r.statusCode}`);

  // 1.5 Verificación GET clásica (hub.verify_token)
  r = await invoke({
    httpMethod: 'GET',
    path: '/webhook',
    queryStringParameters: {
      'hub.mode': 'subscribe',
      'hub.verify_token': 'test_verify_token',
      'hub.challenge': 'CHALLENGE_OK',
    },
  });
  check('GET /webhook con token correcto -> challenge', r.statusCode === 200 && r.body === 'CHALLENGE_OK', `status=${r.statusCode}`);

  r = await invoke({
    httpMethod: 'GET',
    path: '/webhook',
    queryStringParameters: {
      'hub.mode': 'subscribe',
      'hub.verify_token': 'TOTALMENTE_INCORRECTO',
      'hub.challenge': 'CHALLENGE_OK',
    },
  });
  check('GET /webhook con token incorrecto -> 403', r.statusCode === 403, `status=${r.statusCode}`);

  console.log('\n=== 2) ADMIN: secreto sin fallback + comparación segura ===');

  // 2.1 Endpoints admin sin credenciales -> 401
  r = await invoke({ httpMethod: 'GET', path: '/admin/users' });
  check('GET /admin/users sin auth -> 401', r.statusCode === 401, `status=${r.statusCode}`);

  r = await invoke({ httpMethod: 'GET', path: '/admin/users', headers: { Authorization: 'Bearer admin_secret_123' } });
  check('GET /admin/users con default legacy (admin_secret_123) -> 401', r.statusCode === 401, `status=${r.statusCode}`);

  r = await invoke({ httpMethod: 'GET', path: '/admin/users', headers: { Authorization: 'Bearer secret-incorrecto' } });
  check('GET /admin/users con secreto incorrecto -> 401', r.statusCode === 401, `status=${r.statusCode}`);

  // 2.2 Con credenciales correctas -> 200
  r = await invoke({ httpMethod: 'GET', path: '/admin/users', headers: withSecret() });
  check('GET /admin/users con auth correcta -> 200', r.statusCode === 200, `status=${r.statusCode}`);

  r = await invoke({ httpMethod: 'GET', path: '/admin/users', queryStringParameters: { secret: 'test_admin_secret' } });
  check('GET /admin/users con ?secret= correcto -> 200', r.statusCode === 200, `status=${r.statusCode}`);

  console.log('\n=== 3) ENDPOINTS DE ADMIN/BROADCAST ANTES SIN AUTH ===');

  // 3.1 Broadcast templates (antes no requerían auth)
  r = await invoke({ httpMethod: 'GET', path: '/admin/broadcast/templates' });
  check('GET /admin/broadcast/templates sin auth -> 401', r.statusCode === 401, `status=${r.statusCode}`);
  r = await invoke({ httpMethod: 'GET', path: '/admin/broadcast/templates', headers: withSecret() });
  check('GET /admin/broadcast/templates con auth -> 200', r.statusCode === 200, `status=${r.statusCode}`);

  r = await invoke({ httpMethod: 'POST', path: '/admin/broadcast/templates', body: JSON.stringify({ title: 't', content: 'c' }) });
  check('POST /admin/broadcast/templates sin auth -> 401', r.statusCode === 401, `status=${r.statusCode}`);

  r = await invoke({ httpMethod: 'DELETE', path: '/admin/broadcast/templates/123' });
  check('DELETE /admin/broadcast/templates/:id sin auth -> 401', r.statusCode === 401, `status=${r.statusCode}`);

  // 3.2 budget-test (exponía perfil financiero y podía enviar WhatsApp)
  r = await invoke({ httpMethod: 'GET', path: '/budget-test/573001234567' });
  check('GET /budget-test/:phone sin auth -> 401', r.statusCode === 401, `status=${r.statusCode}`);
  r = await invoke({ httpMethod: 'GET', path: '/budget-test/573001234567', headers: withSecret() });
  check('GET /budget-test/:phone con auth -> 200', r.statusCode === 200, `status=${r.statusCode}`);

  // 3.3 debug/study (exponía datos del usuario)
  r = await invoke({ httpMethod: 'GET', path: '/debug/study', queryStringParameters: { phone: '573001234567' } });
  check('GET /debug/study sin auth -> 401', r.statusCode === 401, `status=${r.statusCode}`);
  r = await invoke({ httpMethod: 'GET', path: '/debug/study', queryStringParameters: { phone: '573001234567' }, headers: withSecret() });
  check('GET /debug/study con auth -> 200', r.statusCode === 200, `status=${r.statusCode}`);

  // 3.4 Endpoints de testing que envían mensajes masivos
  r = await invoke({ httpMethod: 'POST', path: '/send-tips' });
  check('POST /send-tips sin auth -> 401', r.statusCode === 401, `status=${r.statusCode}`);
  r = await invoke({ httpMethod: 'POST', path: '/send-tips', headers: withSecret() });
  check('POST /send-tips con auth -> 200', r.statusCode === 200, `status=${r.statusCode}`);

  r = await invoke({ httpMethod: 'GET', path: '/tips-stats' });
  check('GET /tips-stats sin auth -> 401', r.statusCode === 401, `status=${r.statusCode}`);

  r = await invoke({ httpMethod: 'POST', path: '/send-monthly-feedback' });
  check('POST /send-monthly-feedback sin auth -> 401', r.statusCode === 401, `status=${r.statusCode}`);

  r = await invoke({ httpMethod: 'POST', path: '/send-feedback/573001234567' });
  check('POST /send-feedback/:phone sin auth -> 401', r.statusCode === 401, `status=${r.statusCode}`);

  r = await invoke({ httpMethod: 'POST', path: '/send-tip/573001234567' });
  check('POST /send-tip/:phone sin auth -> 401', r.statusCode === 401, `status=${r.statusCode}`);

  console.log('\n=== 4) RATE LIMITING en endpoints públicos ===');

  // /chat/demo permite máx 10/min por IP -> la 11ª debe ser 429
  let saw429 = false;
  let saw200 = false;
  for (let i = 0; i < 11; i++) {
    r = await invoke({
      httpMethod: 'POST',
      path: '/chat/demo',
      headers: { 'X-Forwarded-For': '198.51.100.7' },
      body: JSON.stringify({ message: 'hola', sessionId: 's' + i }),
    });
    if (r.statusCode === 429) saw429 = true;
    if (r.statusCode === 200) saw200 = true;
  }
  check('/chat/demo: acepta y luego limita a 429 (10/min)', saw200 && saw429, `saw200=${saw200} saw429=${saw429}`);

  // Aunque se reutilice la misma IP en otro endpoint, cada ruta tiene su propio límite
  r = await invoke({ httpMethod: 'POST', path: '/subscription/start', headers: { 'X-Forwarded-For': '198.51.100.7' }, body: JSON.stringify({ email: 'a@b.co', phoneNumber: '573001234567' }) });
  check('/subscription/start con límite independiente -> 200', r.statusCode === 200, `status=${r.statusCode}`);

  console.log('\n=== 5) PRUEBAS UNITARIAS AUXILIARES ===');
  const Utils = require(pathJoin(ROOT, 'utils.js'));

  const body = JSON.stringify({ ok: true });
  const validSig = sign(body, 'secret-abc');
  check('verifyWhatsAppSignature válida -> true', Utils.verifyWhatsAppSignature(Buffer.from(body), validSig, 'secret-abc') === true);
  check('verifyWhatsAppSignature con secreto malo -> false', Utils.verifyWhatsAppSignature(Buffer.from(body), validSig, 'other-secret') === false);
  check('verifyWhatsAppSignature sin header -> false', Utils.verifyWhatsAppSignature(Buffer.from(body), null, 'secret-abc') === false);
  check('verifyWhatsAppSignature sin secret -> true (transicional, log warning)', Utils.verifyWhatsAppSignature(Buffer.from(body), validSig, '') === true);
  check('safeEqual iguales -> true', Utils.safeEqual('abc', 'abc') === true);
  check('safeEqual distintos -> false', Utils.safeEqual('abc', 'abd') === false);
  check('safeEqual longitudes distintas -> false', Utils.safeEqual('abc', 'ab') === false);

  console.log('\n=== 6) AUTH JWT (Supabase) en endpoints de datos del usuario ===');
  const configModule = require(pathJoin(ROOT, 'config.js'));
  const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
  const ownPhone = '521551234567';
  const otherPhone = '99999999999';
  const validHeader = {
    Authorization: `Bearer ${signJwt({ sub: 'user-123', email: 'test@fyn.com' }, JWT_SECRET)}`,
  };

  setFixture('user_profiles', [
    { id: 'user-123', phone_number: ownPhone, email: 'test@fyn.com', user_name: 'Test', monthly_salary: 1500, fixed_expenses: 300, currency: 'MXN', referral_code: 'TESTREF', subscription_active: true, subscription_end_date: null },
  ]);
  setFixture('transactions', [
    { id: 't1', amount: 120, transaction_type: 'expense', date: '2026-09-02', description: 'Super', category: 'food', user_id: 'user-123' },
  ]);
  setFixture('financial_health_scores', [
    { id: 's1', score: 80, level: 'Bueno', total_points: 80, category_breakdown: {}, answers: {}, attempt_count: 1, created_at: '2026-01-01T00:00:00Z', last_updated_at: '2026-01-01T00:00:00Z', user_id: 'user-123', phone_number: ownPhone },
  ]);

  r = await invoke({ httpMethod: 'GET', path: '/subscription/' + ownPhone + '/days' });
  check('GET /subscription/:phone/days sin token -> 401', r.statusCode === 401, `status=${r.statusCode}`);

  r = await invoke({
    httpMethod: 'GET',
    path: '/subscription/' + ownPhone + '/days',
    headers: { Authorization: 'Bearer ' + signJwt({ sub: 'user-123' }, 'wrong_secret') },
  });
  check('GET /subscription/:phone/days con secreto malo -> 401', r.statusCode === 401, `status=${r.statusCode}`);

  r = await invoke({
    httpMethod: 'GET',
    path: '/subscription/' + ownPhone + '/days',
    headers: { Authorization: 'Bearer ' + signJwt({ sub: 'user-123' }, JWT_SECRET, { ttlSec: -60 }) },
  });
  check('GET /subscription/:phone/days token expirado -> 401', r.statusCode === 401, `status=${r.statusCode}`);

  r = await invoke({ httpMethod: 'GET', path: '/subscription/' + ownPhone + '/days', headers: validHeader });
  check('GET /subscription/:phone/days con token propio -> 200', r.statusCode === 200, `status=${r.statusCode}`);

  r = await invoke({ httpMethod: 'GET', path: '/subscription/' + otherPhone + '/days', headers: validHeader });
  check('GET /subscription/:phone/days con phone ajeno -> 403', r.statusCode === 403, `status=${r.statusCode}`);

  r = await invoke({ httpMethod: 'GET', path: '/user/financial-health', queryStringParameters: { user_id: 'otro-user' }, headers: validHeader });
  check('GET /user/financial-health con user_id ajeno -> 403', r.statusCode === 403, `status=${r.statusCode}`);

  const prevSecret = configModule.supabase.jwtSecret;
  configModule.supabase.jwtSecret = '';
  r = await invoke({ httpMethod: 'GET', path: '/subscription/' + ownPhone + '/days', headers: validHeader });
  configModule.supabase.jwtSecret = prevSecret;
  check('Sin SUPABASE_JWT_SECRET (fail-closed) -> 401', r.statusCode === 401, `status=${r.statusCode}`);

  r = await invoke({ httpMethod: 'GET', path: '/user/history/' + ownPhone, headers: validHeader });
  check('GET /user/history/:phone con token -> 200', r.statusCode === 200, `status=${r.statusCode}`);

  r = await invoke({ httpMethod: 'GET', path: '/user/financial-health', headers: validHeader });
  check('GET /user/financial-health con token -> 200', r.statusCode === 200, `status=${r.statusCode}`);

  const answers10 = {};
  for (let q = 1; q <= 10; q++) answers10[String(q)] = 2;

  r = await invoke({ httpMethod: 'POST', path: '/user/financial-health', headers: validHeader, body: JSON.stringify({ answers: answers10 }) });
  check('POST /user/financial-health con token -> 200', r.statusCode === 200, `status=${r.statusCode}`);

  r = await invoke({ httpMethod: 'POST', path: '/user/financial-health', body: JSON.stringify({ answers: answers10 }) });
  check('POST /user/financial-health sin token -> 401', r.statusCode === 401, `status=${r.statusCode}`);

  r = await invoke({ httpMethod: 'GET', path: '/user/financial-dashboard', queryStringParameters: { phone: ownPhone }, headers: validHeader });
  check('GET /user/financial-dashboard con token -> 200', r.statusCode === 200, `status=${r.statusCode}`);

  r = await invoke({ httpMethod: 'GET', path: '/user/financial-dashboard', queryStringParameters: { phone: otherPhone }, headers: validHeader });
  check('GET /user/financial-dashboard con phone ajeno -> 403', r.statusCode === 403, `status=${r.statusCode}`);

  // Vinculo por email: perfiles creados desde el chat (id != auth id) se resuelven por email
  const linkedHeader = { Authorization: `Bearer ${signJwt({ sub: 'wa-webuser', email: 'test@fyn.com' }, JWT_SECRET)}` };
  r = await invoke({ httpMethod: 'GET', path: '/user/financial-dashboard', queryStringParameters: { phone: ownPhone }, headers: linkedHeader });
  check('GET /user/financial-dashboard perfil por EMAIL (id distinto) -> 200', r.statusCode === 200, `status=${r.statusCode}`);

  const mismatchHeader = { Authorization: `Bearer ${signJwt({ sub: 'wa-webuser', email: 'otro@x.com' }, JWT_SECRET)}` };
  r = await invoke({ httpMethod: 'GET', path: '/user/financial-dashboard', queryStringParameters: { phone: ownPhone }, headers: mismatchHeader });
  check('GET /user/financial-dashboard email sin perfil vinculado -> 403', r.statusCode === 403, `status=${r.statusCode}`);

  check('verifyJwt válido -> payload con sub', Utils.verifyJwt(signJwt({ sub: 'u1' }, JWT_SECRET), JWT_SECRET)?.sub === 'u1');
  check('verifyJwt token basura -> null', Utils.verifyJwt('aaa.bbb.ccc', JWT_SECRET) === null);
  check('verifyJwt sin secret -> null', Utils.verifyJwt(signJwt({ sub: 'u1' }, 'x'), '') === null);

  console.log('\n=== 7) CORS + MAKE WEBHOOK ===');
  const ALLOWED_ORIGIN = 'https://d133uvy2su9xyr.cloudfront.net';
  const DISALLOWED_ORIGIN = 'https://evil.example.com';
  const acao = (resp) => (resp.headers || {})['access-control-allow-origin'];
  const vary = (resp) => ((resp.headers || {})['vary'] || '');

  r = await invoke({
    httpMethod: 'OPTIONS',
    path: '/subscription/521551234567/days',
    headers: {
      Origin: ALLOWED_ORIGIN,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization,content-type',
    },
  });
  check('Preflight OPTIONS desde origen permitido -> 204 + ACAO', r.statusCode === 204 && acao(r) === ALLOWED_ORIGIN, `status=${r.statusCode} acao=${acao(r)}`);
  check('Preflight incluye Vary: Origin', (vary(r) || '').includes('Origin'));

  r = await invoke({
    httpMethod: 'OPTIONS',
    path: '/subscription/521551234567/days',
    headers: {
      Origin: DISALLOWED_ORIGIN,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization',
    },
  });
  check('Preflight OPTIONS desde origen NO permitido -> sin ACAO', r.statusCode === 204 && !acao(r), `status=${r.statusCode} acao=${acao(r)}`);

  r = await invoke({ httpMethod: 'GET', path: '/health', headers: { Origin: ALLOWED_ORIGIN } });
  check('GET /health desde origen permitido -> 200 + ACAO', r.statusCode === 200 && acao(r) === ALLOWED_ORIGIN, `status=${r.statusCode} acao=${acao(r)}`);

  r = await invoke({ httpMethod: 'GET', path: '/health', headers: { Origin: DISALLOWED_ORIGIN } });
  check('GET /health desde origen NO permitido -> 200 sin ACAO (navegador bloquea)', r.statusCode === 200 && !acao(r), `status=${r.statusCode} acao=${acao(r)}`);

  r = await invoke({ httpMethod: 'GET', path: '/health' }); // sin header Origin (no-navegador)
  check('GET /health sin header Origin -> 200 sin ACAO', r.statusCode === 200 && !acao(r), `status=${r.statusCode} acao=${acao(r)}`);

  const configuredOrigins = configModule.cors.allowedOrigins || [];
  check('config.cors.allowedOrigins incluye CloudFront y localhost', configuredOrigins.includes(ALLOWED_ORIGIN) && configuredOrigins.includes('http://localhost:4200'));

  // makeService: sin MAKE_WEBHOOK_URL (sin fallback hardcodeado) no lanza ni envía.
  const makePath = pathJoin(ROOT, 'Services/makeService.js');
  delete require.cache[makePath];
  const RealMakeService = require(makePath);
  const prevMakeUrl = configModule.make.webhookUrl;
  configModule.make.webhookUrl = '';
  const makeResult = await RealMakeService.sendToMake({ test: 1 }).catch(() => null);
  configModule.make.webhookUrl = prevMakeUrl;
  check('makeService sin webhookUrl -> skipped (sin fallback hardcodeado)', !!makeResult && makeResult.skipped === true, `result=${JSON.stringify(makeResult)}`);

  // El fallback hardcodeado del webhook de Make debe haber desaparecido del código.
  const fs = require('fs');
  const configSource = fs.readFileSync(pathJoin(ROOT, 'config.js'), 'utf8');
  check('config.js sin fallback hardcodeado de MAKE_WEBHOOK_URL', !configSource.includes('hook.us2.make.com'));

  console.log(`\n========================================`);
  console.log(`RESULTADO: ${passed} OK, ${failed} FALLOS`);
  if (failures.length > 0) {
    console.log('Fallos:');
    failures.forEach((f) => console.log(`  - ${f.name} (${f.extra})`));
  }
  console.log('========================================\n');
  process.exit(failed > 0 ? 1 : 0);
}

function pathJoin(base, rel) {
  return require('path').join(base, rel);
}

run().catch((err) => {
  console.error('Error ejecutando suite:', err);
  process.exit(1);
});