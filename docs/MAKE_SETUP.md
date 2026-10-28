# 🔗 Configuración de Make (Integromat) - Guía Paso a Paso

Esta guía te llevará paso a paso para configurar la integración con Make y capturar todos los datos del chatbot WhatsApp.

## 🎯 Objetivo

Configurar Make para recibir y procesar automáticamente todos los datos de las conversaciones del chatbot, incluyendo:
- Información del usuario
- Mensajes originales
- Respuestas de la IA
- Metadatos de seguimiento

## 📋 Pre-requisitos

- [x] Cuenta activa en Make.com
- [x] Chatbot WhatsApp funcionando
- [x] Webhook URL de Make: `https://hook.us2.make.com/TU_WEBHOOK_ID`

## 🚀 Paso 1: Crear Nuevo Escenario en Make

### 1.1 Acceder a Make
1. Ve a [make.com](https://make.com)
2. Inicia sesión en tu cuenta
3. Haz clic en **"Create a new scenario"**

### 1.2 Configurar Webhook
1. Busca y selecciona **"Webhooks"** 
2. Selecciona **"Custom webhook"**
3. Haz clic en **"Add"**
4. **¡IMPORTANTE!** Copia la URL del webhook que se genera
5. Verifica que coincida con: `https://hook.us2.make.com/TU_WEBHOOK_ID`

## 🧪 Paso 2: Configurar la Captura de Datos

### 2.1 Preparar Make para Recibir Datos
1. En Make, haz clic en **"Run once"** (botón abajo a la izquierda)
2. Verás el mensaje: *"Waiting for webhook data..."*
3. **¡NO CIERRES ESTA VENTANA!** Make está esperando datos

### 2.2 Enviar Datos de Prueba
Abre una nueva terminal y ejecuta:

```bash
# Opción 1: Envío único de prueba
npm run test:make

# Opción 2: Envío múltiple (5 mensajes)
npm run test:make:multiple 5

# Opción 3: Simular conversación completa
npm run test:make:conversation
```

**Alternativa manual:**
```bash
node test-make.js single
```

### 2.3 Verificar Captura en Make
1. Después de ejecutar el comando, regresa a Make
2. Deberías ver: **"Successfully determined"** 
3. Haz clic en **"OK"**
4. Make habrá capturado automáticamente la estructura de datos

## 📊 Paso 3: Verificar Campos Capturados

Después de la captura exitosa, verás estos campos disponibles en Make:

### Campos Principales:
- **`trackingId`** - ID único para seguimiento
- **`userId`** - Número de teléfono del usuario  
- **`userName`** - Nombre del usuario en WhatsApp
- **`message`** - Mensaje original del usuario
- **`response`** - Respuesta generada por la IA
- **`timestamp`** - Fecha y hora de la conversación

### Campos Adicionales:
- **`messageType`** - Tipo de mensaje (text, image, etc.)
- **`platform`** - Plataforma (whatsapp)
- **`botVersion`** - Versión del bot
- **`environment`** - Entorno (development/production)
- **`processingTime`** - Tiempo de procesamiento en ms
- **`aiModel`** - Modelo de IA utilizado
- **`conversationId`** - ID de la conversación
- **`userLanguage`** - Idioma del usuario
- **`messageLength`** - Longitud del mensaje
- **`responseLength`** - Longitud de la respuesta

## 🔧 Paso 4: Configurar Acciones en Make

### 4.1 Agregar Módulos de Acción
Haz clic en **"+"** después del webhook para agregar acciones:

#### Opción A: Enviar Email
1. Selecciona **"Email"** 
2. Selecciona **"Send an Email"**
3. Configura:
   - **To:** tu-email@ejemplo.com
   - **Subject:** `Nuevo mensaje de {{userName}} ({{userId}})`
   - **Content:** 
   ```
   Usuario: {{userName}}
   Teléfono: {{userId}}
   Mensaje: {{message}}
   Respuesta del Bot: {{response}}
   Fecha: {{timestamp}}
   Tracking ID: {{trackingId}}
   ```

#### Opción B: Google Sheets
1. Selecciona **"Google Sheets"**
2. Selecciona **"Add a row"**
3. Conecta tu cuenta de Google
4. Selecciona tu hoja de cálculo
5. Mapea los campos:
   - Columna A: `{{timestamp}}`
   - Columna B: `{{userId}}`
   - Columna C: `{{userName}}`
   - Columna D: `{{message}}`
   - Columna E: `{{response}}`
   - Columna F: `{{trackingId}}`

#### Opción C: Slack
1. Selecciona **"Slack"**
2. Selecciona **"Create a Message"**
3. Conecta tu workspace de Slack
4. Configura:
   - **Channel:** #chatbot-logs
   - **Message:**
   ```
   🤖 *Nuevo mensaje del chatbot*
   
   👤 *Usuario:* {{userName}} ({{userId}})
   💬 *Mensaje:* {{message}}
   🤖 *Respuesta:* {{response}}
   🕒 *Fecha:* {{timestamp}}
   🔍 *Tracking:* {{trackingId}}
   ```

#### Opción D: Base de Datos (Airtable)
1. Selecciona **"Airtable"**
2. Selecciona **"Create a record"**
3. Conecta tu cuenta de Airtable
4. Mapea los campos según tu tabla

### 4.2 Configurar Filtros (Opcional)
Para procesar solo ciertos tipos de mensajes:

1. Haz clic en **"🔧"** entre el webhook y la acción
2. Agrega condición:
   - `{{messageType}}` equals `text`
   - O `{{environment}}` equals `production`

## ⚙️ Paso 5: Configurar Escenario

### 5.1 Configuración de Ejecución
1. Haz clic en **"Scheduling"** (reloj)
2. Selecciona **"Immediately"** para tiempo real
3. O configura intervalos según tus necesidades

### 5.2 Configuración de Errores
1. Haz clic en **"..."** → **"Scenario settings"**
2. En **"Error handling":**
   - **Allow storing incomplete executions:** ON
   - **Number of consecutive errors:** 10
   - **Interval between errors:** 2 minutes

### 5.3 Activar Escenario
1. Haz clic en **"Turn ON"** (toggle superior derecho)
2. El escenario debe mostrar estado "ON" en verde
3. Verifica que diga **"Real-time"** si configuraste ejecución inmediata

## 🧪 Paso 6: Probar la Integración Completa

### 6.1 Prueba Automática
```bash
# Enviar datos de prueba
npm run test:make

# Verificar que Make procese los datos
# Revisa los logs de ejecución en Make
```

### 6.2 Prueba con WhatsApp Real
1. Envía un mensaje a tu número de WhatsApp Business
2. El bot debe responder automáticamente
3. Verifica en Make que se ejecutó el escenario
4. Comprueba que se ejecutaron todas las acciones configuradas

### 6.3 Monitorear Ejecuciones
1. En Make, ve a **"History"**
2. Deberías ver las ejecuciones exitosas
3. Revisa los datos procesados en cada ejecución

## 📊 Paso 7: Dashboard y Monitoreo

### 7.1 Crear Dashboard (Opcional)
Con los datos en Google Sheets o Airtable:

1. **Google Data Studio:**
   - Conecta tu Google Sheets
   - Crea gráficos de mensajes por día/hora
   - Análisis de usuarios más activos

2. **Airtable Views:**
   - Vista de conversaciones por usuario
   - Vista de mensajes por día
   - Vista de respuestas más largas

### 7.2 Alertas Inteligentes
Configura alertas adicionales:

```javascript
// En Make, usar filtro avanzado
{{length(message)}} > 200  // Mensajes muy largos
{{contains(message; "urgente")}}  // Mensajes urgentes
{{matches(userId; "pattern")}}  // Números específicos
```

## 🔍 Paso 8: Troubleshooting

### Error: "Webhook not responding"
**Solución:**
```bash
# Verificar que el servidor esté corriendo
npm start

# Probar webhook manualmente
curl -X POST https://hook.us2.make.com/TU_WEBHOOK_ID \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

### Error: "Data structure not recognized"
**Solución:**
1. Ir a Make → Webhook → **"Redetermine data structure"**
2. Ejecutar: `npm run test:make`
3. Confirmar nueva estructura

### Error: "Scenario execution failed"
**Solución:**
1. Revisar logs en Make → **"History"**
2. Verificar conexiones de servicios (Google, Slack, etc.)
3. Comprobar permisos de APIs

## 📈 Casos de Uso Avanzados

### 1. CRM Integration
```javascript
// En Make, después del webhook
- Buscar cliente en CRM por userId
- Si no existe → crear nuevo contacto
- Actualizar último contacto
- Agregar nota de conversación
```

### 2. Soporte Tickets
```javascript
// Detectar palabras clave de soporte
- Si contiene("problema", "error", "ayuda")
- Crear ticket en sistema de soporte
- Asignar a agente disponible
- Enviar número de ticket por WhatsApp
```

### 3. E-commerce
```javascript
// Detectar intenciones de compra
- Si contiene("precio", "comprar", "producto")
- Buscar producto en catálogo
- Enviar información detallada
- Registrar lead en sistema de ventas
```

### 4. Analytics Avanzado
```javascript
// Análisis de sentimientos
- Enviar mensaje a API de análisis
- Clasificar: positivo/neutral/negativo
- Guardar en base de datos con score
- Alertar si sentimiento muy negativo
```

## 🎯 Métricas Sugeridas para Monitorear

### Métricas Operacionales:
- Mensajes procesados por hora/día
- Tiempo de respuesta promedio
- Tasa de errores de integración
- Disponibilidad del webhook

### Métricas de Negocio:
- Usuarios únicos por día
- Conversaciones completadas
- Temas más consultados
- Satisfacción del usuario (si implementas feedback)

## 🔒 Mejores Prácticas de Seguridad

1. **Webhook Security:**
   - Usar HTTPS siempre
   - Validar origen de datos
   - Implementar rate limiting

2. **Data Privacy:**
   - No almacenar información sensible
   - Cumplir con GDPR/LOPD
   - Logs con datos anonimizados

3. **Monitoring:**
   - Alertas por fallos
   - Logs de todas las operaciones
   - Backup de configuraciones

## ✅ Checklist Final

- [ ] Webhook configurado en Make
- [ ] Datos de prueba enviados y capturados
- [ ] Estructura de datos confirmada
- [ ] Acciones configuradas (email/sheets/slack)
- [ ] Escenario activado
- [ ] Prueba con mensaje real de WhatsApp
- [ ] Logs de ejecución verificados
- [ ] Monitoreo configurado
- [ ] Alertas configuradas
- [ ] Documentación actualizada

## 🆘 Soporte y Recursos

### Documentación Oficial:
- **Make Academy:** https://www.make.com/en/academy
- **Make API Docs:** https://www.make.com/en/api-documentation
- **Make Community:** https://community.make.com/

### Scripts de Prueba:
```bash
# Ver ayuda completa
node test-make.js help

# Probar diferentes escenarios
npm run test:make:conversation
```

---

**¡Felicidades! 🎉** 

Tu integración con Make está completamente configurada. Ahora todas las conversaciones de tu chatbot se procesarán automáticamente según las acciones que configuraste.

**Próximo paso:** Envía un mensaje de WhatsApp real y verifica que todo funcione end-to-end.