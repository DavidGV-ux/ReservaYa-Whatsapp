# 📊 Guía de Monitoreo y Logs

## 🔍 Ver Logs en AWS Lambda

### Opción 1: AWS Console (Recomendado)

1. Ve a [AWS Console](https://console.aws.amazon.com)
2. Navega a **CloudWatch** > **Log Groups**
3. Busca el log group: `/aws/lambda/whatsapp-chatbot-dev-api`
4. Selecciona el stream más reciente
5. Filtra por errores: busca `ERROR` o `❌`

### Opción 2: Serverless CLI

```bash
# Ver logs en tiempo real
serverless logs -f api --tail

# Ver logs de una función específica
serverless logs -f monthlyFeedback --tail

# Ver logs de tips diarios
serverless logs -f dailyTips --tail

# Filtrar por error
serverless logs -f api --tail | grep ERROR
```

### Opción 3: AWS CLI

```bash
# Ver logs recientes
aws logs tail /aws/lambda/whatsapp-chatbot-dev-api --follow

# Filtrar por error
aws logs tail /aws/lambda/whatsapp-chatbot-dev-api --follow | grep ERROR
```

## 🔧 Endpoints de Debug

### Verificar Estado del Estudio
```bash
GET /debug/study?phone=+1234567890
```

Respuesta:
```json
{
  "phone": "+1234567890",
  "hasProfile": true,
  "needsStudy": false,
  "profile": {
    "user_name": "David Galvis",
    "monthly_salary": 4150,
    "currency": "MXN",
    "fixed_expenses": 2000,
    "country": "México",
    "language": "es"
  }
}
```

### Ver Instrucciones de Logs
```bash
GET /logs
```

## 🐛 Debugging del Estudio Inicial

### 1. Verificar que el usuario existe
```bash
curl https://tu-api.com/debug/study?phone=+1234567890
```

### 2. Ver logs en CloudWatch
Busca en los logs:
- `[trackingId] Usuario necesita estudio inicial`
- `[trackingId] Información extraída:`
- `[trackingId] Datos completos:`
- `[trackingId] Guardando información del estudio en BD`
- `❌ Error actualizando perfil:`

### 3. Verificar estructura de datos
Los logs mostrarán:
```json
{
  "user_name": "David Galvis",
  "monthly_salary": 4150,
  "currency": "MXN",
  "fixed_expenses": 2000,
  "country": "México"
}
```

## 🔍 Errores Comunes

### Error: "No hay campos válidos para actualizar"
**Causa**: Los datos no se están extrayendo correctamente
**Solución**: Revisa los logs para ver qué se extrajo

### Error: "Error de Supabase: column does not exist"
**Causa**: Falta una columna en la base de datos
**Solución**: Ejecuta los scripts SQL:
- `add_language_column.sql`
- `add_client_study_fields.sql`

### Error: "Error de Supabase: invalid input syntax"
**Causa**: Tipo de dato incorrecto (ej: string en lugar de número)
**Solución**: El código ahora convierte automáticamente, pero verifica los logs

## 📝 Formato de Logs

Los logs incluyen:
- `[trackingId]` - ID único para rastrear cada mensaje
- `✅` - Operación exitosa
- `❌` - Error
- `⚠️` - Advertencia
- `📝` - Información de datos
- `🔍` - Búsqueda/consulta

## 🚨 Alertas Recomendadas

Configura alertas en CloudWatch para:
- Errores frecuentes (`ERROR` o `❌`)
- Timeouts de Lambda
- Errores de Supabase

## 📊 Métricas Importantes

Monitorea:
- Tasa de éxito del estudio inicial
- Tiempo de respuesta promedio
- Errores por tipo
- Usuarios que completan el estudio

