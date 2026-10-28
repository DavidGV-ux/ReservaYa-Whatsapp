# 🎯 Optimización de Consumo de Tokens - Groq

## ✅ Optimizaciones Implementadas

### 1. **Límite de Tokens Reducido**
- **Antes**: 500 tokens por respuesta
- **Ahora**: 150 tokens por respuesta
- **Ahorro**: 70% menos tokens en respuestas

### 2. **Prompts del Sistema Optimizados**
- **Antes**: ~200-300 tokens por prompt
- **Ahora**: ~50-80 tokens por prompt
- **Ahorro**: 60-70% menos tokens en prompts

### 3. **Historial de Conversación Limitado**
- **Antes**: 12 mensajes en historial
- **Ahora**: 6 mensajes máximo
- **Ahorro**: 50% menos tokens en contexto

### 4. **Contextos Acortados**
- **Contexto histórico**: De ~300 tokens a ~100 tokens
- **Contexto de gastos**: De ~200 tokens a ~50 tokens
- **Ahorro**: 70% menos tokens en contextos

### 5. **Temperatura Reducida**
- **Antes**: 0.7 (más creativo, más tokens)
- **Ahora**: 0.5 (más determinístico, menos tokens)
- **Beneficio**: Respuestas más consistentes y predecibles

### 6. **Extracción de Información Optimizada**
- **Antes**: 200 tokens
- **Ahora**: 100 tokens
- **Ahorro**: 50% menos tokens

## 📊 Estimación de Tokens por Mensaje

### Antes de Optimización:
- System prompt: ~250 tokens
- Historial (12 mensajes): ~600 tokens
- Contexto adicional: ~300 tokens
- Respuesta (max 500): ~400 tokens
- **Total aproximado**: ~1,550 tokens

### Después de Optimización:
- System prompt: ~70 tokens
- Historial (6 mensajes): ~300 tokens
- Contexto adicional: ~100 tokens
- Respuesta (max 150): ~120 tokens
- **Total aproximado**: ~590 tokens

### **Ahorro Total: ~62% menos tokens**

## ⚙️ Configuración

Las optimizaciones están configuradas en `config.js`:

```javascript
groq: {
  maxTokens: 150,        // Máximo tokens por respuesta
  temperature: 0.5,      // Más determinístico
  maxHistoryMessages: 6, // Solo últimas 6 interacciones
}
```

### Personalizar Límites

Puedes ajustar estos valores en tu archivo `.env`:

```env
GROQ_MAX_TOKENS=150
GROQ_TEMPERATURE=0.5
GROQ_MAX_HISTORY=6
```

## 💰 Impacto en Costos

### Con Groq (llama-3.3-70b-versatile):
- **Tokens por mensaje**: ~590 tokens
- **Costo aproximado**: $0.0000002 por 1K tokens
- **Costo por mensaje**: ~$0.00000012 (muy bajo)

### Para 1,000 mensajes al día:
- **Tokens totales**: ~590,000 tokens/día
- **Costo diario**: ~$0.12
- **Costo mensual**: ~$3.60

## 🎯 Mejores Prácticas

1. **Respuestas Cortas**: El sistema está configurado para respuestas de máximo 150 tokens (2-3 oraciones)
2. **Historial Limitado**: Solo mantiene las últimas 6 interacciones
3. **Contexto Esencial**: Solo incluye información realmente necesaria
4. **Prompts Concisos**: Los prompts del sistema son breves y directos

## 📈 Monitoreo

Para monitorear el uso de tokens, revisa los logs. Cada respuesta debería usar aproximadamente:
- **Mínimo**: ~200 tokens (mensaje simple sin contexto)
- **Promedio**: ~400-500 tokens (con contexto básico)
- **Máximo**: ~600 tokens (con contexto histórico y gastos)

## 🔧 Ajustes Adicionales

Si necesitas reducir aún más:

1. **Reducir maxTokens a 100**:
   ```env
   GROQ_MAX_TOKENS=100
   ```

2. **Reducir historial a 4 mensajes**:
   ```env
   GROQ_MAX_HISTORY=4
   ```

3. **Temperatura más baja (más determinístico)**:
   ```env
   GROQ_TEMPERATURE=0.3
   ```

## ⚠️ Consideraciones

- **Respuestas más cortas**: Las respuestas serán más concisas (ideal para WhatsApp)
- **Menos contexto**: Puede perder algo de contexto en conversaciones muy largas
- **Más determinístico**: Respuestas más predecibles (menos creatividad)

## ✅ Resultado

Con estas optimizaciones, el consumo de tokens se ha reducido en aproximadamente **62%**, manteniendo la calidad de las respuestas pero haciéndolas más adecuadas para WhatsApp (breves y directas).

