#!/bin/bash

# Colores para output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo "  Desplegando Backend con Protección Git"
echo "========================================"
echo ""

# 0. Verificando Git
echo -e "${YELLOW}[0/2] Verificando Git...${NC}"
if [[ -n $(git status -s) ]]; then
    echo -e "${YELLOW}Detectados cambios sin guardar. Haciendo commit automático...${NC}"
    git add .
    git commit -m "Auto-commit antes del deploy backend: $(date +'%Y-%m-%d %H:%M:%S')"
    echo -e "${GREEN}✓ Cambios guardados en Git${NC}"
else
    echo -e "${GREEN}✓ No hay cambios pendientes, Git está limpio${NC}"
fi

# 1. Desplegando a AWS
echo ""
echo -e "${YELLOW}[1/2] Desplegando funciones Lambda a AWS (prod)...${NC}"
serverless deploy --stage prod

if [ $? -ne 0 ]; then
    echo -e "${RED}ERROR: Falló el despliegue del backend${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Despliegue completado exitosamente${NC}"
echo ""

# 2. Resumen
echo "========================================"
echo -e "${GREEN}  Backend actualizado en AWS!${NC}"
echo "========================================"
echo "Puedes ver los logs con: serverless logs -f api --stage prod --tail"
echo ""
