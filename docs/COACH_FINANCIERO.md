# 💪 Sistema de Coach Financiero Personalizado

## 🎯 Mejoras Implementadas

### 1. **Personalidad de Coach Financiero**
El sistema ahora actúa como un **coach financiero amigable y personalizado**:
- ✅ Usa el nombre del usuario cuando es apropiado
- ✅ Celebra logros y ofrece apoyo
- ✅ Respuestas empáticas y motivacionales
- ✅ Mantiene un tono cercano pero profesional
- ✅ Usa emojis moderadamente para hacer la conversación más amigable

### 2. **Recordatorios Predefinidos (Sin IA)**
Sistema de recordatorios que **NO usa IA** para ahorrar tokens:
- ✅ Mensajes predefinidos en el código
- ✅ Envío automático a horas específicas
- ✅ Personalizados por idioma (español, inglés, portugués)
- ✅ Variedad de mensajes para evitar repetición

## 📅 Horarios de Recordatorios

### 9:00 AM - Recordatorio Matutino
- Planificación del día
- Establecer límites de gasto
- Mentalidad financiera positiva

**Ejemplo:**
```
☀️ Buenos días. ¿Ya revisaste tu presupuesto del día? 
Planifica tus gastos y evita compras impulsivas. 💪
```

### 12:00 PM - Recordatorio de Almuerzo
- Comparar precios antes de comprar
- Buscar promociones y descuentos
- Considerar cocinar en casa

**Ejemplo:**
```
🍽️ ¿Ya almorzaste? Recuerda buscar el mejor precio 
y comparar opciones antes de comprar. ¡Cada peso cuenta! 💰
```

### 2:00 PM - Recordatorio de Compras
- Regla de las 24 horas antes de comprar
- Comparar precios en múltiples lugares
- Revisar cupones y descuentos

**Ejemplo:**
```
🛒 Antes de comprar algo, pregúntate: ¿Realmente lo necesito 
o solo lo quiero? Espera 24 horas antes de decidir. ⏰
```

### 6:00 PM - Recordatorio de Cena
- Revisar qué hay en casa antes de pedir
- Planificar comidas de la semana
- Comparar costo de delivery vs cocinar

**Ejemplo:**
```
🍽️ Hora de cenar. ¿Ya revisaste qué tienes en casa antes 
de pedir comida? Cocinar puede ahorrarte mucho. 💵
```

### 8:00 PM - Recordatorio de Revisión
- Registrar gastos del día
- Revisar qué se puede mejorar
- Mantener el hábito diario

**Ejemplo:**
```
📊 ¿Ya registraste tus gastos de hoy? Mantener un registro 
diario te ayuda a controlar mejor tu dinero. ✍️
```

## 🎨 Características del Coach

### Personalización
- **Usa el nombre del usuario**: "Hola David! 👋"
- **Reconoce contexto**: Menciona salario, ubicación, país cuando es relevante
- **Idioma adaptativo**: Responde en el idioma preferido del usuario

### Tono y Estilo
- **Empático**: Entiende las dificultades financieras
- **Motivacional**: Celebra logros y ofrece apoyo
- **Práctico**: Consejos accionables y claros
- **Breve**: 2-3 oraciones máximo (optimizado para tokens)

### Interacción
- **Proactivo**: Envía recordatorios sin que el usuario pregunte
- **Cercano**: Tono de amigo que ayuda, no de banco
- **Positivo**: Enfoque en soluciones, no en problemas

## 💾 Ahorro de Tokens

### Recordatorios Predefinidos
- **0 tokens de IA**: Los recordatorios están en el código
- **Sin generación**: No se usa Groq para crear mensajes
- **Ahorro estimado**: ~500-1000 tokens por recordatorio evitado

### Prompt Optimizado
- **Más corto pero efectivo**: Mantiene personalidad de coach
- **Instrucciones claras**: Define el rol sin exceso de palabras
- **Contexto mínimo**: Solo información esencial del usuario

## 📊 Configuración en serverless.yml

```yaml
remindersMorning:    # 9:00 AM Colombia (14:00 UTC)
remindersLunch:      # 12:00 PM Colombia (17:00 UTC)
remindersShopping:   # 2:00 PM Colombia (19:00 UTC)
remindersDinner:     # 6:00 PM Colombia (23:00 UTC)
remindersReview:     # 8:00 PM Colombia (01:00 UTC)
```

## 🔧 Estructura de Archivos

### `Services/remindersService.js`
- Contiene todos los mensajes predefinidos
- Organizados por hora e idioma
- Métodos para enviar recordatorios

### `lambdaReminders.js`
- Handler para AWS Lambda
- Se ejecuta según cron schedule
- Mapea UTC a hora local

### `Services/openaiService.js`
- Prompt mejorado para coach financiero
- Mantiene optimización de tokens
- Personalidad más amigable

## 🎯 Ejemplo de Conversación

**Usuario:** "Hola, ¿cómo estoy con mis gastos?"

**Coach (IA):**
```
¡Hola David! 👋 

Según tus registros del mes, has gastado $5,000 de los $10,000 disponibles. 
Tienes $2,000 libres después de gastos fijos. 

¿Quieres que revisemos juntos dónde puedes optimizar? 💪
```

**Recordatorio Automático (12:00 PM):**
```
🍽️ ¿Ya almorzaste? Recuerda buscar el mejor precio 
y comparar opciones antes de comprar. ¡Cada peso cuenta! 💰
```

## 📈 Beneficios

1. **Mejor Engagement**: Recordatorios proactivos mantienen al usuario activo
2. **Ahorro de Tokens**: Mensajes predefinidos no usan IA
3. **Personalización**: El coach conoce al usuario y lo trata como persona
4. **Hábitos**: Los recordatorios ayudan a crear buenos hábitos financieros
5. **Costo-Beneficio**: Mejor experiencia con menor costo

## 🚀 Próximas Mejoras Posibles

- Recordatorios basados en comportamiento (ej: si gasta mucho en comida)
- Mensajes de celebración cuando alcanza metas
- Recordatorios personalizados según perfil financiero
- Integración con eventos del calendario del usuario

