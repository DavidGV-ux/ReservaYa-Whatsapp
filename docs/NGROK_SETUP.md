# 🚀 Guía de Configuración con ngrok

Esta guía te ayudará a configurar ngrok para probar el webhook de WhatsApp localmente.

## 📋 Prerrequisitos

1. **Instalar ngrok:**
   - Descarga desde: https://ngrok.com/download
   - O instala con npm: `npm install -g ngrok`
   - O con chocolatey (Windows): `choco install ngrok`

2. **Crear cuenta en ngrok (gratis):**
   - Ve a https://ngrok.com/signup
   - Obtén tu authtoken desde: https://dashboard.ngrok.com/get-started/your-authtoken

## 🔧 Paso 1: Configurar ngrok

### 1.1 Autenticar ngrok
```bash
ngrok config add-authtoken TU_AUTHTOKEN_AQUI
```

### 1.2 Iniciar el servidor local
En una terminal, ejecuta:
```bash
npm start
# O directamente:
node index.js
```

Deberías ver:
```
✅ Servidor iniciado en puerto 3000
```

### 1.3 Iniciar ngrok
En otra terminal, ejecuta:
```bash
ngrok http 3000
```

O si quieres usar un dominio personalizado (requiere plan de pago):
```bash
ngrok http 3000 --domain=tu-dominio.ngrok-free.app
```

### 1.4 Obtener la URL de ngrok
Verás algo como:
```
Forwarding  https://abc123.ngrok-free.app -> http://localhost:3000
```

**Copia la URL HTTPS** (ejemplo: `https://abc123.ngrok-free.app`)

## 🔗 Paso 2: Configurar Webhook en WhatsApp

### 2.1 Acceder a Meta for Developers
1. Ve a https://developers.facebook.com/
2. Selecciona tu app de WhatsApp Business
3. Ve a **WhatsApp > Configuration**

### 2.2 Configurar Webhook
1. Haz clic en **"Edit"** en la sección de Webhook
2. Ingresa la URL del webhook:
   ```
   https://TU_URL_NGROK.ngrok-free.app/webhook
   ```
   Ejemplo: `https://abc123.ngrok-free.app/webhook`

3. Ingresa el **Verify Token**:
   - Debe coincidir con `WHATSAPP_VERIFY_TOKEN` en tu `.env` o `config.js`
   - Por defecto: `TU_VERIFY_TOKEN`

4. Haz clic en **"Verify and save"**

### 2.3 Verificar que funciona
Deberías ver en la terminal donde corre tu servidor:
```
🔍 GET /webhook - Verificación recibida
✅ VERIFICACIÓN EXITOSA
```

### 2.4 Suscribirse a eventos
En la misma página de configuración, haz clic en **"Manage"** y selecciona:
- ✅ messages
- ✅ message_deliveries
- ✅ message_reads
- ✅ message_reactions

## 🧪 Paso 3: Probar el Webhook

### 3.1 Verificar que el servidor responde
Abre tu navegador y ve a:
```
https://TU_URL_NGROK.ngrok-free.app/webhook
```

Deberías ver un error 400 (es normal, falta el challenge de WhatsApp).

### 3.2 Probar con curl
```bash
curl -X GET "https://TU_URL_NGROK.ngrok-free.app/webhook?hub.verify_token=TU_VERIFY_TOKEN&hub.challenge=TEST123&hub.mode=subscribe"
```

Deberías recibir: `TEST123`

### 3.3 Enviar un mensaje de prueba
1. Abre WhatsApp en tu teléfono
2. Envía un mensaje al número de WhatsApp Business configurado
3. Revisa la terminal del servidor - deberías ver logs del mensaje procesado

## 📊 Paso 4: Monitorear con ngrok

### 4.1 Interfaz web de ngrok
Abre en tu navegador:
```
http://localhost:4040
```

Aquí podrás ver:
- Todas las peticiones HTTP
- Request/Response completos
- Tiempo de respuesta
- Errores

### 4.2 Ver logs en tiempo real
En la terminal del servidor verás:
```
[TRACKING_ID] Webhook recibido
[TRACKING_ID] Mensaje de Usuario (+1234567890)
[TRACKING_ID] Generando respuesta con Google Gemini...
[TRACKING_ID] Respuesta enviada exitosamente
```

## ⚠️ Consideraciones Importantes

### URLs temporales
- Las URLs gratuitas de ngrok cambian cada vez que reinicias ngrok
- Si reinicias ngrok, debes actualizar el webhook en WhatsApp

### Límites del plan gratuito
- 40 conexiones por minuto
- 1 túnel simultáneo
- URLs aleatorias (cambian al reiniciar)

### Solución: Dominio estático
Si necesitas una URL permanente, considera:
- Plan de pago de ngrok ($8/mes)
- O usar un servicio como Cloudflare Tunnel (gratis)

## 🔍 Solución de Problemas

### Error: "Tunnel not found"
- Verifica que ngrok esté corriendo
- Verifica que la URL sea correcta (con https://)

### Error: "Verify token mismatch"
- Verifica que `WHATSAPP_VERIFY_TOKEN` en tu código coincida con el de WhatsApp
- Revisa el archivo `.env` o `config.js`

### Error: "Connection refused"
- Verifica que el servidor esté corriendo en el puerto 3000
- Verifica que ngrok esté apuntando al puerto correcto

### No recibo mensajes
- Verifica que estés suscrito a los eventos en WhatsApp
- Revisa los logs en http://localhost:4040
- Verifica que el número de teléfono esté autorizado

## 📝 Checklist

- [ ] ngrok instalado y autenticado
- [ ] Servidor corriendo en puerto 3000
- [ ] ngrok corriendo y mostrando URL HTTPS
- [ ] Webhook configurado en WhatsApp con la URL de ngrok
- [ ] Verify token configurado correctamente
- [ ] Suscrito a eventos de mensajes
- [ ] Probado enviando un mensaje
- [ ] Logs apareciendo en la terminal

## 🚀 Siguiente Paso

Una vez que todo funcione localmente, puedes:
1. Desplegar a producción (Railway, Heroku, AWS Lambda)
2. Configurar un dominio personalizado
3. Configurar SSL permanente

