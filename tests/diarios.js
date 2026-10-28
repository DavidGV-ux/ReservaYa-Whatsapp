// test-daily-tips.js - Script para probar tips
const axios = require('axios');

async function testDailyTips() {
  try {
    console.log('🚀 Probando envío de tips diarios...\n');
    
    const response = await axios.post('http://localhost:3000/send-tips');
    
    console.log('✅ Respuesta del servidor:');
    console.log(JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
}

testDailyTips();
