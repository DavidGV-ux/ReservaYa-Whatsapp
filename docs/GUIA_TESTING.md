# 🧪 Guía de Testing - Tips Diarios y Feedback Mensual

## 🌐 Tu URL de API
**Base URL:** `https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/`

---

## 📋 Endpoints Disponibles

### Tips Diarios

#### 1. Enviar tip a un usuario específico
```
POST /send-tip/:phone
```

**Desde el navegador (usando herramienta online):**
1. Ve a: https://reqbin.com/ o https://httpie.io/app
2. Método: `POST`
3. URL: `https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/send-tip/521234567890`
4. Click en "Send"

**O usando cURL:**
```bash
curl -X POST https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/send-tip/521234567890
```

**Respuesta:**
```json
{
  "success": true,
  "tipIndex": 5
}
```

#### 2. Enviar tips a todos los usuarios
```
POST /send-tips
```

**Desde herramienta online (reqbin.com):**
1. Método: `POST`
2. URL: `https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/send-tips`
3. Click en "Send"

**O usando cURL:**
```bash
curl -X POST https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/send-tips
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Tips enviados",
  "result": {
    "total": 50,
    "sent": 48,
    "failed": 2
  }
}
```

#### 3. Ver estadísticas de tips
```
GET /tips-stats
```

**Desde el navegador (directo):**
Abre en tu navegador:
```
https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/tips-stats
```

**O usando cURL:**
```bash
curl https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/tips-stats
```

---

### Feedback Mensual

#### 1. Enviar feedback a un usuario específico
```
POST /send-feedback/:phone
```

**Desde herramienta online (reqbin.com):**
1. Método: `POST`
2. URL: `https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/send-feedback/521234567890`
3. Click en "Send"

**O usando cURL:**
```bash
curl -X POST https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/send-feedback/521234567890
```

**Respuesta:**
```json
{
  "success": true,
  "financialData": {
    "income": 15000,
    "fixedExpenses": 8000,
    "variableExpenses": 2500,
    "totalExpenses": 10500,
    "savings": 4500,
    "savingsPercentage": 30
  }
}
```

#### 2. Enviar feedback a todos los usuarios
```
POST /send-monthly-feedback
```

**Desde herramienta online (reqbin.com):**
1. Método: `POST`
2. URL: `https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/send-monthly-feedback`
3. Click en "Send"

**O usando cURL:**
```bash
curl -X POST https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/send-monthly-feedback
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Feedback mensual enviado",
  "result": {
    "total": 50,
    "sent": 45,
    "failed": 5
  }
}
```

#### 3. Ver estadísticas de feedback
```
GET /feedback-stats
```

**Desde el navegador (directo):**
Abre en tu navegador:
```
https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/feedback-stats
```

**O usando cURL:**
```bash
curl https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/feedback-stats
```

---

## 🧪 Testing Local (Antes de Deploy)

### Opción 1: Usando Node.js directamente

Crea un archivo `test-services.js`:

```javascript
require('dotenv').config();
const dailyTipsService = require('./Services/dailyTipsService');
const monthlyFeedbackService = require('./Services/monthlyFeedbackService');
const supabaseService = require('./Services/supabaseService');

async function testDailyTip() {
  console.log('🧪 Testing Daily Tip...');
  
  const phone = '521234567890'; // Tu número de prueba
  const result = await dailyTipsService.sendDailyTip(phone);
  
  console.log('Resultado:', result);
}

async function testMonthlyFeedback() {
  console.log('🧪 Testing Monthly Feedback...');
  
  const phone = '521234567890'; // Tu número de prueba
  const userProfile = await supabaseService.getUserProfile(phone);
  
  if (!userProfile) {
    console.error('❌ Usuario no encontrado');
    return;
  }
  
  const result = await monthlyFeedbackService.sendMonthlyFeedback(phone, userProfile);
  console.log('Resultado:', result);
}

// Ejecutar tests
async function runTests() {
  try {
    await testDailyTip();
    console.log('\n---\n');
    await testMonthlyFeedback();
  } catch (error) {
    console.error('❌ Error en tests:', error);
  }
}

runTests();
```

**Ejecutar:**
```bash
node test-services.js
```

---

## 🚀 Testing en Producción (Lambda) - SIN CURL

### Opción 1: Usando el Navegador (Solo GET - Estadísticas)

**Ver estadísticas de tips:**
```
https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/tips-stats
```

**Ver estadísticas de feedback:**
```
https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/feedback-stats
```

**Verificar estado de usuario:**
```
https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/debug/study?phone=521234567890
```

**Health check:**
```
https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/health
```

