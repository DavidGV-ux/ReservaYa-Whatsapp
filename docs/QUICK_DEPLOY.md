# ⚡ Despliegue Rápido - Versión 2

## 🚀 Comando Rápido

Para desplegar la nueva versión **sin sobrescribir** la anterior:

```bash
npm run deploy:v2
```

O directamente:

```bash
serverless deploy --stage v2
```

## 📋 Pasos Completos

### 1. Verificar Variables de Entorno

Asegúrate de que tu `.env` tiene todas las variables:

```bash
# Verificar que existe
cat .env
```

### 2. Desplegar Nueva Versión

```bash
# Opción 1: Usar script npm
npm run deploy:v2

# Opción 2: Comando directo
serverless deploy --stage v2
```

### 3. Verificar Despliegue

```bash
# Ver información de la nueva versión
npm run info:v2

# O directamente
serverless info --stage v2
```

### 4. Ver Logs (Opcional)

```bash
# Ver logs en tiempo real
npm run logs:v2
```

## 🎯 Resultado

Después del despliegue tendrás:

- ✅ **Versión anterior**: `whatsapp-chatbot-dev-*` (sigue funcionando)
- ✅ **Nueva versión**: `whatsapp-chatbot-v2-*` (nueva versión con coach y recordatorios)

## 📱 Actualizar Webhook de WhatsApp

1. **Obtener la nueva URL** del output del despliegue:
   ```
   https://xxxxx.execute-api.us-east-1.amazonaws.com/v2/webhook
   ```

2. **Ir a Meta Developers** → WhatsApp → Configuración

3. **Actualizar Webhook URL** con la nueva URL

4. **Verificar** que el webhook funciona

## 🔄 Scripts Disponibles

```bash
# Despliegues
npm run deploy:dev      # Desplegar stage dev
npm run deploy:v2      # Desplegar stage v2 (nueva versión)
npm run deploy:prod    # Desplegar stage prod

# Información
npm run info:dev       # Ver info de dev
npm run info:v2        # Ver info de v2

# Logs
npm run logs:dev       # Logs de dev
npm run logs:v2        # Logs de v2

# Eliminar
npm run remove:dev     # Eliminar dev
npm run remove:v2      # Eliminar v2
```

## ⚠️ Importante

- Ambas versiones comparten la misma base de datos (Supabase)
- Solo puedes tener **una URL de webhook activa** en WhatsApp
- Los cron jobs (recordatorios) funcionan independientemente en cada stage

## ✅ Checklist

- [ ] Variables de entorno configuradas en `.env`
- [ ] Ejecutar `npm run deploy:v2`
- [ ] Verificar despliegue exitoso
- [ ] Obtener nueva URL del webhook
- [ ] (Opcional) Actualizar webhook de WhatsApp
- [ ] (Opcional) Probar la nueva versión

