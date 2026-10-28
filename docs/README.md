# Chatbot WhatsApp con IA

Sistema completo de chatbot para WhatsApp integrado con Google Gemini, Supabase y Make.

## 🚀 Características

- ✅ Recepción y envío de mensajes WhatsApp
- 🤖 Respuestas inteligentes con Google Gemini
- 💾 Almacenamiento de conversaciones en Supabase
- 🔗 Integración con Make para automatizaciones
- 📱 Soporte para mensajes de texto y multimedia
- 💬 Historial de conversación por usuario

## 📋 Prerrequisitos

- Node.js 16+ instalado
- Cuenta de WhatsApp Business API
- API Key de Google Gemini
- Proyecto en Supabase
- Webhook configurado en Make

## 🛠️ Instalación

1. **Clonar el repositorio e instalar dependencias:**
```bash
npm install
```

2. **Configurar variables de entorno:**
Crea un archivo `.env` en la raíz del proyecto. Ver `ENV_SETUP.md` para las variables necesarias.
Las variables de Google Gemini y Make ya tienen valores por defecto en `config.js`.

3. **Configurar la base de datos en Supabase:**
- Ve a tu panel de Supabase
- Ejecuta el SQL que se encuentra en `supabase_setup.sql`

## ⚙️ Configuración

### WhatsApp Business API
- **Phone ID:** TU_PHONE_NUMBER_ID
- **Business Account ID:** TU_BUSINESS_ACCOUNT_ID
- **Token configurado en .env**

### Google Gemini
- **Modelo:** gemini-2.0-flash-lite
- **API Key:** Configurada en `config.js` o en `.env` como `GOOGLE_API_KEY`

### Supabase
- **URL:** https://TU_PROYECTO.supabase.co
- **Tabla:** conversaciones

### Make
- **Webhook URL configurada para automatizaciones**

## 🏃‍♂️ Ejecución

### Desarrollo
```bash
npm run dev
```

### Producción
```bash
npm start
```

El servidor se ejecutará en el puerto 3000 por defecto.

## 📡 Configuración del Webhook

### Para desarrollo local con ngrok:

1. **Instalar ngrok:**
```bash
npm install -g ngrok
```

2. **Exponer el servidor local:**
```bash
ngrok http 3000
```

3. **Configurar en WhatsApp Business:**
- URL del webhook: `https://tu-url-ngrok.ngrok.io/webhook`
- Token de verificación: `TU_VERIFY_TOKEN`

## 📊 Estructura del Proyecto

```
Back/
├── Services/
│   ├── whatsappService.js    # Servicio de WhatsApp API
│   ├── openaiService.js      # Servicio de Google Gemini (mantiene nombre por compatibilidad)
│   ├── supabaseService.js    # Servicio de base de datos
│   └── makeService.js        # Servicio de Make
├── config.js                 # Configuración de variables
├── index.js                  # Servidor principal
├── .env                      # Variables de entorno
├── package.json              # Dependencias
└── supabase_setup.sql        # Script de base de datos
```

## 🔧 API Endpoints

### GET /webhook
Verificación del webhook de WhatsApp.

### POST /webhook
Recepción de mensajes desde WhatsApp.

### GET /
Endpoint de prueba para verificar que el servidor está funcionando.

## 🗄️ Base de Datos

La tabla `conversaciones` almacena:
- `user_id`: Número de teléfono del usuario
- `user_name`: Nombre del usuario
- `mensaje`: Mensaje enviado por el usuario
- `respuesta`: Respuesta generada por la IA
- `fecha`: Timestamp de la conversación

## 🤖 Funcionalidades de IA

- **Memoria de conversación:** El bot mantiene el contexto de las últimas 10 interacciones por usuario
- **Respuestas personalizadas:** Configurado para ser amigable y conciso
- **Manejo de errores:** Respuestas de fallback en caso de errores

## 🔗 Integraciones

### Make Automation
Cada mensaje procesado se envía automáticamente a Make con:
```json
{
  "userId": "número_teléfono",
  "userName": "nombre_usuario",
  "message": "mensaje_original",
  "response": "respuesta_ia",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 🚨 Solución de Problemas

### Error de verificación de webhook
- Verifica que el `WHATSAPP_VERIFY_TOKEN` coincida en ambos lados

### Error de Google Gemini
- Verifica que la API key sea válida
- Verifica que el modelo `gemini-2.0-flash-lite` esté disponible
- Comprueba que tengas créditos disponibles

### Error de Supabase
- Verifica que la tabla `conversaciones` exista
- Comprueba las políticas RLS si están habilitadas

### Error de Make
- Verifica que la URL del webhook sea correcta
- Comprueba que el escenario esté activo en Make

## 📝 Logs

El sistema registra:
- ✅ Mensajes recibidos y procesados
- ❌ Errores en servicios externos
- 🔄 Estado de las integraciones

## 🔒 Seguridad

- Variables sensibles en archivo `.env`
- Tokens de verificación para webhooks
- Políticas de seguridad en Supabase

## 👥 Soporte

Para problemas o consultas:
1. Revisa los logs del servidor
2. Verifica las configuraciones en cada servicio
3. Comprueba las credenciales en el archivo `.env`

## 📈 Próximas Mejoras

- [ ] Soporte para más tipos de media
- [ ] Dashboard web para administración
- [ ] Métricas y analytics
- [ ] Respuestas automáticas configurables
- [ ] Integración con más plataformas