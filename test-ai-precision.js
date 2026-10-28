const service = require("./Services/openaiService");
const config = require("./config");

async function testAIPrecision() {
  
  const userId = "test_user_1234567890";
  const userProfile = {
    user_name: "Carlos Pérez",
    monthly_salary: 5000,
    fixed_expenses: 2000,
    currency: "USD",
    country: "Colombia",
    language: "es"
  };

  // MOCK de contexto financiero para la prueba
  const financialContextMock = `
📊 ESTADO FINANCIERO ACTUAL (Junio 2026):
- Salario Mensual: USD 5,000
- Gastos Fijos: USD 2,000
- Gastos Variables (Este mes): USD 1,500
- Disponible hoy: USD 1,500
- Porcentaje de presupuesto usado: 70%
  `;

  const testMessages = [
    "Hola, ¿cómo van mis finanzas este mes?",
    "¿Crees que pueda comprarme un café hoy?",
    "Dame una recomendación para ahorrar más."
  ];

  console.log("🚀 Iniciando prueba de precisión de IA (Simulación)...\n");
  console.log("📈 Contexto inyectado:");
  console.log(financialContextMock);
  console.log("-----------------------------------\n");

  for (const msg of testMessages) {
    console.log(`👤 Usuario: ${msg}`);
    try {
      // Forzamos el contexto en el historial para la prueba local sin BD
      if (!service.conversationHistory.has(userId)) {
        service.conversationHistory.set(userId, [
          { role: "system", content: "Eres Fyn, un coach financiero experto. Datos: " + service.buildProfileContext(userProfile) },
          { role: "system", content: "ESTADO ACTUAL DEL USUARIO:" + financialContextMock }
        ]);
      }
      
      const response = await service.generateResponse(userId, msg, userProfile);
      console.log(`🤖 Fyn: ${response}\n`);
    } catch (error) {
      console.error(`❌ Error: ${error.message}\n`);
    }
  }
}

testAIPrecision();
