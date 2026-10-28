# 📊 Endpoint de Feedback Mensual - Guía Completa

## 🔍 URL Correcta del Endpoint

Tu endpoint debe incluir el **stage** en la URL. La estructura correcta es:

```
https://qv0a7ta.execute-api.us-east-1.amazonaws.com/{STAGE}/send-monthly-feedback
```

### Stages Posibles:
- `dev` - Versión de desarrollo
- `v2` - Nueva versión (si la desplegaste)
- `prod` - Producción (si la configuraste)

## ✅ URLs Correctas

### Si usas stage `dev`:
```
POST https://qv0a7ta.execute-api.us-east-1.amazonaws.com/dev/send-monthly-feedback
```

### Si usas stage `v2`:
```
POST https://qv0a7ta.execute-api.us-east-1.amazonaws.com/v2/send-monthly-feedback
```

### Si NO especificaste stage (default):
```
POST https://qv0a7ta.execute-api.us-east-1.amazonaws.com/send-monthly-feedback
```

## 🔧 Cómo Verificar tu Stage

Ejecuta en tu terminal:

```bash
# Ver información de despliegue
serverless info

# O con stage específico
serverless info --stage dev
serverless info --stage v2
```

Busca la línea que dice:
```
endpoints:
  ANY - https://qv0a7ta.execute-api.us-east-1.amazonaws.com/{stage}/...
```

## 📋 Configuración en ReqBin.com

### Paso 1: Configurar Petición

1. **Method**: `POST`
2. **URL**: `https://qv0a7ta.execute-api.us-east-1.amazonaws.com/dev/send-monthly-feedback`
   (Reemplaza `dev` con tu stage correcto)
3. **Headers**:
   ```
   Content-Type: application/json
   ```
4. **Body**: (puede estar vacío)
   ```json
   {}
   ```

### Paso 2: Enviar

Haz clic en **"Send"**

## ✅ Respuesta Exitosa

```json
{
  "success": true,
  "message": "Feedback mensual enviado",
  "result": {
    "total": 10,
    "sent": 9,
    "failed": 1
  },
  "timestamp": "2025-12-11T20:00:00.000Z"
}
```

## ❌ Respuesta con Error

```json
{
  "success": false,
  "error": "Error message here",
  "timestamp": "2025-12-11T20:00:00.000Z"
}
```

## 🔍 Verificar que el Endpoint Funciona

### Opción 1: Probar Health Check

Primero prueba el health check para verificar que la API funciona:

```
GET https://qv0a7ta.execute-api.us-east-1.amazonaws.com/dev/health
```

Si esto funciona, la API está activa.

### Opción 2: Probar Endpoint Raíz

```
GET https://qv0a7ta.execute-api.us-east-1.amazonaws.com/dev/
```

Deberías ver información sobre el chatbot.

## 🐛 Solución de Problemas

### Error 500 - Internal Server Error

**Posibles causas:**

1. **Falta el método `getUsersWithCompleteStudyCached()`**
   - ✅ **SOLUCIONADO**: Ya agregado al código

2. **Variables de entorno faltantes**
   - Verifica que tengas configuradas:
     - `SUPABASE_URL`
     - `SUPABASE_KEY`
     - `GROQ_API_KEY`
     - `WHATSAPP_TOKEN`

3. **Error en Supabase**
   - Verifica que la tabla `user_profiles` exista
   - Verifica que la tabla `monthly_feedback_log` exista

4. **Error en WhatsApp API**
   - Verifica que el token de WhatsApp sea válido

### Ver Logs en CloudWatch

Para ver el error específico:

```bash
# Ver logs en tiempo real
serverless logs -f api --tail

# O con stage específico
serverless logs -f api --stage dev --tail
```

## 📊 Endpoints Disponibles

| Endpoint | Method | Descripción |
|----------|--------|-------------|
| `/send-monthly-feedback` | POST | Enviar feedback a todos los usuarios |
| `/send-feedback/:phone` | POST | Enviar feedback a un usuario específico |
| `/feedback-stats` | GET | Ver estadísticas de feedback |
| `/health` | GET | Health check de la API |
| `/` | GET | Información del chatbot |

## 🎯 Ejemplo Completo en ReqBin

### Configuración:
```
Method: POST
URL: https://qv0a7ta.execute-api.us-east-1.amazonaws.com/dev/send-monthly-feedback
Headers:
  Content-Type: application/json
Body:
  {}
```

### Si funciona, verás:
```json
{
  "success": true,
  "message": "Feedback mensual enviado",
  "result": {
    "total": 5,
    "sent": 5,
    "failed": 0
  }
}
```

## ⚠️ Nota Importante

Si la URL **NO incluye el stage** y obtienes error 404, necesitas agregarlo:

**Incorrecto:**
```
https://qv0a7ta.execute-api.us-east-1.amazonaws.com/send-monthly-feedback
```

**Correcto:**
```
https://qv0a7ta.execute-api.us-east-1.amazonaws.com/dev/send-monthly-feedback
```

