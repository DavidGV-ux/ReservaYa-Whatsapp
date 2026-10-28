# 📅 Sistema de Gastos del Mes Actual

## 🎯 Funcionalidad Implementada

El sistema ahora **solo muestra y consulta gastos del mes actual** (desde el día 1 hasta el último día del mes, 28/29/30/31 según corresponda).

## ✅ Características

### 1. **Consulta de Gastos Limitada al Mes Actual**
- Cuando el usuario pregunta por gastos, solo se muestran los del mes actual
- El sistema calcula automáticamente el primer y último día del mes actual
- No se muestran gastos de meses anteriores

### 2. **Lista Detallada de Gastos**
Cuando el usuario pregunta por sus gastos, el sistema muestra:
- **Lista de gastos individuales** del mes actual (últimos 10 para optimizar tokens)
- **Fecha de cada gasto** (formato: día mes, ej: "15 dic")
- **Descripción del gasto** (truncada a 40 caracteres si es muy larga)
- **Monto de cada gasto**
- **Total del mes** con cantidad de gastos
- **Información de saldo**: Salario, gastos fijos, gastos variables y saldo disponible

### 3. **Detección Mejorada de Preguntas sobre Gastos**
El sistema detecta automáticamente cuando el usuario pregunta por gastos usando palabras clave como:
- `gasto`, `gastos`, `gastado`, `gasté`
- `compré`, `compras`
- `disponible`, `saldo`
- `transacciones`
- `cuánto he gastado`, `mis gastos`, `lista de gastos`

**No requiere** mencionar explícitamente "mes" o "este mes" - el sistema asume que siempre pregunta por el mes actual.

### 4. **Búsqueda en Historial Limitada**
- Si el usuario pregunta por gastos en conversaciones anteriores, la búsqueda se limita automáticamente al mes actual
- Esto asegura que solo se encuentren referencias a gastos del mes en curso

## 📊 Estructura de Datos

### Información del Usuario
- **Salario mensual** (`monthly_salary`): Ingreso base del usuario
- **Gastos fijos** (`fixed_expenses`): Gastos recurrentes mensuales (renta, servicios, etc.)

### Gastos Variables del Mes
- Se almacenan en la tabla `transactions` con:
  - `transaction_type = 'expense'`
  - `date`: Fecha del gasto (solo del mes actual se consultan)
  - `amount`: Monto del gasto
  - `description`: Descripción del gasto
  - `currency`: Moneda

## 🔧 Métodos Implementados

### `getCurrentMonthExpensesList(phoneNumber)`
Obtiene la lista completa de gastos del mes actual (día 1 al último día del mes).

**Retorna:**
```javascript
[
  {
    id: 1,
    date: "2025-12-15",
    amount: 150.00,
    currency: "MXN",
    description: "Almuerzo",
    transaction_type: "expense",
    ...
  },
  ...
]
```

### `getMonthlyExpensesTotal(phoneNumber)`
Calcula el total de gastos del mes actual agrupado por moneda.

**Retorna:**
```javascript
{
  total: { MXN: 5000.00 },
  count: 15,
  transactions: [...]
}
```

### `getAvailableBalance(phoneNumber)`
Calcula el saldo disponible considerando:
- Salario mensual
- Gastos fijos
- Gastos variables del mes actual

**Retorna:**
```javascript
{
  monthlySalary: 10000,
  fixedExpenses: 3000,
  variableExpenses: 5000,
  totalExpenses: 8000,
  availableBalance: 2000,
  currency: "MXN"
}
```

## 💬 Ejemplo de Respuesta

Cuando el usuario pregunta: *"¿Cuánto he gastado este mes?"* o *"Mis gastos"*

El sistema responde con:
```
💰 GASTOS DEL MES ACTUAL (diciembre 2025):

1. 15 dic: Almuerzo en restaurante - MXN 250
2. 14 dic: Compra de ropa - MXN 1,200
3. 13 dic: Supermercado - MXN 800
4. 12 dic: Transporte - MXN 150
5. 10 dic: Café - MXN 50
... y 5 gastos más

TOTAL DEL MES: MXN 5,000 (10 gastos)
Salario: MXN 10,000 | Fijos: MXN 3,000 | Disponible: MXN 2,000
```

## 🗓️ Cálculo del Mes Actual

El sistema calcula automáticamente:
- **Primer día del mes**: `YYYY-MM-01`
- **Último día del mes**: Calcula según el mes (28/29/30/31)
- **Ejemplo para diciembre 2025**: `2025-12-01` a `2025-12-31`

## ⚙️ Configuración

No requiere configuración adicional. El sistema:
- Detecta automáticamente el mes actual
- Calcula el rango de fechas correctamente
- Maneja meses con diferentes cantidades de días

## 🔄 Flujo de Trabajo

1. **Usuario pregunta por gastos** → Sistema detecta palabras clave
2. **Sistema consulta base de datos** → Solo gastos del mes actual
3. **Sistema construye contexto** → Lista detallada de gastos
4. **IA genera respuesta** → Con información del mes actual
5. **Usuario recibe respuesta** → Con lista de gastos del mes

## 📝 Notas Importantes

- **Solo mes actual**: El sistema NO muestra gastos de meses anteriores
- **Límite de visualización**: Muestra máximo 10 gastos en la lista (para optimizar tokens)
- **Total completo**: Siempre muestra el total completo del mes, aunque haya más de 10 gastos
- **Gastos fijos vs variables**: Los gastos fijos se muestran por separado (no se suman a la lista de gastos variables)

## 🚀 Próximas Mejoras Posibles

- Agrupar gastos por categoría
- Mostrar gráficos de gastos
- Comparar con meses anteriores (si se requiere)
- Alertas cuando se acerca al límite de presupuesto

