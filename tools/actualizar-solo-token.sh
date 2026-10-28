#!/bin/bash
# Script para actualizar SOLO el token de WhatsApp sin perder otras variables

echo "🔐 Actualizar SOLO el Token de WhatsApp"
echo ""

# Obtener variables actuales
echo "📋 Obteniendo variables actuales de Lambda..."
FUNCTION_NAME="whatsapp-chatbot-dev-api"

CURRENT_ENV=$(aws lambda get-function-configuration \
    --function-name $FUNCTION_NAME \
    --query 'Environment.Variables' \
    --output json 2>/dev/null)

if [ $? -ne 0 ]; then
    echo "❌ Error obteniendo configuración actual. Verifica:"
    echo "   1. Que AWS CLI esté configurado"
    echo "   2. Que tengas permisos para Lambda"
    echo "   3. Que el nombre de la función sea correcto"
    exit 1
fi

echo "✅ Variables actuales obtenidas"
echo ""

# Pedir nuevo token
read -p "Pega el nuevo WHATSAPP_TOKEN: " nuevo_token

if [ -z "$nuevo_token" ]; then
    echo "❌ El token no puede estar vacío"
    exit 1
fi

# Actualizar solo el token en el JSON
echo ""
echo "🔄 Actualizando token..."

# Usar jq si está disponible, sino usar Python
if command -v jq &> /dev/null; then
    UPDATED_ENV=$(echo "$CURRENT_ENV" | jq --arg token "$nuevo_token" '.WHATSAPP_TOKEN = $token')
else
    # Usar Python para actualizar el JSON
    UPDATED_ENV=$(python3 -c "
import json
import sys
env = json.load(sys.stdin)
env['WHATSAPP_TOKEN'] = '$nuevo_token'
print(json.dumps(env))
" <<< "$CURRENT_ENV")
fi

# Convertir JSON a formato de variables de entorno para AWS CLI
ENV_STRING=$(echo "$UPDATED_ENV" | python3 -c "
import json
import sys
env = json.load(sys.stdin)
vars = []
for key, value in env.items():
    vars.append(f\"{key}={value}\")
print(','.join(vars))
")

# Actualizar en Lambda
echo "📤 Enviando actualización a AWS..."
aws lambda update-function-configuration \
    --function-name $FUNCTION_NAME \
    --environment "Variables={$ENV_STRING}" \
    --region us-east-1

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Token actualizado exitosamente!"
    echo ""
    echo "🧪 Prueba enviando un mensaje al chatbot"
else
    echo ""
    echo "❌ Error al actualizar el token"
    exit 1
fi

