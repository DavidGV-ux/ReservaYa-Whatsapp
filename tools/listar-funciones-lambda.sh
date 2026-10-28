#!/bin/bash

# Script para listar todas las funciones Lambda relacionadas con whatsapp-chatbot

echo "🔍 Buscando funciones Lambda de whatsapp-chatbot..."
echo ""

# Verificar si AWS CLI está configurado
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI no está instalado o no está en el PATH"
    echo "   Instálalo con: brew install awscli"
    exit 1
fi

# Verificar configuración de AWS
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS CLI no está configurado o no tienes permisos"
    echo "   Configúralo con: aws configure"
    exit 1
fi

echo "✅ AWS CLI configurado correctamente"
echo ""

# Listar funciones en todas las regiones comunes
REGIONS=("us-east-1" "us-west-2" "eu-west-1" "sa-east-1")

FUNCIONES_ENCONTRADAS=()

for region in "${REGIONS[@]}"; do
    echo "🔎 Buscando en región: $region"
    
    FUNCIONES=$(aws lambda list-functions \
        --region "$region" \
        --query 'Functions[?contains(FunctionName, `whatsapp-chatbot`)].FunctionName' \
        --output text 2>/dev/null)
    
    if [ ! -z "$FUNCIONES" ]; then
        echo "   ✅ Funciones encontradas:"
        for func in $FUNCIONES; do
            echo "      - $func (región: $region)"
            FUNCIONES_ENCONTRADAS+=("$func:$region")
        done
    else
        echo "   ⚪ No se encontraron funciones"
    fi
    echo ""
done

if [ ${#FUNCIONES_ENCONTRADAS[@]} -eq 0 ]; then
    echo "❌ No se encontraron funciones Lambda relacionadas con 'whatsapp-chatbot'"
    echo ""
    echo "💡 Opciones:"
    echo "   1. Verifica que estés en la región correcta"
    echo "   2. Verifica que tengas permisos para listar funciones Lambda"
    echo "   3. Busca manualmente en AWS Console: https://console.aws.amazon.com/lambda/"
    exit 1
fi

echo "📋 Funciones encontradas:"
for i in "${!FUNCIONES_ENCONTRADAS[@]}"; do
    IFS=':' read -r func region <<< "${FUNCIONES_ENCONTRADAS[$i]}"
    echo "   $((i+1)). $func (región: $region)"
done
echo ""

# Preguntar cuál función usar
read -p "¿Qué función quieres usar? (número): " seleccion

if ! [[ "$seleccion" =~ ^[0-9]+$ ]] || [ "$seleccion" -lt 1 ] || [ "$seleccion" -gt ${#FUNCIONES_ENCONTRADAS[@]} ]; then
    echo "❌ Selección inválida"
    exit 1
fi

FUNCION_SELECCIONADA="${FUNCIONES_ENCONTRADAS[$((seleccion-1))]}"
IFS=':' read -r FUNCION_NAME REGION <<< "$FUNCION_SELECCIONADA"

echo ""
echo "📥 Obteniendo variables de: $FUNCION_NAME (región: $REGION)"
echo ""

# Obtener variables
VARIABLES_JSON=$(aws lambda get-function-configuration \
    --function-name "$FUNCION_NAME" \
    --region "$REGION" \
    --query 'Environment.Variables' \
    --output json 2>/dev/null)

if [ $? -ne 0 ] || [ -z "$VARIABLES_JSON" ] || [ "$VARIABLES_JSON" == "null" ]; then
    echo "❌ No se pudieron obtener las variables de la función"
    echo "   Verifica que tengas permisos para leer la configuración de Lambda"
    exit 1
fi

echo "✅ Variables obtenidas:"
echo "$VARIABLES_JSON" | jq '.' 2>/dev/null || echo "$VARIABLES_JSON"
echo ""

# Preguntar si quiere actualizar el .env
read -p "¿Deseas actualizar el archivo .env con estas variables? (s/N): " respuesta

if [[ ! $respuesta =~ ^[Ss]$ ]]; then
    echo "❌ Operación cancelada."
    echo ""
    echo "💡 Las variables están mostradas arriba. Puedes copiarlas manualmente."
    exit 0
fi

# Crear backup
if [ -f ".env" ]; then
    cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
    echo "💾 Backup creado"
fi

# Actualizar .env
echo ""
echo "🔄 Actualizando archivo .env..."

# Función para obtener valor o default
get_value() {
    local key=$1
    local default=$2
    local value=$(echo "$VARIABLES_JSON" | jq -r ".$key // \"$default\"" 2>/dev/null)
    if [ "$value" == "null" ] || [ -z "$value" ]; then
        echo "$default"
    else
        echo "$value"
    fi
}

# Crear nuevo .env
cat > .env << EOF
# ============================================
# CONFIGURACIÓN DEL SERVIDOR
# ============================================
NODE_ENV=production
PORT=3000

# ============================================
# WHATSAPP BUSINESS API (Meta)
# ============================================
WHATSAPP_API_URL=$(get_value "WHATSAPP_API_URL" "https://graph.facebook.com/v18.0")
WHATSAPP_PHONE_ID=$(get_value "WHATSAPP_PHONE_ID" "")
WHATSAPP_TOKEN=$(get_value "WHATSAPP_TOKEN" "")
WHATSAPP_VERIFY_TOKEN=$(get_value "WHATSAPP_VERIFY_TOKEN" "")

# ============================================
# GROQ AI (IA para el chatbot)
# ============================================
GROQ_API_KEY=$(get_value "GROQ_API_KEY" "")
GROQ_MODEL=$(get_value "GROQ_MODEL" "llama-3.3-70b-versatile")
GROQ_MAX_TOKENS=150
GROQ_TEMPERATURE=0.5
GROQ_MAX_HISTORY=6

# ============================================
# SUPABASE (Base de datos)
# ============================================
SUPABASE_URL=$(get_value "SUPABASE_URL" "")
SUPABASE_KEY=$(get_value "SUPABASE_KEY" "")

# ============================================
# MAKE.COM (Webhook - Opcional)
# ============================================
MAKE_WEBHOOK_URL=$(get_value "MAKE_WEBHOOK_URL" "https://hook.us2.make.com/TU_WEBHOOK_ID")

# ============================================
# REDIS (Caché - Opcional)
# ============================================
REDIS_ENABLED=$(get_value "REDIS_ENABLED" "false")
REDIS_HOST=$(get_value "REDIS_HOST" "localhost")
REDIS_PORT=$(get_value "REDIS_PORT" "6379")
REDIS_PASSWORD=$(get_value "REDIS_PASSWORD" "")
REDIS_TLS=$(get_value "REDIS_TLS" "false")

# ============================================
# USUARIOS BLOQUEADOS (Opcional)
# ============================================
BLOCKED_USERS=
EOF

echo "✅ Archivo .env actualizado exitosamente"
echo ""
echo "📋 Resumen:"
echo "   Función: $FUNCION_NAME"
echo "   Región: $REGION"
echo "   Variables actualizadas: $(echo "$VARIABLES_JSON" | jq 'length' 2>/dev/null || echo 'varias')"
echo ""
echo "💡 Verifica el archivo antes de hacer deploy:"
echo "   cat .env | grep -v '^#' | grep -v '^$'"

