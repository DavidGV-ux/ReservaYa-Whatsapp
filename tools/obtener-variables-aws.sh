#!/bin/bash

# Script para obtener variables de entorno de AWS Lambda y actualizar .env

echo "🔍 Obteniendo variables de entorno de AWS Lambda..."
echo ""

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Función para obtener variables de una función Lambda
obtener_variables() {
    local FUNCTION_NAME=$1
    local STAGE=$2
    
    echo -e "${YELLOW}📋 Intentando obtener variables de: ${FUNCTION_NAME}${NC}"
    
    # Intentar obtener las variables
    aws lambda get-function-configuration \
        --function-name "$FUNCTION_NAME" \
        --query 'Environment.Variables' \
        --output json 2>/dev/null
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Variables obtenidas exitosamente${NC}"
        return 0
    else
        echo -e "${RED}❌ No se pudo obtener variables de ${FUNCTION_NAME}${NC}"
        return 1
    fi
}

# Intentar diferentes nombres de función posibles
FUNCTIONS=(
    "whatsapp-chatbot-dev-api"
    "whatsapp-chatbot-prod-api"
    "whatsapp-chatbot-v2-api"
    "whatsapp-chatbot-coach-api"
)

echo "🔎 Buscando función Lambda desplegada..."
echo ""

VARIABLES_JSON=""
FUNCTION_ENCONTRADA=""

for func in "${FUNCTIONS[@]}"; do
    VARIABLES_JSON=$(obtener_variables "$func" "dev")
    if [ $? -eq 0 ] && [ ! -z "$VARIABLES_JSON" ] && [ "$VARIABLES_JSON" != "null" ]; then
        FUNCTION_ENCONTRADA="$func"
        echo -e "${GREEN}✅ Función encontrada: ${FUNCTION_ENCONTRADA}${NC}"
        break
    fi
done

if [ -z "$VARIABLES_JSON" ] || [ "$VARIABLES_JSON" == "null" ]; then
    echo ""
    echo -e "${RED}❌ No se encontró ninguna función Lambda con variables configuradas${NC}"
    echo ""
    echo "💡 Opciones:"
    echo "   1. Verifica que AWS CLI esté configurado: aws configure"
    echo "   2. Verifica que tengas permisos para leer funciones Lambda"
    echo "   3. Obtén el nombre de tu función desde AWS Console"
    echo "   4. Luego ejecuta manualmente:"
    echo "      aws lambda get-function-configuration --function-name TU_FUNCION --query 'Environment.Variables'"
    echo ""
    exit 1
fi

echo ""
echo "📝 Variables encontradas:"
echo "$VARIABLES_JSON" | jq '.' 2>/dev/null || echo "$VARIABLES_JSON"
echo ""

# Preguntar si quiere actualizar el .env
read -p "¿Deseas actualizar el archivo .env con estas variables? (s/N): " respuesta

if [[ ! $respuesta =~ ^[Ss]$ ]]; then
    echo "❌ Operación cancelada."
    echo ""
    echo "💡 Puedes copiar manualmente las variables mostradas arriba a tu archivo .env"
    exit 0
fi

# Crear backup del .env actual
if [ -f ".env" ]; then
    cp .env .env.backup
    echo "💾 Backup creado: .env.backup"
fi

# Actualizar .env con las variables de AWS
echo ""
echo "🔄 Actualizando archivo .env..."

# Crear nuevo .env con las variables de AWS
cat > .env << 'ENVHEADER'
# ============================================
# CONFIGURACIÓN DEL SERVIDOR
# ============================================
NODE_ENV=production
PORT=3000

# ============================================
# WHATSAPP BUSINESS API (Meta)
# ============================================
ENVHEADER

# Extraer y agregar variables de WhatsApp
WHATSAPP_API_URL=$(echo "$VARIABLES_JSON" | jq -r '.WHATSAPP_API_URL // empty')
WHATSAPP_PHONE_ID=$(echo "$VARIABLES_JSON" | jq -r '.WHATSAPP_PHONE_ID // empty')
WHATSAPP_TOKEN=$(echo "$VARIABLES_JSON" | jq -r '.WHATSAPP_TOKEN // empty')
WHATSAPP_VERIFY_TOKEN=$(echo "$VARIABLES_JSON" | jq -r '.WHATSAPP_VERIFY_TOKEN // empty')

