#!/bin/bash
# Script para actualizar el token de WhatsApp en AWS Lambda

echo "🔐 Actualizar Token de WhatsApp en AWS Lambda"
echo ""
echo "⚠️  IMPORTANTE: Primero necesitas obtener un nuevo token de WhatsApp"
echo ""
echo "📋 Pasos para obtener el token:"
echo "1. Ve a https://developers.facebook.com/"
echo "2. Selecciona tu App de WhatsApp"
echo "3. Ve a WhatsApp > Configuración"
echo "4. Copia el 'Access Token' (o genera uno nuevo)"
echo ""
read -p "¿Tienes el nuevo token? (s/n): " tiene_token

if [ "$tiene_token" != "s" ] && [ "$tiene_token" != "S" ]; then
    echo "❌ Por favor obtén el token primero y vuelve a ejecutar este script"
    exit 1
fi

echo ""
read -p "Pega el nuevo WHATSAPP_TOKEN: " nuevo_token

if [ -z "$nuevo_token" ]; then
    echo "❌ El token no puede estar vacío"
    exit 1
fi

echo ""
echo "🔄 Actualizando token en AWS Lambda..."
echo ""

# Nombre de la función Lambda (ajusta si es diferente)
FUNCTION_NAME="whatsapp-chatbot-dev-api"

# Actualizar la variable de entorno
aws lambda update-function-configuration \
    --function-name $FUNCTION_NAME \
    --environment "Variables={NODE_ENV=production,WHATSAPP_API_URL=${WHATSAPP_API_URL:-https://graph.facebook.com/v18.0},WHATSAPP_PHONE_ID=${WHATSAPP_PHONE_ID},WHATSAPP_TOKEN=$nuevo_token,WHATSAPP_VERIFY_TOKEN=${WHATSAPP_VERIFY_TOKEN},GROQ_API_KEY=${GROQ_API_KEY},GROQ_MODEL=${GROQ_MODEL:-llama-3.3-70b-versatile},SUPABASE_URL=${SUPABASE_URL},SUPABASE_KEY=${SUPABASE_KEY},MAKE_WEBHOOK_URL=${MAKE_WEBHOOK_URL},REDIS_ENABLED=${REDIS_ENABLED:-false}}" \
    --region us-east-1

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Token actualizado exitosamente!"
    echo ""
    echo "📝 Nota: Si tienes otras variables de entorno, necesitarás actualizarlas también."
    echo "   Puedes ver todas las variables con:"
    echo "   aws lambda get-function-configuration --function-name $FUNCTION_NAME --query 'Environment.Variables'"
else
    echo ""
    echo "❌ Error al actualizar el token"
    echo ""
    echo "💡 Alternativa: Actualiza todas las variables de entorno desde el archivo .env:"
    echo "   1. Edita tu archivo .env con el nuevo token"
    echo "   2. Ejecuta: serverless deploy --stage dev"
fi

