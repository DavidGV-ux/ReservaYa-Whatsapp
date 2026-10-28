# 🔧 Solución al Error 429 (Cuota Excedida)

## 📋 Problema

Estás recibiendo el error:
```
[429 Too Many Requests] You exceeded your current quota, please check your plan and billing details.
```

## 🔍 Posibles Causas

### 1. **Cuota Realmente Excedida**
- Has usado todos los créditos gratuitos de Google Gemini
- Has alcanzado el límite de requests por minuto/hora

### 2. **Nombre del Modelo Incorrecto**
El modelo `gemini-2.0-flash-lite` puede no existir o no estar disponible. Los modelos disponibles son:

**Modelos Estables:**
- `gemini-1.5-flash` (Recomendado - rápido y económico)
- `gemini-1.5-pro` (Más potente, más costoso)
- `gemini-pro` (Versión anterior)

**Modelos Experimentales:**
- `gemini-2.0-flash-exp` (Experimental)

### 3. **API Key Sin Permisos**
- La API key puede no tener acceso al modelo solicitado
- Puede estar restringida a ciertos modelos

## ✅ Soluciones

### Solución 1: Cambiar el Modelo (Recomendado)

Actualiza el modelo a uno que definitivamente existe:

**En `config.js`:**
```javascript
model: process.env.GOOGLE_MODEL || "gemini-1.5-flash",
```

**O en tu archivo `.env`:**
```env
GOOGLE_MODEL=gemini-1.5-flash
```

### Solución 2: Verificar Cuota y Límites

1. Ve a: https://ai.google.dev/usage?tab=rate-limit
2. Verifica tu uso actual
3. Revisa los límites de tu plan

### Solución 3: Obtener Nueva API Key

1. Ve a: https://aistudio.google.com/app/apikey
2. Crea una nueva API key
3. Actualiza `GOOGLE_API_KEY` en tu `.env`

### Solución 4: Usar Plan de Pago

Si necesitas más cuota:
1. Ve a: https://ai.google.dev/pricing
2. Configura un plan de pago
3. Esto aumentará tus límites

## 🛡️ Fallback Implementado

El sistema ahora tiene un **fallback automático** cuando detecta error 429:

- ✅ Usa respuestas predefinidas inteligentes
- ✅ Mantiene la funcionalidad básica
- ✅ No deja al usuario sin respuesta

## 📝 Verificar Modelo Correcto

Para verificar qué modelos están disponibles con tu API key:

```bash
curl "https://generativelanguage.googleapis.com/v1/models?key=TU_API_KEY"
```

O visita: https://ai.google.dev/models

## 🔄 Cambio Rápido

Si quieres cambiar inmediatamente a un modelo que funciona:

1. **Edita `config.js`:**
   ```javascript
   model: process.env.GOOGLE_MODEL || "gemini-1.5-flash",
   ```

2. **O crea/edita `.env`:**
   ```env
   GOOGLE_MODEL=gemini-1.5-flash
   ```

3. **Reinicia el servidor:**
   ```bash
   npm start
   ```

## ⚠️ Nota Importante

El modelo `gemini-2.0-flash-lite` puede no existir aún. Google Gemini 2.0 está en fase experimental y los nombres de modelos pueden variar. 

**Recomendación:** Usa `gemini-1.5-flash` que es:
- ✅ Estable y disponible
- ✅ Rápido
- ✅ Económico
- ✅ Con buena calidad de respuestas

