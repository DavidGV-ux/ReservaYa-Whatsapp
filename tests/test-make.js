const axios = require("axios");
const config = require("./config");

// Script para probar la integración con Make
class MakeTestScript {
  constructor() {
    this.makeWebhookUrl = config.make.webhookUrl;
  }

  // Generar datos de prueba realistas
  generateTestData() {
    const testData = {
      trackingId: `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId: "573001180584",
      userName: "Usuario de Prueba",
      message: "Hola, este es un mensaje de prueba para configurar Make",
      response:
        "Hola! Gracias por tu mensaje de prueba. Este es el sistema de chatbot WhatsApp funcionando correctamente. La integración con Make está siendo configurada.",
      timestamp: new Date().toISOString(),
      // Campos adicionales para Make
      messageType: "text",
      platform: "whatsapp",
      botVersion: "1.0.0",
      environment: config.nodeEnv || "development",
      processingTime: Math.floor(Math.random() * 3000) + 500, // 500-3500ms
      aiModel: config.google?.model || "gemini-1.5-flash",
      conversationId: `conv_${Date.now()}`,
      userLanguage: "es",
      messageLength: 0,
      responseLength: 0,
    };

    // Calcular longitudes
    testData.messageLength = testData.message.length;
    testData.responseLength = testData.response.length;

    return testData;
  }

  // Enviar datos de prueba a Make
  async sendTestData(customData = null) {
    try {
      const testData = customData || this.generateTestData();

      console.log("📤 Enviando datos de prueba a Make...");
      console.log("🔗 Webhook URL:", this.makeWebhookUrl);
      console.log("📦 Datos a enviar:", JSON.stringify(testData, null, 2));

      const response = await axios.post(this.makeWebhookUrl, testData, {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "ChatBot-WhatsApp/1.0.0",
        },
        timeout: 10000, // 10 segundos timeout
      });

      console.log("✅ Respuesta de Make:");
      console.log("   Status:", response.status);
      console.log("   Headers:", response.headers);
      console.log("   Data:", response.data);

      return {
        success: true,
        status: response.status,
        data: response.data,
      };
    } catch (error) {
      console.error("❌ Error enviando datos a Make:");
      console.error("   Message:", error.message);

      if (error.response) {
        console.error("   Status:", error.response.status);
        console.error("   Headers:", error.response.headers);
        console.error("   Data:", error.response.data);
      }

      return {
        success: false,
        error: error.message,
        details: error.response?.data,
      };
    }
  }

  // Enviar múltiples mensajes de prueba
  async sendMultipleTests(count = 3, delay = 2000) {
    console.log(
      `🔄 Enviando ${count} mensajes de prueba con ${delay}ms de intervalo...\n`,
    );

    const results = [];

    for (let i = 1; i <= count; i++) {
      console.log(`📤 Enviando mensaje ${i}/${count}...`);

      // Generar datos únicos para cada envío
      const testData = {
        ...this.generateTestData(),
        message: `Mensaje de prueba #${i} para Make - ${new Date().toLocaleString()}`,
        response: `Respuesta automática #${i} generada para prueba de integración con Make.`,
        testNumber: i,
        totalTests: count,
      };

      const result = await this.sendTestData(testData);
      results.push({
        testNumber: i,
        success: result.success,
        ...result,
      });

      // Esperar antes del siguiente envío (excepto en el último)
      if (i < count) {
        console.log(`⏳ Esperando ${delay}ms antes del siguiente envío...\n`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // Mostrar resumen
    console.log("\n📊 RESUMEN DE PRUEBAS:");
    console.log("=".repeat(50));

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    console.log(`✅ Exitosos: ${successful}`);
    console.log(`❌ Fallidos: ${failed}`);
    console.log(`📈 Total: ${results.length}`);

    results.forEach((result) => {
      const status = result.success ? "✅" : "❌";
      console.log(`   Test ${result.testNumber}: ${status}`);
    });

    return results;
  }

  // Simular una conversación completa
  async simulateConversation() {
    const conversation = [
      {
        message: "Hola",
        response: "Hola! ¿Cómo puedo ayudarte hoy?",
      },
      {
        message: "¿Qué servicios ofrecen?",
        response:
          "Ofrecemos diversos servicios digitales incluyendo desarrollo web, chatbots, automatizaciones y consultoría tecnológica.",
      },
      {
        message: "¿Cuáles son sus precios?",
        response:
          "Los precios varían según el proyecto. Te puedo conectar con un especialista para que te brinde una cotización personalizada.",
      },
      {
        message: "Perfecto, muchas gracias",
        response: "¡De nada! ¿Hay algo más en lo que pueda ayudarte?",
      },
    ];

    console.log("🎭 Simulando conversación completa...\n");

    const results = [];
    const baseUserId = "525512345678";
    const conversationId = `conv_${Date.now()}`;

    for (let i = 0; i < conversation.length; i++) {
      const step = conversation[i];

      console.log(`💬 Paso ${i + 1}/${conversation.length}: "${step.message}"`);

      const testData = {
        ...this.generateTestData(),
        userId: baseUserId,
        message: step.message,
        response: step.response,
        conversationId: conversationId,
        messageNumber: i + 1,
        totalMessages: conversation.length,
        conversationType: "simulation",
      };

      const result = await this.sendTestData(testData);
      results.push(result);

      // Pausa entre mensajes para simular conversación real
      if (i < conversation.length - 1) {
        const delay = Math.floor(Math.random() * 3000) + 1000; // 1-4 segundos
        console.log(`⏳ Pausa de ${delay}ms...\n`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    console.log("🎭 Conversación simulada completada.\n");
    return results;
  }
}

// Función principal para ejecutar las pruebas
async function main() {
  console.log("🧪 SCRIPT DE PRUEBAS PARA MAKE");
  console.log("===============================\n");

  const makeTest = new MakeTestScript();

  // Verificar configuración
  if (!config.make.webhookUrl) {
    console.error("❌ Error: MAKE_WEBHOOK_URL no está configurado en .env");
    process.exit(1);
  }

  console.log("⚙️  Configuración:");
  console.log(`   Webhook URL: ${config.make.webhookUrl}`);
  console.log(`   Entorno: ${config.nodeEnv}`);
  console.log("");

  try {
    // Mostrar menú de opciones
    const args = process.argv.slice(2);
    const option = args[0] || "single";

    switch (option) {
      case "single":
      case "1":
        console.log("📤 Ejecutando: Envío único de prueba\n");
        await makeTest.sendTestData();
        break;

      case "multiple":
      case "3":
        const count = parseInt(args[1]) || 3;
        console.log(`📤 Ejecutando: Envío múltiple (${count} mensajes)\n`);
        await makeTest.sendMultipleTests(count);
        break;

      case "conversation":
      case "conv":
        console.log("📤 Ejecutando: Simulación de conversación\n");
        await makeTest.simulateConversation();
        break;

      case "help":
      case "--help":
      case "-h":
        console.log("📚 USO:");
        console.log("   node test-make.js [opción] [parámetros]");
        console.log("");
        console.log("🎯 OPCIONES:");
        console.log("   single          Enviar un mensaje de prueba (default)");
        console.log(
          "   multiple [n]    Enviar múltiples mensajes (default: 3)",
        );
        console.log("   conversation    Simular conversación completa");
        console.log("   help            Mostrar esta ayuda");
        console.log("");
        console.log("💡 EJEMPLOS:");
        console.log("   node test-make.js");
        console.log("   node test-make.js multiple 5");
        console.log("   node test-make.js conversation");
        break;

      default:
        console.log(
          '❓ Opción no reconocida. Usa "help" para ver las opciones disponibles.',
        );
        process.exit(1);
    }
  } catch (error) {
    console.error("❌ Error ejecutando pruebas:", error.message);
    process.exit(1);
  }

  console.log("\n✅ Script completado.");
  console.log("📋 Revisa Make para ver los datos capturados.");
  console.log('💡 Usa "node test-make.js help" para ver más opciones.');
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  main().catch(console.error);
}

module.exports = MakeTestScript;
