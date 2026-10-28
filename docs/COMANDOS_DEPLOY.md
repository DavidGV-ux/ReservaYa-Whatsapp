# 🚀 Comandos para Deploy y Recuperación

## 📋 Pre-Deploy: Verificar Configuración

```bash
cd /Users/davidgalvis/Documents/FYN/FYN
node verificar-env.js
```

## 🚀 Deploy a AWS Lambda

### Deploy a stage dev (recomendado para pruebas)
```bash
cd /Users/davidgalvis/Documents/FYN/FYN
serverless deploy --stage dev
```

### Deploy a stage específico
```bash
serverless deploy --stage v2
# o
serverless deploy --stage prod
```

## 📊 Verificar Deploy Exitoso

### Ver información del deploy
```bash
serverless info --stage dev
```

### Ver logs en tiempo real
```bash
serverless logs -f api --tail --stage dev
```

### Ver URL del endpoint
```bash
serverless info --stage dev | grep -i "endpoint\|url"
```

## 🔄 Recuperar Deploy Anterior

### Opción 1: Rollback usando versiones de Lambda (si tienes versiones)
```bash
# Listar versiones de la función
aws lambda list-versions-by-function \
  --function-name whatsapp-chatbot-dev-api \
  --region us-east-1

# Publicar versión anterior como $LATEST
aws lambda update-function-configuration \
  --function-name whatsapp-chatbot-dev-api \
  --region us-east-1 \
  --version <VERSION_ANTERIOR>
```

### Opción 2: Redeploy desde Git (si tienes el commit anterior)
```bash
# Ver commits anteriores
git log --oneline

# Volver al commit anterior
git checkout <COMMIT_HASH>

# Redeploy
serverless deploy --stage dev

# Volver a la rama actual
git checkout main  # o master
```

### Opción 3: Restaurar desde backup de variables de entorno
```bash
# Si guardaste las variables, actualízalas manualmente en AWS Console
# O usa AWS CLI:
aws lambda update-function-configuration \
  --function-name whatsapp-chatbot-dev-api \
  --region us-east-1 \
  --environment "Variables={NODE_ENV=production,GROQ_MODEL=groq/compound,...}"
```

### Opción 4: Eliminar y redeploy (último recurso)
```bash
# ⚠️ CUIDADO: Esto elimina todo
serverless remove --stage dev

# Luego redeploy
serverless deploy --stage dev
```

## 🧪 Probar el Deploy

### Health Check
```bash
# Obtener URL del deploy
ENDPOINT=$(serverless info --stage dev | grep -oP 'https://[^ ]+')

# Probar health check
curl $ENDPOINT/health
```

### Probar webhook de WhatsApp
```bash
# Verificar webhook (GET)
curl "$ENDPOINT/webhook?hub.mode=subscribe&hub.verify_token=fy&hub.challenge=test"
```

## 📝 Ver Estado Actual

### Listar todas las funciones Lambda
```bash
aws lambda list-functions \
  --region us-east-1 \
  --query 'Functions[?contains(FunctionName, `whatsapp-chatbot`)].FunctionName' \
  --output table
```

### Ver configuración de una función
```bash
aws lambda get-function-configuration \
  --function-name whatsapp-chatbot-dev-api \
  --region us-east-1
```

## ⚠️ Comandos de Emergencia

### Detener todas las funciones (deshabilitar triggers)
```bash
# Deshabilitar eventos programados
aws events disable-rule --name whatsapp-chatbot-dev-dailyTips --region us-east-1
aws events disable-rule --name whatsapp-chatbot-dev-monthlyFeedback --region us-east-1
```

### Ver errores recientes
```bash
serverless logs -f api --tail --stage dev | grep -i error
```

## ✅ Checklist Pre-Deploy

```bash
# 1. Verificar .env
node verificar-env.js

# 2. Verificar que AWS CLI está configurado
aws sts get-caller-identity

# 3. Verificar región
aws configure get region

# 4. Deploy
serverless deploy --stage dev

# 5. Verificar
serverless info --stage dev
```

