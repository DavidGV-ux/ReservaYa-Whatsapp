# 🚀 Guía de Despliegue y Configuración

Esta guía te llevará paso a paso para configurar y desplegar tu chatbot de WhatsApp con todas las integraciones.

## 📋 Pre-requisitos

Antes de comenzar, asegúrate de tener:

- [ ] Node.js 16+ instalado
- [ ] Cuenta de WhatsApp Business
- [ ] Cuenta de Meta Developers
- [ ] Cuenta de Google con API Key de Gemini
- [ ] Proyecto en Supabase
- [ ] Cuenta en Make (opcional)

## 🛠️ Paso 1: Configuración Local

### 1.1 Instalar Dependencias
```bash
cd Back
npm install
```

### 1.2 Verificar Variables de Entorno
El archivo `.env` ya está configurado con tus credenciales:
- ✅ WhatsApp Token
- ✅ Google Gemini API Key  
- ✅ Supabase URL y Key
- ✅ Make Webhook URL

### 1.3 Configurar Base de Datos
```bash
# Ejecutar en Supabase SQL Editor
cat supabase_setup.sql
```

### 1.4 Probar Localmente
```bash
# Iniciar servidor
npm start

# En otra terminal, ejecutar pruebas
npm test
```

## 📱 Paso 2: Configuración de WhatsApp Business API

### 2.1 Configurar App en Meta Developers

1. **Ir a Meta Developers**: https://developers.facebook.com/
2. **Crear/Seleccionar App**:
   - Tipo: Business
   - Nombre: Tu app de WhatsApp
3. **Agregar Producto WhatsApp**:
   - WhatsApp → Configuración

### 2.2 Configurar Webhook

**Credenciales actuales:**
- Phone Number ID: `TU_PHONE_NUMBER_ID`
- Access Token: `TU_WHATSAPP_TOKEN`
- Verify Token: `TU_VERIFY_TOKEN`

**Para desarrollo local:**
1. Instalar ngrok:
   ```bash
   npm install -g ngrok
   ```

2. Exponer servidor local:
   ```bash
   ngrok http 3000
   ```

3. Configurar en Meta Developers:
   - Webhook URL: `https://tu-id.ngrok.io/webhook`
   - Verify Token: `TU_VERIFY_TOKEN`

**Para producción:**
- Webhook URL: `https://tu-dominio.com/webhook`

### 2.3 Campos de Webhook a Suscribir
En la configuración del webhook, suscríbete a:
- [x] messages
- [x] message_deliveries  
- [x] message_reads
- [x] message_reactions

### 2.4 Verificar Configuración
```bash
curl -X GET "https://tu-webhook-url/webhook?hub.verify_token=TU_VERIFY_TOKEN&hub.challenge=CHALLENGE_ACCEPTED&hub.mode=subscribe"
```

## ☁️ Paso 3: Despliegue en Producción

### 3.1 Opciones de Hosting

#### **Opción A: Railway (Recomendado)**
```bash
# Instalar Railway CLI
npm install -g @railway/cli

# Login y deploy
railway login
railway init
railway up
```

#### **Opción B: Heroku**
```bash
# Crear Procfile
echo "web: node index.js" > Procfile

# Deploy con Heroku CLI
heroku create tu-app-chatbot
git add .
git commit -m "Deploy chatbot"
git push heroku main
```

#### **Opción C: DigitalOcean App Platform**
- Conectar repositorio GitHub
- Configurar variables de entorno
- Deploy automático

#### **Opción D: VPS (Ubuntu)**
```bash
# En el servidor
sudo apt update
sudo apt install nodejs npm nginx

# Configurar PM2
npm install -g pm2
pm2 start index.js --name "chatbot-whatsapp"
pm2 startup
pm2 save

# Configurar Nginx (proxy reverso)
sudo nano /etc/nginx/sites-available/chatbot
```

### 3.2 Variables de Entorno en Producción

**Importante**: Configurar todas las variables en tu plataforma:

```env
PORT=3000
NODE_ENV=production
WHATSAPP_API_URL=https://graph.facebook.com/v18.0
WHATSAPP_PHONE_ID=TU_PHONE_NUMBER_ID
WHATSAPP_TOKEN=TU_WHATSAPP_TOKEN
WHATSAPP_VERIFY_TOKEN=TU_VERIFY_TOKEN
GOOGLE_API_KEY=TU_GOOGLE_API_KEY
GOOGLE_MODEL=gemini-2.0-flash-lite
SUPABASE_URL=https://TU_PROYECTO.supabase.co
SUPABASE_KEY=TU_SUPABASE_KEY
MAKE_WEBHOOK_URL=https://hook.us2.make.com/TU_WEBHOOK_ID
```

## 🔧 Paso 4: Configuración de Supabase

### 4.1 Crear Tabla
```sql
-- Ejecutar en Supabase SQL Editor
CREATE TABLE IF NOT EXISTS conversaciones (
  id BIGSERIAL PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  user_name VARCHAR(100),
  mensaje TEXT NOT NULL,
  respuesta TEXT NOT NULL,
  fecha TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_id ON conversaciones(user_id);
CREATE INDEX IF NOT EXISTS idx_fecha ON conversaciones(fecha DESC);
```

### 4.2 Configurar Políticas RLS (Opcional)
```sql
-- Habilitar Row Level Security
ALTER TABLE conversaciones ENABLE ROW LEVEL SECURITY;

-- Política para permitir operaciones
CREATE POLICY "Enable all operations" ON conversaciones
    FOR ALL USING (true);
```

