# 🚀 Guía de Despliegue de Versión 2 (Sin Sobrescribir)

Esta guía te muestra cómo desplegar la nueva versión del chatbot **sin eliminar o sobrescribir** la versión anterior que ya está en producción.

## 📋 Opciones para Desplegar Sin Sobrescribir

### Opción 1: Usar un Stage Diferente (Recomendado) ⭐

Serverless Framework permite usar **stages** para tener múltiples versiones desplegadas simultáneamente.

#### Desplegar Nueva Versión con Stage `v2`:

```bash
# Desplegar con stage v2
serverless deploy --stage v2
```

**Resultado:**
- ✅ Versión anterior: `whatsapp-chatbot-dev-api` (sigue funcionando)
- ✅ Nueva versión: `whatsapp-chatbot-v2-api` (nueva versión)

#### Desplegar con Stage Personalizado:

```bash
# Usar cualquier nombre de stage
serverless deploy --stage coach
serverless deploy --stage new
serverless deploy --stage production-v2
```

### Opción 2: Cambiar el Nombre del Servicio

Si prefieres cambiar el nombre del servicio completamente:

```yaml
# En serverless.yml, cambiar:
service: whatsapp-chatbot-v2
```

Luego desplegar normalmente:
```bash
serverless deploy
```

## 🎯 Pasos Recomendados para Desplegar V2

### 1. Verificar Configuración Actual

```bash
# Ver qué stages tienes desplegados
serverless info --stage dev
```

### 2. Desplegar Nueva Versión con Stage `v2`

```bash
# Desplegar con stage v2
serverless deploy --stage v2
```

### 3. Verificar Despliegue

```bash
# Ver información de la nueva versión
serverless info --stage v2

# Ver logs
serverless logs -f api --stage v2 --tail
```

### 4. Obtener URL del Webhook

Después del despliegue, obtendrás una URL diferente:

```
# Versión anterior (dev)
https://xxxxx.execute-api.us-east-1.amazonaws.com/dev/webhook

# Nueva versión (v2)
https://xxxxx.execute-api.us-east-1.amazonaws.com/v2/webhook
```

### 5. Actualizar Webhook de WhatsApp (Opcional)

Si quieres usar la nueva versión en producción:

1. **Obtener la nueva URL** del despliegue
2. **Ir a Meta Developers** → WhatsApp → Configuración
3. **Actualizar Webhook URL** con la nueva URL
4. **Verificar** que funciona correctamente

**O mantener ambas versiones** para testing antes de cambiar.

## 📊 Estructura de Funciones Lambda

Con stages, las funciones se nombran así:

```
# Versión anterior (dev)
whatsapp-chatbot-dev-api
whatsapp-chatbot-dev-dailyTips
whatsapp-chatbot-dev-monthlyFeedback

# Nueva versión (v2)
whatsapp-chatbot-v2-api
whatsapp-chatbot-v2-dailyTips
whatsapp-chatbot-v2-monthlyFeedback
whatsapp-chatbot-v2-remindersMorning
whatsapp-chatbot-v2-remindersLunch
whatsapp-chatbot-v2-remindersShopping
whatsapp-chatbot-v2-remindersDinner
whatsapp-chatbot-v2-remindersReview
```

## 🔧 Comandos Útiles

### Ver Todas las Versiones Desplegadas

```bash
# Listar funciones Lambda en AWS
aws lambda list-functions --query 'Functions[?contains(FunctionName, `whatsapp-chatbot`)].FunctionName'
```

### Ver Información de un Stage Específico

```bash
# Versión anterior
serverless info --stage dev

# Nueva versión
serverless info --stage v2
```

### Ver Logs de una Versión

```bash
# Logs de la versión anterior
serverless logs -f api --stage dev --tail

# Logs de la nueva versión
serverless logs -f api --stage v2 --tail
```

### Eliminar una Versión Específica

```bash
# Eliminar solo la versión v2 (mantener dev)
serverless remove --stage v2

# Eliminar la versión dev (mantener v2)
serverless remove --stage dev
```

## 💰 Costos

**Importante**: Cada stage crea funciones Lambda separadas, por lo que:

- ✅ **Plan gratuito de AWS Lambda**: 1M requests/mes y 400K GB-segundos
- ⚠️ **Si tienes 2 stages**: Se comparten el mismo límite gratuito
- 💡 **Recomendación**: Elimina el stage anterior cuando confirmes que v2 funciona

## 🎯 Flujo Recomendado

1. **Desplegar v2** con stage separado
2. **Probar v2** con webhook de prueba
3. **Verificar** que todo funciona correctamente
4. **Cambiar webhook de producción** a v2 (opcional)
5. **Eliminar stage anterior** cuando estés seguro (opcional)

## 📝 Ejemplo Completo

```bash
# 1. Desplegar nueva versión
serverless deploy --stage v2

# 2. Verificar que se desplegó correctamente
serverless info --stage v2

# 3. Probar la nueva versión
curl https://xxxxx.execute-api.us-east-1.amazonaws.com/v2/health

# 4. Ver logs en tiempo real
serverless logs -f api --stage v2 --tail

# 5. Cuando estés listo, actualizar webhook de WhatsApp
# (O mantener ambas versiones para testing)
```

## ⚠️ Notas Importantes

1. **Variables de Entorno**: Se comparten entre stages si usas el mismo `.env`
2. **Base de Datos**: Ambas versiones usan la misma base de datos (Supabase)
3. **WhatsApp Webhook**: Solo puedes tener una URL activa a la vez
4. **Cron Jobs**: Cada stage tiene sus propios cron jobs (recordatorios)

## 🔄 Migración Gradual

Si quieres migrar gradualmente:

1. **Mantener dev activa** en producción
2. **Desplegar v2** para testing
3. **Probar v2** con un número de prueba
4. **Cambiar webhook** cuando estés seguro
5. **Eliminar dev** después de confirmar

## ✅ Checklist de Despliegue

- [ ] Verificar que `.env` tiene todas las variables necesarias
- [ ] Ejecutar `serverless deploy --stage v2`
- [ ] Verificar que el despliegue fue exitoso
- [ ] Obtener la nueva URL del webhook
- [ ] Probar el endpoint `/health` de la nueva versión
- [ ] (Opcional) Actualizar webhook de WhatsApp
- [ ] (Opcional) Eliminar stage anterior cuando estés seguro

