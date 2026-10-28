# 🔐 Guía: Actualizar Token de WhatsApp Expirado

## 🚨 Problema

El token de acceso de WhatsApp ha expirado. Error:
```
Error validating access token: Session has expired
```

## ✅ Solución Rápida

### Opción 1: Actualizar solo el token (Recomendado)

1. **Obtén un nuevo token de WhatsApp:**
   - Ve a https://developers.facebook.com/
   - Selecciona tu App de WhatsApp
   - Ve a **WhatsApp > Configuración**
   - Copia el **Access Token** (o genera uno nuevo si es necesario)

2. **Actualiza el token en AWS Lambda usando AWS CLI:**

```bash
# Reemplaza NUEVO_TOKEN_AQUI con tu token real
aws lambda update-function-configuration \
    --function-name whatsapp-chatbot-dev-api \
    --environment "Variables={
        NODE_ENV=production,
        WHATSAPP_API_URL=https://graph.facebook.com/v18.0,
        WHATSAPP_PHONE_ID=TU_PHONE_ID,
        WHATSAPP_TOKEN=NUEVO_TOKEN_AQUI,
        WHATSAPP_VERIFY_TOKEN=TU_VERIFY_TOKEN,
        GROQ_API_KEY=TU_GROQ_KEY,
        GROQ_MODEL=groq/compound,
        SUPABASE_URL=TU_SUPABASE_URL,
        SUPABASE_KEY=TU_SUPABASE_KEY,
        MAKE_WEBHOOK_URL=TU_MAKE_URL,
        REDIS_ENABLED=false
    }" \
    --region us-east-1
```

⚠️ **IMPORTANTE**: Debes incluir TODAS las variables de entorno, no solo el token. Si solo actualizas el token, las demás variables se perderán.

### Opción 2: Actualizar desde archivo .env (Más seguro)

1. **Edita tu archivo `.env` local** con el nuevo token:
   ```env
   WHATSAPP_TOKEN=TU_NUEVO_TOKEN_AQUI
   ```

2. **Haz deploy completo:**
   ```bash
   cd /Users/davidgalvis/Documents/FYN/FYN
   serverless deploy --stage dev
   ```

   Esto actualizará todas las variables de entorno desde tu `.env`.

### Opción 3: Actualizar desde AWS Console

1. Ve a **AWS Console** → **Lambda** → **whatsapp-chatbot-dev-api**
2. Ve a **Configuración** → **Variables de entorno** → **Editar**
3. Actualiza `WHATSAPP_TOKEN` con el nuevo valor
4. **Guarda los cambios**

## 🔍 Verificar Variables Actuales

Antes de actualizar, verifica qué variables tienes configuradas:

```bash
aws lambda get-function-configuration \
    --function-name whatsapp-chatbot-dev-api \
    --query 'Environment.Variables' \
    --output json
```

Esto te mostrará todas las variables actuales para que puedas copiarlas al comando de actualización.

## 📝 Script Automatizado

He creado un script `actualizar-token-whatsapp.sh` que puedes usar:

```bash
cd /Users/davidgalvis/Documents/FYN/FYN
chmod +x actualizar-token-whatsapp.sh
./actualizar-token-whatsapp.sh
```

## ⚠️ Importante

- Los tokens de WhatsApp pueden expirar. Considera usar tokens de larga duración o configurar renovación automática.
- Si el token expira frecuentemente, verifica la configuración de tu App en Meta Developers.
- Para producción, considera usar **AWS Secrets Manager** o **Parameter Store** para gestionar tokens de forma más segura.

## 🧪 Probar después de actualizar

Después de actualizar el token, envía un mensaje de prueba al chatbot para verificar que funciona:

```bash
# Ver logs en tiempo real
serverless logs -f api --tail
```