### Opción 2: Usando ReqBin (Recomendado para POST)

1. **Ve a:** https://reqbin.com/
2. **Configura:**
   - Método: `POST`
   - URL: `https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/send-tip/521234567890`
   - Click en **"Send"**

**Endpoints POST disponibles:**
- `POST /send-tip/521234567890` - Enviar tip a usuario
- `POST /send-tips` - Enviar tips a todos
- `POST /send-feedback/521234567890` - Enviar feedback a usuario
- `POST /send-monthly-feedback` - Enviar feedback a todos

### Opción 3: Usando HTTPie Online

1. **Ve a:** https://httpie.io/app
2. **Escribe el comando:**
   ```
   POST https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/send-tip/521234567890
   ```
3. **Click en "Send"**

### Opción 4: Usando Postman

1. **Crear Request:**
   - Método: `POST`
   - URL: `https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/send-tip/521234567890`
   - Headers: (ninguno necesario)

2. **Enviar Request**

3. **Ver Response**

---

## 📱 Testing desde WhatsApp

### Para Tips Diarios:
1. Asegúrate de que el usuario tenga perfil completo
2. Llama al endpoint: `POST /send-tip/:phone`
3. El usuario recibirá el tip inmediatamente

### Para Feedback Mensual:
1. El usuario debe tener:
   - ✅ Nombre completo
   - ✅ Ingreso mensual
   - ✅ Moneda
   - ✅ Gastos fijos
   - ✅ País
   - ✅ Al menos algunas conversaciones del mes pasado

2. Llama al endpoint: `POST /send-feedback/:phone`
3. El usuario recibirá el feedback inmediatamente

---

## 🔍 Verificar Estado del Usuario

Antes de testear, verifica que el usuario tenga todos los datos:

```bash
GET /debug/study?phone=521234567890
```

**Respuesta:**
```json
{
  "phone": "521234567890",
  "hasProfile": true,
  "needsStudy": false,
  "profile": {
    "user_name": "David Galvis",
    "monthly_salary": 15000,
    "currency": "MXN",
    "fixed_expenses": 8000,
    "country": "México",
    "language": "es"
  }
}
```

---

## ⚠️ Requisitos para Feedback Mensual

El usuario debe tener:
- ✅ Estudio completo (nombre, ingreso, moneda, gastos fijos, país)
- ✅ Conversaciones del mes pasado (para analizar gastos)

Si falta algo, el feedback no se enviará o será incompleto.

---

## 🐛 Debugging

### Ver Logs en Tiempo Real
```bash
serverless logs -f api --tail
```

### Filtrar por Error
```bash
serverless logs -f api --tail | grep ERROR
```

### Ver Logs de una Función Específica
```bash
# Tips diarios
serverless logs -f dailyTips --tail

# Feedback mensual
serverless logs -f monthlyFeedback --tail
```

---

## 📊 Ejemplos de Uso

### Test Completo de Tips (SIN CURL)

**1. Verificar usuario (desde navegador):**
```
https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/debug/study?phone=521234567890
```

**2. Enviar tip (desde ReqBin):**
- Ve a: https://reqbin.com/
- POST: `https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/send-tip/521234567890`

**3. Ver estadísticas (desde navegador):**
```
https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/tips-stats
```

### Test Completo de Feedback (SIN CURL)

**1. Verificar usuario (desde navegador):**
```
https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/debug/study?phone=521234567890
```

**2. Enviar feedback (desde ReqBin):**
- Ve a: https://reqbin.com/
- POST: `https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/send-feedback/521234567890`

**3. Ver estadísticas (desde navegador):**
```
https://b9o2tgxy3c.execute-api.us-east-1.amazonaws.com/feedback-stats
```

---

## 🎯 Casos de Prueba Recomendados

### Tips Diarios:
- [ ] Usuario con perfil completo
- [ ] Usuario sin perfil (debe fallar gracefully)
- [ ] Envío masivo a todos los usuarios
- [ ] Verificar que no se dupliquen mensajes

### Feedback Mensual:
- [ ] Usuario con estudio completo y conversaciones
- [ ] Usuario sin conversaciones (debe funcionar con datos básicos)
- [ ] Usuario con ahorros positivos
- [ ] Usuario con gastos mayores a ingresos
- [ ] Envío masivo a todos los usuarios

---

## 💡 Tips de Testing

1. **Usa un número de prueba** que puedas monitorear
2. **Verifica los logs** después de cada test
3. **Prueba casos límite** (usuarios sin datos, números inválidos, etc.)
4. **Monitorea los costos** de OpenAI durante las pruebas
5. **Verifica que no se dupliquen** mensajes

