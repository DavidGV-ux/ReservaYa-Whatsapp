# 🔐 Configuración de Variables de Entorno

Este archivo contiene las variables de entorno necesarias para el proyecto.

## 📝 Crear archivo `.env`

Crea un archivo `.env` en la raíz del proyecto con el siguiente contenido:

```env
# Configuración del Servidor
NODE_ENV=development
PORT=3000

# WhatsApp Business API
WHATSAPP_API_URL=https://graph.facebook.com/v18.0
WHATSAPP_PHONE_ID=tu_phone_id
WHATSAPP_TOKEN=tu_token_de_whatsapp
WHATSAPP_VERIFY_TOKEN=tu_token_de_verificacion

# Google Gemini API
GOOGLE_API_KEY=TU_GOOGLE_API_KEY
GOOGLE_MODEL=gemini-2.0-flash-lite

# Supabase
SUPABASE_URL=tu_url_de_supabase
SUPABASE_KEY=tu_key_de_supabase

# Make.com Webhook
MAKE_WEBHOOK_URL=https://hook.us2.make.com/TU_WEBHOOK_ID

# Redis (Opcional)
REDIS_ENABLED=false
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_TLS=false
```

## ✅ Variables Configuradas

Las siguientes variables ya están configuradas con valores por defecto en `config.js`:

- **GOOGLE_API_KEY**: `TU_GOOGLE_API_KEY`
- **GOOGLE_MODEL**: `gemini-2.0-flash-lite`
- **MAKE_WEBHOOK_URL**: `https://hook.us2.make.com/TU_WEBHOOK_ID`

Si no creas el archivo `.env`, el sistema usará estos valores por defecto.

## 🔄 Para Sobrescribir Valores

Si quieres usar diferentes valores, simplemente crea el archivo `.env` y define las variables que necesites cambiar.

