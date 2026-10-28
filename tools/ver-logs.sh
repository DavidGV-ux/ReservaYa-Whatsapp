#!/bin/bash
# Script para ver logs del backend en tiempo real

echo "📊 Ver logs del backend en tiempo real"
echo ""
echo "Opciones:"
echo "1. Usando Serverless Framework (recomendado)"
echo "2. Usando AWS CLI directamente"
echo ""
read -p "Selecciona una opción (1 o 2): " opcion

if [ "$opcion" == "1" ]; then
    echo ""
    echo "🔍 Ver logs de la función API principal:"
    echo "Comando: serverless logs -f api --tail"
    echo ""
    cd /Users/davidgalvis/Documents/FYN/FYN
    serverless logs -f api --tail
elif [ "$opcion" == "2" ]; then
    echo ""
    echo "🔍 Ver logs usando AWS CLI:"
    echo "Comando: aws logs tail /aws/lambda/whatsapp-chatbot-dev-api --follow"
    echo ""
    aws logs tail /aws/lambda/whatsapp-chatbot-dev-api --follow
else
    echo "❌ Opción inválida"
    exit 1
fi