cat >> .env << ENVWHATSAPP
WHATSAPP_API_URL=${WHATSAPP_API_URL:-https://graph.facebook.com/v18.0}
WHATSAPP_PHONE_ID=${WHATSAPP_PHONE_ID}
WHATSAPP_TOKEN=${WHATSAPP_TOKEN}
WHATSAPP_VERIFY_TOKEN=${WHATSAPP_VERIFY_TOKEN}

# ============================================
# GROQ AI (IA para el chatbot)
# ============================================
ENVWHATSAPP

# Extraer y agregar variables de Groq
GROQ_API_KEY=$(echo "$VARIABLES_JSON" | jq -r '.GROQ_API_KEY // empty')
GROQ_MODEL=$(echo "$VARIABLES_JSON" | jq -r '.GROQ_MODEL // "llama-3.3-70b-versatile"')

cat >> .env << ENVGROQ
GROQ_API_KEY=${GROQ_API_KEY}
GROQ_MODEL=${GROQ_MODEL:-llama-3.3-70b-versatile}
GROQ_MAX_TOKENS=150
GROQ_TEMPERATURE=0.5
GROQ_MAX_HISTORY=6

# ============================================
# SUPABASE (Base de datos)
# ============================================
ENVGROQ

# Extraer y agregar variables de Supabase
SUPABASE_URL=$(echo "$VARIABLES_JSON" | jq -r '.SUPABASE_URL // empty')
SUPABASE_KEY=$(echo "$VARIABLES_JSON" | jq -r '.SUPABASE_KEY // empty')

cat >> .env << ENVSUPABASE
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_KEY=${SUPABASE_KEY}

# ============================================
# MAKE.COM (Webhook - Opcional)
# ============================================
ENVSUPABASE

# Extraer y agregar variables de Make
MAKE_WEBHOOK_URL=$(echo "$VARIABLES_JSON" | jq -r '.MAKE_WEBHOOK_URL // "https://hook.us2.make.com/TU_WEBHOOK_ID"')

cat >> .env << ENVMAKE
MAKE_WEBHOOK_URL=${MAKE_WEBHOOK_URL}

# ============================================
# REDIS (Caché - Opcional)
# ============================================
ENVMAKE

# Extraer y agregar variables de Redis
REDIS_ENABLED=$(echo "$VARIABLES_JSON" | jq -r '.REDIS_ENABLED // "false"')
REDIS_HOST=$(echo "$VARIABLES_JSON" | jq -r '.REDIS_HOST // "localhost"')
REDIS_PORT=$(echo "$VARIABLES_JSON" | jq -r '.REDIS_PORT // "6379"')
REDIS_PASSWORD=$(echo "$VARIABLES_JSON" | jq -r '.REDIS_PASSWORD // ""')
REDIS_TLS=$(echo "$VARIABLES_JSON" | jq -r '.REDIS_TLS // "false"')

cat >> .env << ENVREDIS
REDIS_ENABLED=${REDIS_ENABLED}
REDIS_HOST=${REDIS_HOST}
REDIS_PORT=${REDIS_PORT}
REDIS_PASSWORD=${REDIS_PASSWORD}
REDIS_TLS=${REDIS_TLS}

# ============================================
# USUARIOS BLOQUEADOS (Opcional)
# ============================================
BLOCKED_USERS=
ENVREDIS

echo -e "${GREEN}✅ Archivo .env actualizado con las variables de AWS Lambda${NC}"
echo ""
echo "📋 Resumen:"
echo "   Función Lambda: ${FUNCTION_ENCONTRADA}"
echo "   Variables actualizadas: $(echo "$VARIABLES_JSON" | jq 'length' 2>/dev/null || echo 'varias')"
echo ""
echo "💡 Verifica el archivo .env antes de hacer deploy"
echo "   cat .env"

