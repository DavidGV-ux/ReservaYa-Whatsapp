#!/bin/bash

# Script para crear el archivo .env desde .env.example

echo "🔧 Creando archivo .env desde .env.example..."

if [ -f ".env" ]; then
    echo "⚠️  El archivo .env ya existe."
    read -p "¿Deseas sobrescribirlo? (s/N): " respuesta
    if [[ ! $respuesta =~ ^[Ss]$ ]]; then
        echo "❌ Operación cancelada."
        exit 1
    fi
fi

if [ ! -f ".env.example" ]; then
    echo "❌ Error: No se encontró el archivo .env.example"
    exit 1
fi

cp .env.example .env

echo "✅ Archivo .env creado exitosamente!"
echo ""
echo "📝 IMPORTANTE: Ahora debes editar el archivo .env y reemplazar:"
echo "   - REEMPLAZA_CON_TU_PHONE_ID"
echo "   - REEMPLAZA_CON_TU_TOKEN"
echo "   - REEMPLAZA_CON_TU_VERIFY_TOKEN"
echo "   - REEMPLAZA_CON_TU_GROQ_API_KEY"
echo "   - REEMPLAZA_CON_TU_SUPABASE_URL"
echo "   - REEMPLAZA_CON_TU_SUPABASE_KEY"
echo ""
echo "💡 Puedes editarlo con: nano .env"
echo "   O abre el archivo .env en tu editor favorito"

