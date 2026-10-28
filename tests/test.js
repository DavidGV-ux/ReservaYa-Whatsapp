const http = require('http');
const https = require('https');

// Configuración de pruebas
const config = {
  host: 'localhost',
  port: 3000,
  timeout: 5000
};

// Función para hacer peticiones HTTP
function makeRequest(options) {
  return new Promise((resolve, reject) => {
    const protocol = options.protocol === 'https:' ? https : http;

    const req = protocol.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const jsonData = data ? JSON.parse(data) : null;
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: jsonData,
            rawData: data
          });
        } catch (error) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: null,
            rawData: data
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.setTimeout(config.timeout, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

// Pruebas
async function runTests() {
  console.log('🧪 INICIANDO PRUEBAS DEL CHATBOT WHATSAPP');
  console.log('==========================================\n');

  const tests = [
    {
      name: 'Endpoint raíz (/)',
      options: {
        hostname: config.host,
        port: config.port,
        path: '/',
        method: 'GET'
      }
    },
    {
      name: 'Health Check (/health)',
      options: {
        hostname: config.host,
        port: config.port,
        path: '/health',
        method: 'GET'
      }
    },
    {
      name: 'Webhook Verification (GET /webhook)',
      options: {
        hostname: config.host,
        port: config.port,
        path: '/webhook?hub.mode=subscribe&hub.verify_token=TU_VERIFY_TOKEN&hub.challenge=test_challenge',
        method: 'GET'
      }
    },
    {
      name: 'Webhook Verification - Token Incorrecto',
      options: {
        hostname: config.host,
        port: config.port,
        path: '/webhook?hub.mode=subscribe&hub.verify_token=token_incorrecto&hub.challenge=test_challenge',
        method: 'GET'
      }
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    console.log(`📋 Ejecutando: ${test.name}`);

    try {
      const result = await makeRequest(test.options);

      console.log(`   Status: ${result.statusCode}`);
      console.log(`   Response: ${result.rawData ? result.rawData.substring(0, 200) : 'No data'}${result.rawData && result.rawData.length > 200 ? '...' : ''}`);

      if (result.statusCode >= 200 && result.statusCode < 400) {
        console.log(`   ✅ PASÓ\n`);
        passed++;
      } else {
        console.log(`   ❌ FALLÓ\n`);
        failed++;
      }

    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}\n`);
      failed++;
    }
  }

  // Prueba de webhook POST (simulación)
  console.log('📋 Ejecutando: Webhook POST - Mensaje de prueba');
  try {
    const webhookBody = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: '525512345678',
                    id: 'wamid.test123',
                    timestamp: Math.floor(Date.now() / 1000).toString(),
                    text: {
                      body: 'Hola, este es un mensaje de prueba'
                    },
                    type: 'text'
                  }
                ],
                contacts: [
                  {
                    profile: {
                      name: 'Usuario de Prueba'
                    },
                    wa_id: '525512345678'
                  }
                ]
              }
            }
          ]
        }
      ]
    };

    const postResult = await makeRequest({
      hostname: config.host,
      port: config.port,
      path: '/webhook',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(webhookBody)
    });

    console.log(`   Status: ${postResult.statusCode}`);
    console.log(`   Response: ${postResult.rawData || 'No data'}`);

    if (postResult.statusCode === 200) {
      console.log(`   ✅ PASÓ (Nota: Puede mostrar errores de servicios externos)\n`);
      passed++;
    } else {
      console.log(`   ❌ FALLÓ\n`);
      failed++;
    }

  } catch (error) {
    console.log(`   ❌ ERROR: ${error.message}\n`);
    failed++;
  }

  // Resumen
  console.log('==========================================');
  console.log('📊 RESUMEN DE PRUEBAS:');
  console.log(`✅ Pasaron: ${passed}`);
  console.log(`❌ Fallaron: ${failed}`);
  console.log(`📈 Total: ${passed + failed}`);
  console.log('==========================================\n');

  if (failed === 0) {
    console.log('🎉 ¡Todas las pruebas pasaron! El servidor está funcionando correctamente.');
  } else {
    console.log('⚠️  Algunas pruebas fallaron. Revisa la configuración y que el servidor esté ejecutándose.');
  }

  // Instrucciones adicionales
  console.log('\n📝 NOTAS IMPORTANTES:');
  console.log('1. Para pruebas completas, asegúrate de que el servidor esté ejecutándose');
  console.log('2. Los errores de servicios externos (OpenAI, Supabase, Make) son esperados en pruebas');
  console.log('3. Para probar con ngrok: ngrok http 3000');
  console.log('4. Configurar el webhook en WhatsApp Business con la URL de ngrok');
  console.log('\n🔧 COMANDOS ÚTILES:');
  console.log('- Iniciar servidor: npm start');
  console.log('- Modo desarrollo: npm run dev');
  console.log('- Ver logs: tail -f logs/chatbot-*.log');
  console.log('- Health check: curl http://localhost:3000/health');
}

// Verificar si el servidor está ejecutándose
async function checkServerStatus() {
  try {
    await makeRequest({
      hostname: config.host,
      port: config.port,
      path: '/',
      method: 'GET'
    });
    return true;
  } catch (error) {
    return false;
  }
}

// Ejecutar pruebas
async function main() {
  console.log('🔍 Verificando estado del servidor...');

  const serverRunning = await checkServerStatus();

  if (!serverRunning) {
    console.log('❌ El servidor no está ejecutándose en http://localhost:3000');
    console.log('💡 Ejecuta: npm start (o npm run dev) en otra terminal');
    console.log('⏳ Esperando 5 segundos para reintentarlo...\n');

    setTimeout(async () => {
      const retryServerRunning = await checkServerStatus();
      if (!retryServerRunning) {
        console.log('❌ El servidor sigue sin responder. Ejecuta las pruebas manualmente después de iniciar el servidor.');
        process.exit(1);
      } else {
        console.log('✅ Servidor detectado, ejecutando pruebas...\n');
        await runTests();
      }
    }, 5000);
  } else {
    console.log('✅ Servidor detectado, ejecutando pruebas...\n');
    await runTests();
  }
}

// Manejo de errores no capturados
process.on('uncaughtException', (error) => {
  console.error('Error no capturado:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Promesa rechazada no manejada:', reason);
  process.exit(1);
});

// Ejecutar si es llamado directamente
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  makeRequest,
  runTests,
  checkServerStatus
};
