# 🔐 Guía Completa: Crear y Configurar el archivo .env

## 📋 ¿Qué pasó?

El archivo `.env` no se clona desde Git porque contiene información sensible (tokens, API keys, etc.) y está en `.gitignore` por seguridad. **Esto es correcto y esperado**.

## ✅ Solución: Crear el archivo .env manualmente

### Paso 1: Crear el archivo

En la carpeta `FYN/`, crea un archivo llamado `.env` (sin extensión, solo `.env`)

**Desde terminal:**
```bash
cd /Users/davidgalvis/Documents/FYN/FYN
touch .env
```

O simplemente crea el archivo desde tu editor de texto.

### Paso 2: Copiar este contenido

Copia y pega el siguiente contenido en tu archivo `.env`:

```env
# ============================================
# CONFIGURACIÓN DEL SERVIDOR
# ============================================
NODE_ENV=development
PORT=3000

# ============================================
# WHATSAPP BUSINESS API (Meta)
# ============================================
# Obtén estos valores en: https://developers.facebook.com/
# 1. Ve a Meta Developers > Tu App > WhatsApp > Configuración
# 2. Copia el "Phone number ID" y "Access token"
WHATSAPP_API_URL=https://graph.facebook.com/v18.0
WHATSAPP_PHONE_ID=TU_PHONE_ID_AQUI
WHATSAPP_TOKEN=TU_TOKEN_AQUI
WHATSAPP_VERIFY_TOKEN=TU_VERIFY_TOKEN_AQUI

# ============================================
# GROQ AI (IA para el chatbot)
# ============================================
# Obtén tu API key en: https://console.groq.com/
GROQ_API_KEY=TU_GROQ_API_KEY_AQUI
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_MAX_TOKENS=150
GROQ_TEMPERATURE=0.5
GROQ_MAX_HISTORY=6

# ============================================
# SUPABASE (Base de datos)
# ============================================
# Obtén estos valores en: https://supabase.com/dashboard
# 1. Ve a tu proyecto > Settings > API
# 2. Copia "Project URL" y "anon public" key
SUPABASE_URL=TU_SUPABASE_URL_AQUI
SUPABASE_KEY=TU_SUPABASE_KEY_AQUI

# ============================================
# MAKE.COM (Webhook - Opcional)
# ============================================
MAKE_WEBHOOK_URL=https://hook.us2.make.com/TU_WEBHOOK_ID

# ============================================
# REDIS (Caché - Opcional)
# ============================================
REDIS_ENABLED=false
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_TLS=false

# ============================================
# USUARIOS BLOQUEADOS (Opcional)
# ============================================
BLOCKED_USERS=
```

### Paso 3: Reemplazar los valores

Ahora debes reemplazar cada `TU_XXX_AQUI` con tus valores reales:

#### 🔵 WhatsApp (Meta)

1. Ve a: https://developers.facebook.com/
2. Selecciona tu App de WhatsApp
3. Ve a **WhatsApp** → **Configuración**
4. Copia:
   - **Phone number ID**: Pégala en `WHATSAPP_PHONE_ID`
   - **Access token**: Pégala en `WHATSAPP_TOKEN`
   - **Verify token**: Crea uno personalizado y úsalo en `WHATSAPP_VERIFY_TOKEN` (puede ser cualquier string secreto)

#### 🟢 Groq AI

1. Ve a: https://console.groq.com/
2. Crea una cuenta o inicia sesión
3. Ve a **API Keys** → **Create API Key**
4. Copia la key y pégala en `GROQ_API_KEY`

#### 🟣 Supabase

1. Ve a: https://supabase.com/dashboard
2. Selecciona tu proyecto
3. Ve a **Settings** → **API**
4. Copia:
   - **Project URL**: Pégala en `SUPABASE_URL` (formato: `https://xxxxx.supabase.co`)
   - **anon public key**: Pégala en `SUPABASE_KEY` (la key que empieza con `eyJ...`)

