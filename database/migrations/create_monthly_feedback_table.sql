-- Script para crear la tabla de logs de feedback mensual
-- Ejecutar en Supabase SQL Editor

-- Crear tabla de logs de feedback mensual
CREATE TABLE IF NOT EXISTS monthly_feedback_log (
  id BIGSERIAL PRIMARY KEY,
  user_phone VARCHAR(50) NOT NULL,
  income DECIMAL(15, 2),
  fixed_expenses DECIMAL(15, 2),
  variable_expenses DECIMAL(15, 2),
  total_expenses DECIMAL(15, 2),
  savings DECIMAL(15, 2),
  savings_percentage DECIMAL(5, 2),
  expense_categories TEXT[],
  status VARCHAR(20) DEFAULT 'sent',
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_feedback_user_phone ON monthly_feedback_log(user_phone);
CREATE INDEX IF NOT EXISTS idx_feedback_sent_at ON monthly_feedback_log(sent_at DESC);

-- Habilitar Row Level Security (RLS)
ALTER TABLE monthly_feedback_log ENABLE ROW LEVEL SECURITY;

-- Política para permitir insertar registros
CREATE POLICY "Enable insert for all users" ON monthly_feedback_log
    FOR INSERT WITH CHECK (true);

-- Política para permitir leer registros
CREATE POLICY "Enable read for all users" ON monthly_feedback_log
    FOR SELECT USING (true);

-- Comentarios para documentar la tabla
COMMENT ON TABLE monthly_feedback_log IS 'Tabla para almacenar los logs de feedback mensual enviados a los usuarios';
COMMENT ON COLUMN monthly_feedback_log.user_phone IS 'Número de teléfono del usuario';
COMMENT ON COLUMN monthly_feedback_log.income IS 'Ingreso mensual del usuario';
COMMENT ON COLUMN monthly_feedback_log.savings IS 'Ahorros calculados (ingreso - gastos)';
COMMENT ON COLUMN monthly_feedback_log.savings_percentage IS 'Porcentaje de ahorro sobre el ingreso';
COMMENT ON COLUMN monthly_feedback_log.expense_categories IS 'Categorías principales de gastos identificadas';

-- Verificar que la tabla se creó correctamente
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'monthly_feedback_log'
ORDER BY ordinal_position;

