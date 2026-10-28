# 🚀 Guía para Configurar Variables de Entorno en AWS Lambda

Esta guía te explica cómo configurar las variables de entorno para desplegar tu chatbot en AWS Lambda.

## 📋 Opción 1: Usar archivo .env (Recomendado para desarrollo)

El archivo `serverless.yml` está configurado para leer automáticamente las variables del archivo `.env` cuando haces deploy.

### Pasos:

1. **Edita el archivo `.env`** con tus credenciales reales:
   ```bash
   # Reemplaza todos los valores que dicen "REEMPLAZA_CON_TU_..."
   ```

2. **Verifica que el archivo `.env` esté en la raíz del proyecto** (carpeta `FYN/`)

3. **Haz el deploy**:
   ```bash
   cd FYN
   npm install
   serverless deploy --stage dev
   ```

   El Serverless Framework leerá automáticamente las variables del `.env` y las configurará en Lambda.

## 📋 Opción 2: Configurar manualmente en AWS Console

Si prefieres configurar las variables directamente en AWS:

### Pasos:

1. **Ve a AWS Console** → Lambda → Tu función

2. **Configuración** → **Variables de entorno** → **Editar**

3. **Agrega cada variable**:

   ```
   NODE_ENV = production
   WHATSAPP_API_URL = https://graph.facebook.com/v18.0
   WHATSAPP_PHONE_ID = tu_phone_id
   WHATSAPP_TOKEN = tu_token
   WHATSAPP_VERIFY_TOKEN = tu_verify_token
   GROQ_API_KEY = tu_groq_key
   GROQ_MODEL = llama-3.3-70b-versatile
   SUPABASE_URL = tu_supabase_url
   SUPABASE_KEY = tu_supabase_key
   MAKE_WEBHOOK_URL = tu_make_webhook_url
   REDIS_ENABLED = false
   ```

4. **Guarda los cambios**

## 📋 Opción 3: Usar AWS Systems Manager Parameter Store (Más seguro)

Para mayor seguridad, puedes guardar las variables sensibles en AWS Systems Manager:

### Pasos:

1. **Instala AWS CLI** (si no lo tienes):
   ```bash
   # macOS
   brew install awscli
   
   # Configura tus credenciales
   aws configure
   ```

2. **Guarda cada variable secreta**:
   ```bash
   # Ejemplo para WhatsApp Token
   aws ssm put-parameter \
     --name "/whatsapp-chatbot/WHATSAPP_TOKEN" \
     --value "tu_token_aqui" \
     --type "SecureString"
   
   # Repite para cada variable sensible:
   # - WHATSAPP_TOKEN
   # - WHATSAPP_VERIFY_TOKEN
   # - GROQ_API_KEY
   # - SUPABASE_KEY
   ```

3. **Modifica `serverless.yml`** para leer de Parameter Store:
   ```yaml
   environment:
     WHATSAPP_TOKEN: ${ssm:/whatsapp-chatbot/WHATSAPP_TOKEN}
     GROQ_API_KEY: ${ssm:/whatsapp-chatbot/GROQ_API_KEY}
     # ... etc
   ```

## 🔍 Verificar Variables Configuradas

### Desde AWS Console:
1. Ve a Lambda → Tu función → Configuración → Variables de entorno
2. Verifica que todas las variables estén presentes

### Desde terminal:
```bash
# Ver variables de la función Lambda
aws lambda get-function-configuration \
  --function-name whatsapp-chatbot-dev-api \
  --query 'Environment.Variables'
```

### Desde código (para debugging):
```bash
# Ver logs de Lambda
serverless logs -f api --tail

# O desde AWS Console
# CloudWatch → Log Groups → /aws/lambda/whatsapp-chatbot-dev-api
```

## 🔐 Variables Críticas que DEBES Configurar

Estas variables son **obligatorias** para que el chatbot funcione:

- ✅ `WHATSAPP_API_URL`
- ✅ `WHATSAPP_PHONE_ID`
- ✅ `WHATSAPP_TOKEN`
- ✅ `WHATSAPP_VERIFY_TOKEN`
- ✅ `GROQ_API_KEY`
- ✅ `SUPABASE_URL`
- ✅ `SUPABASE_KEY`

Las demás son opcionales o tienen valores por defecto.

## 🚨 Solución de Problemas

### Error: "Variable de entorno no encontrada"
**Solución**: Verifica que el nombre de la variable sea exactamente el mismo en `.env` y en `serverless.yml`

### Error: "Token inválido"
**Solución**: 
- Verifica que copiaste el token completo (sin espacios)
- Asegúrate de que el token no haya expirado
- Regenera el token si es necesario

### Error: "No se puede conectar a Supabase"
**Solución**:
- Verifica que `SUPABASE_URL` tenga el formato correcto: `https://xxxxx.supabase.co`
- Verifica que `SUPABASE_KEY` sea la key "anon public" (no la service_role)

## 📝 Notas Importantes

1. **NUNCA subas el archivo `.env` a Git**: Ya está en `.gitignore`
2. **Usa diferentes variables para dev/prod**: Puedes usar `--stage dev` o `--stage prod`
3. **Rota tus tokens periódicamente**: Especialmente los de WhatsApp y Groq
4. **Monitorea el uso**: Revisa los logs de CloudWatch regularmente

## 🔄 Actualizar Variables Existentes

Si necesitas actualizar una variable después del deploy:

### Opción A: Actualizar .env y redeploy
```bash
# Edita .env
nano .env

# Redeploy
serverless deploy --stage dev
```

### Opción B: Actualizar desde AWS Console
1. Lambda → Tu función → Configuración → Variables de entorno
2. Edita la variable
3. Guarda (se aplica inmediatamente, sin redeploy)

### Opción C: Usar AWS CLI
```bash
aws lambda update-function-configuration \
  --function-name whatsapp-chatbot-dev-api \
  --environment "Variables={WHATSAPP_TOKEN=nuevo_token}"
```

## ✅ Checklist Pre-Deploy

Antes de hacer deploy, verifica:

- [ ] Archivo `.env` existe y tiene todas las variables
- [ ] Todos los valores "REEMPLAZA_CON_TU_..." fueron reemplazados
- [ ] Los tokens no han expirado
- [ ] Las URLs están correctas (sin espacios, con https://)
- [ ] El archivo `.env` NO está en Git (verifica `.gitignore`)

---

**¿Necesitas ayuda?** Revisa los logs de CloudWatch o los mensajes de error en la consola de AWS.

