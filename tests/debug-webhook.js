const axios = require('axios');

async function testWebhook() {
  const url = 'https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/webhook';
  
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WHATSAPP_BUSINESS_ACCOUNT_ID",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "PHONE_NUMBER",
                phone_number_id: "PHONE_NUMBER_ID"
              },
              contacts: [
                {
                  profile: {
                    name: "Test User"
                  },
                  wa_id: "573001180584"
                }
              ],
              messages: [
                {
                  from: "573001180584",
                  id: "wamid.HBgLNTczMDAxMTgwNTg0FQIAERgSRTI0QTM0NTY3OUI4QzRENzU4AA==",
                  timestamp: Math.floor(Date.now() / 1000),
                  text: {
                    body: "hola"
                  },
                  type: "text"
                }
              ]
            },
            field: "messages"
          }
        ]
      }
    ]
  };

  console.log('🧪 Enviando petición de prueba al webhook...');
  try {
    const response = await axios.post(url, payload);
    console.log('✅ Respuesta del servidor:', response.status, response.statusText);
    console.log('📄 Cuerpo:', response.data);
  } catch (error) {
    console.error('❌ Error en la petición:', error.response?.status, error.response?.statusText);
    console.error('📄 Detalles:', error.response?.data || error.message);
  }
}

testWebhook();