### 4.3 Verificar Conexión
```bash
# Health check incluye verificación de Supabase
curl https://tu-dominio.com/health
```

## 🤖 Paso 5: Configuración de Google Gemini

### 5.1 Verificar API Key
La API Key de Google Gemini ya está configurada en el archivo `.env`:
```
GOOGLE_API_KEY=TU_GOOGLE_API_KEY
GOOGLE_MODEL=gemini-2.0-flash-lite
```

### 5.2 Configurar Límites (Opcional)
En tu dashboard de Google AI Studio:
- Configurar límites de uso mensual
- Configurar alertas de gasto
- Revisar usage regularmente

## 🔗 Paso 6: Configuración de Make

### 6.1 Crear Escenario
1. **Webhook Trigger**: 
   - URL: `https://hook.us2.make.com/TU_WEBHOOK_ID`
   
2. **Procesar Datos**:
   ```json
   {
     "trackingId": "{{trackingId}}",
     "userId": "{{userId}}",
     "userName": "{{userName}}",
     "message": "{{message}}",
     "response": "{{response}}",
     "timestamp": "{{timestamp}}"
   }
   ```

3. **Acciones Posibles**:
   - Enviar email de notificación
   - Guardar en Google Sheets
   - Crear ticket en sistema CRM
   - Enviar a Slack/Discord

### 6.2 Activar Escenario
- ✅ Activar escenario
- ✅ Configurar frecuencia de ejecución
- ✅ Probar con datos de muestra

## ✅ Paso 7: Verificación Final

### 7.1 Checklist Pre-Lanzamiento
- [ ] Servidor desplegado y funcionando
- [ ] Webhook de WhatsApp configurado
- [ ] Base de datos Supabase funcionando
- [ ] Google Gemini respondiendo correctamente
- [ ] Make recibiendo datos (opcional)
- [ ] Health check devuelve status OK
- [ ] Logs funcionando correctamente

### 7.2 Pruebas de Funcionalidad
```bash
# 1. Health Check
curl https://tu-dominio.com/health

# 2. Verificación de Webhook
curl "https://tu-dominio.com/webhook?hub.mode=subscribe&hub.verify_token=TU_VERIFY_TOKEN&hub.challenge=test"

# 3. Enviar mensaje de prueba desde WhatsApp
# Envía cualquier mensaje a tu número de WhatsApp Business
```

### 7.3 Monitoreo
```bash
# Ver logs en tiempo real
tail -f logs/chatbot-$(date +%Y-%m-%d).log

# O si usas PM2
pm2 logs chatbot-whatsapp
```

## 🚨 Solución de Problemas Comunes

### Error: "Webhook verification failed"
**Solución:**
- Verificar que `WHATSAPP_VERIFY_TOKEN` coincida
- Comprobar URL del webhook
- Revisar logs del servidor

### Error: "Google Gemini API error"
**Solución:**
- Verificar API key válida
- Comprobar créditos disponibles
- Revisar límites de rate limiting

### Error: "Supabase connection failed"
**Solución:**
- Verificar URL y API key
- Comprobar que la tabla existe
- Revisar políticas RLS

### Error: "Make webhook timeout"
**Solución:**
- Verificar URL del webhook
- Comprobar que el escenario esté activo
- Revisar logs de Make

## 📊 Monitoreo y Mantenimiento

### Métricas Importantes
- Número de mensajes procesados por día
- Tiempo de respuesta promedio
- Errores por servicio
- Uso de créditos Google Gemini

### Logs a Monitorear
```bash
# Buscar errores
grep "ERROR" logs/chatbot-*.log

# Contar mensajes procesados
grep "Mensaje procesado exitosamente" logs/chatbot-*.log | wc -l

# Verificar salud de servicios
grep "health" logs/chatbot-*.log
```

### Mantenimiento Regular
- **Diario**: Revisar logs por errores
- **Semanal**: Verificar uso de créditos Google Gemini
- **Mensual**: Limpiar logs antiguos
- **Trimestral**: Revisar y actualizar dependencias

## 🔒 Seguridad

### Mejores Prácticas
- ✅ Variables sensibles en variables de entorno
- ✅ HTTPS obligatorio en producción
- ✅ Rate limiting configurado
- ✅ Logs no exponen datos sensibles
- ✅ Tokens con permisos mínimos necesarios

### Respaldo
```bash
# Respaldar base de datos Supabase
# (usar herramientas de Supabase Dashboard)

# Respaldar configuración
cp .env .env.backup
```

## 📈 Escalamiento

### Optimizaciones Futuras
- [ ] Cache de respuestas frecuentes (Redis)
- [ ] Load balancer para múltiples instancias
- [ ] Queue para procesamiento asíncrono
- [ ] Métricas con Prometheus/Grafana
- [ ] CDN para archivos estáticos

## 🆘 Soporte

### Recursos Útiles
- **Documentación WhatsApp**: https://developers.facebook.com/docs/whatsapp
- **Google Gemini API**: https://ai.google.dev/docs
- **Supabase Docs**: https://supabase.com/docs
- **Make Academy**: https://www.make.com/en/academy

### Contacto
Para soporte técnico, revisar:
1. Logs del servidor
2. Documentación de cada servicio
3. Status pages de los servicios
4. Community forums

---

**¡Felicidades! 🎉 Tu chatbot WhatsApp está listo para funcionar.**

Recuerda probar todo antes del lanzamiento y mantener monitoreo constante.