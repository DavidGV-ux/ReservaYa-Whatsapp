# 💰 Optimización de Costos - Feedback Mensual

## 🎯 Objetivo
Mantener el feedback mensual funcionando en el plan **gratuito de AWS Lambda** sin aumentar significativamente los costos.

## ✅ Optimizaciones Implementadas

### 1. **Análisis de Gastos sin IA** (Ahorro Principal)
- **Antes**: Usaba OpenAI para analizar cada conversación (costoso)
- **Ahora**: Análisis basado en palabras clave y patrones regex (gratis)
- **Ahorro**: ~$0.01-0.05 por usuario (dependiendo de conversaciones)

### 2. **IA Solo Cuando es Necesario**
- **Antes**: Siempre usaba IA para generar mensajes
- **Ahora**: Solo usa IA si hay gastos variables significativos (>$100)
- **Ahorro**: ~70% de llamadas a OpenAI eliminadas

### 3. **Tokens Reducidos**
- **Antes**: 800 tokens por mensaje
- **Ahora**: 400 tokens máximo
- **Ahorro**: 50% menos tokens = 50% menos costo

### 4. **Memoria Optimizada**
- **Antes**: 1024 MB (default)
- **Ahora**: 512 MB para funciones programadas
- **Ahorro**: 50% menos costo de memoria

### 5. **Delay Reducido**
- **Antes**: 3 segundos entre mensajes
- **Ahora**: 2 segundos entre mensajes
- **Ahorro**: Menos tiempo de ejecución = menos costo

## 📊 Estimación de Costos

### Plan Gratuito de AWS Lambda
- **1M de requests gratuitos/mes**
- **400,000 GB-segundos de cómputo gratis/mes**

### Cálculo para 100 usuarios:
- **Ejecuciones**: 1 vez al mes = 1 ejecución
- **Tiempo**: ~200 segundos (100 usuarios × 2s delay)
- **Memoria**: 512 MB
- **GB-segundos**: 0.512 GB × 200s = 102.4 GB-segundos
- **Costo**: **GRATIS** (dentro del límite gratuito)

### Costos de OpenAI (si se usa IA):
- **Con optimización**: ~30 usuarios usan IA (70% no la necesitan)
- **Tokens por usuario**: ~400 tokens
- **Costo**: ~$0.0001 por usuario con IA
- **Total mensual**: ~$0.003 (3 centavos) para 100 usuarios

## 🚀 Configuración

### Cron Schedule
```yaml
# Ejecuta el día 1 de cada mes a las 5 AM (horario Colombia)
rate: cron(0 10 1 * ? *)
```

### Para Cambiar la Hora:
- Formato: `cron(minuto hora día mes ? año)`
- Ejemplo: `cron(0 14 1 * ? *)` = Día 1, 9 AM Colombia (14:00 UTC)

## 📝 Despliegue

```bash
# Desplegar solo la función de feedback
serverless deploy function -f monthlyFeedback

# O desplegar todo
serverless deploy
```

## 🔍 Monitoreo

### Ver Logs:
```bash
serverless logs -f monthlyFeedback --tail
```

### Ver Estadísticas:
```bash
curl https://tu-api.com/feedback-stats
```

## ⚠️ Recomendaciones para Mantener Costos Bajos

1. **No ejecutar manualmente** a menos que sea necesario
2. **Monitorear uso de OpenAI** - Si aumenta, ajustar el umbral de $100
3. **Revisar logs mensualmente** para detectar usuarios con muchas conversaciones
4. **Considerar procesar en lotes** si tienes más de 500 usuarios

## 🎛️ Ajustes de Optimización

### Si quieres usar más IA:
Edita `Services/monthlyFeedbackService.js`:
```javascript
// Cambiar umbral para usar IA
if (financialData.variableExpenses < 50) { // Era 100
```

### Si quieres menos delay:
```javascript
// En sendMonthlyFeedbackToAll()
await new Promise(resolve => setTimeout(resolve, 1000)); // Era 2000
```

### Si necesitas más memoria:
```yaml
# En serverless.yml
memorySize: 768  # Era 512
```

## 📈 Escalabilidad

### Para 1,000 usuarios:
- **GB-segundos**: ~1,024 GB-segundos
- **Costo Lambda**: **GRATIS** (dentro del límite)
- **Costo OpenAI**: ~$0.03/mes (si 30% usa IA)

### Para 10,000 usuarios:
- **GB-segundos**: ~10,240 GB-segundos
- **Costo Lambda**: ~$0.15/mes (fuera del límite gratuito)
- **Costo OpenAI**: ~$0.30/mes

## ✅ Checklist de Optimización

- [x] Análisis sin IA implementado
- [x] IA solo cuando es necesario
- [x] Tokens reducidos a 400
- [x] Memoria reducida a 512 MB
- [x] Delay optimizado a 2s
- [x] Cron configurado mensualmente
- [x] Fallback sin IA implementado

