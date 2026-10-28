# 🔍 Cómo Obtener Variables de AWS Lambda y Actualizar .env

Como ya tienes el proyecto desplegado en AWS, necesitas obtener las variables que ya están configuradas en Lambda.

## 📋 Opción 1: Desde AWS Console (Más Fácil)

### Paso 1: Ir a AWS Lambda
1. Abre: https://console.aws.amazon.com/lambda/
2. Selecciona la región donde está desplegado (probablemente `us-east-1`)

### Paso 2: Encontrar tu función
Busca funciones que empiecen con `whatsapp-chatbot`. Pueden tener nombres como:
- `whatsapp-chatbot-dev-api`
- `whatsapp-chatbot-prod-api`
- `whatsapp-chatbot-v2-api`
- `whatsapp-chatbot-coach-api`

### Paso 3: Ver Variables de Entorno
1. Haz clic en la función Lambda
2. Ve a la pestaña **"Configuration"** (Configuración)
3. En el menú lateral, haz clic en **"Environment variables"** (Variables de entorno)
4. Verás todas las variables configuradas

### Paso 4: Copiar las Variables
Copia cada valor y actualiza tu archivo `.env`:

```env
NODE_ENV=production
PORT=3000

WHATSAPP_API_URL=<copia el valor de AWS>
WHATSAPP_PHONE_ID=<copia el valor de AWS>
WHATSAPP_TOKEN=<copia el valor de AWS>
WHATSAPP_VERIFY_TOKEN=<copia el valor de AWS>

GROQ_API_KEY=<copia el valor de AWS>
GROQ_MODEL=<copia el valor de AWS o deja el default>

SUPABASE_URL=<copia el valor de AWS>
SUPABASE_KEY=<copia el valor de AWS>

MAKE_WEBHOOK_URL=<copia el valor de AWS>

REDIS_ENABLED=<copia el valor de AWS o false>
REDIS_HOST=<copia el valor de AWS o localhost>
REDIS_PORT=<copia el valor de AWS o 6379>
REDIS_PASSWORD=<copia el valor de AWS o déjalo vacío>
REDIS_TLS=<copia el valor de AWS o false>
```

## 📋 Opción 2: Desde AWS CLI

### Paso 1: Configurar AWS CLI (si no lo tienes)
```bash
aws configure
# Ingresa tu Access Key ID, Secret Access Key, región (us-east-1), y formato (json)
```

### Paso 2: Listar todas tus funciones Lambda
```bash
aws lambda list-functions --query 'Functions[?contains(FunctionName, `whatsapp-chatbot`)].FunctionName' --output table
```

### Paso 3: Obtener variables de una función específica
```bash
# Reemplaza NOMBRE_FUNCION con el nombre real de tu función
aws lambda get-function-configuration \
  --function-name NOMBRE_FUNCION \
  --query 'Environment.Variables' \
  --output json
```

### Paso 4: Guardar en un archivo temporal
```bash
aws lambda get-function-configuration \
  --function-name whatsapp-chatbot-dev-api \
  --query 'Environment.Variables' \
  --output json > variables-aws.json
```

Luego puedes ver el contenido:
```bash
cat variables-aws.json
```

## 📋 Opción 3: Usar el Script Automático

Si ya configuraste AWS CLI, puedes usar el script:

```bash
cd /Users/davidgalvis/Documents/FYN/FYN
./obtener-variables-aws.sh
```

**Nota**: El script intenta encontrar automáticamente tu función. Si no la encuentra, necesitas:

1. **Saber el nombre exacto de tu función Lambda**
2. **Modificar el script** o usar AWS CLI directamente

## 🔧 Actualizar el .env Manualmente

Una vez que tengas las variables de AWS:

1. **Abre el archivo .env**:
   ```bash
   cd /Users/davidgalvis/Documents/FYN/FYN
   nano .env
   # o usa tu editor favorito
   ```

2. **Reemplaza los valores** `REEMPLAZA_CON_TU_...` con los valores reales de AWS

3. **Asegúrate de que**:
   - `NODE_ENV=production` (no development)
   - Todos los valores estén sin comillas
   - No haya espacios alrededor del `=`

## ✅ Verificar que el .env está correcto

```bash
cd /Users/davidgalvis/Documents/FYN/FYN
cat .env | grep -v "^#" | grep -v "^$"
```

Deberías ver todas las variables con sus valores (sin los `REEMPLAZA_CON_TU_...`).

## 🚨 Si no encuentras tu función Lambda

1. **Verifica la región**: Asegúrate de estar en la región correcta (probablemente `us-east-1`)
2. **Busca en todas las regiones**: Puede estar en otra región
3. **Revisa CloudFormation**: Si usaste Serverless Framework, busca stacks en CloudFormation
4. **Revisa el historial de deploy**: Si tienes acceso a logs anteriores, el nombre de la función debería estar ahí

## 📝 Ejemplo de .env Completo (Producción)

```env
NODE_ENV=production
PORT=3000

WHATSAPP_API_URL=https://graph.facebook.com/v18.0
WHATSAPP_PHONE_ID=123456789012345
WHATSAPP_TOKEN=TU_WHATSAPP_TOKEN
WHATSAPP_VERIFY_TOKEN=mi_token_secreto_123

GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_MAX_TOKENS=150
GROQ_TEMPERATURE=0.5
GROQ_MAX_HISTORY=6

SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=TU_SUPABASE_KEY...

MAKE_WEBHOOK_URL=https://hook.us2.make.com/TU_WEBHOOK_ID

REDIS_ENABLED=false
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_TLS=false

BLOCKED_USERS=
```

---

**💡 Tip**: Una vez que tengas el `.env` actualizado con los valores de producción, puedes hacer deploy sin problemas y las variables se mantendrán sincronizadas.