#### 🟡 Make.com (Opcional)

Si ya tienes un webhook de Make, reemplaza la URL. Si no, puedes dejar la que está por defecto o crear uno nuevo en Make.com.

## 🚀 Desplegar a AWS Lambda

Una vez que tengas el archivo `.env` configurado:

### Opción 1: Deploy automático (Lee el .env)

El `serverless.yml` está configurado para leer automáticamente las variables del `.env`:

```bash
cd /Users/davidgalvis/Documents/FYN/FYN

# Instalar dependencias (si no lo has hecho)
npm install

# Desplegar a AWS Lambda
serverless deploy --stage dev

# O si quieres crear una nueva versión sin afectar la anterior
serverless deploy --stage v2
```

El Serverless Framework leerá automáticamente las variables del `.env` y las configurará en Lambda.

### Opción 2: Verificar variables en AWS

Después del deploy, puedes verificar que las variables estén configuradas:

1. Ve a **AWS Console** → **Lambda**
2. Busca tu función: `whatsapp-chatbot-dev-api` (o el nombre que hayas usado)
3. Ve a **Configuración** → **Variables de entorno**
4. Verifica que todas las variables estén presentes

### Opción 3: Actualizar variables manualmente en AWS

Si ya tienes el proyecto desplegado y solo necesitas actualizar variables:

1. **AWS Console** → **Lambda** → Tu función
2. **Configuración** → **Variables de entorno** → **Editar**
3. Agrega o modifica las variables
4. **Guardar**

**Nota**: Los cambios se aplican inmediatamente sin necesidad de redeploy.

## 🔍 Verificar que todo funciona

### 1. Probar localmente (opcional)

```bash
cd /Users/davidgalvis/Documents/FYN/FYN
npm start
```

Debería iniciar el servidor sin errores.

### 2. Verificar el deploy

```bash
# Ver información del deploy
serverless info --stage dev

# Ver logs en tiempo real
serverless logs -f api --tail
```

### 3. Probar el webhook

Una vez desplegado, obtendrás una URL como:
```
https://xxxxx.execute-api.us-east-1.amazonaws.com/dev/webhook
```

Úsala para configurar el webhook en Meta Developers.

## 📝 Checklist

Antes de hacer deploy, verifica:

- [ ] Archivo `.env` creado en la carpeta `FYN/`
- [ ] Todas las variables `TU_XXX_AQUI` fueron reemplazadas
- [ ] Los tokens no tienen espacios extra
- [ ] Las URLs tienen `https://` al inicio
- [ ] El archivo `.env` NO está en Git (está en `.gitignore`, correcto)

## 🚨 Problemas Comunes

### "Variable de entorno no encontrada"
- Verifica que el nombre de la variable sea exactamente el mismo
- No uses espacios alrededor del `=`
- No uses comillas a menos que el valor las necesite

### "Token inválido"
- Verifica que copiaste el token completo
- Asegúrate de que no haya expirado
- Regenera el token si es necesario

### "No se puede conectar a Supabase"
- Verifica que `SUPABASE_URL` tenga el formato: `https://xxxxx.supabase.co`
- Verifica que `SUPABASE_KEY` sea la key "anon public" (no service_role)

## 🔐 Seguridad

**IMPORTANTE:**
- ✅ El archivo `.env` está en `.gitignore` (correcto)
- ✅ NO subas el `.env` a Git
- ✅ NO compartas tus tokens públicamente
- ✅ Rota tus tokens periódicamente

## 📚 Recursos

- **Meta Developers**: https://developers.facebook.com/
- **Groq Console**: https://console.groq.com/
- **Supabase Dashboard**: https://supabase.com/dashboard
- **AWS Lambda Console**: https://console.aws.amazon.com/lambda/

---

**¿Necesitas ayuda?** Revisa los logs de CloudWatch o el archivo `CONFIGURAR_AWS.md` para más detalles.

