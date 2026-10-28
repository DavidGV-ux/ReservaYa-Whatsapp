-- Script para agregar campos del estudio inicial del cliente a la tabla user_profiles
-- Ejecutar en Supabase SQL Editor

-- Agregar columna 'currency' si no existe
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS currency VARCHAR(10);

-- Agregar columna 'fixed_expenses' si no existe
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS fixed_expenses DECIMAL(15, 2);

-- Comentarios para documentar las columnas
COMMENT ON COLUMN user_profiles.currency IS 'Código de moneda ISO 4217 del usuario (MXN, USD, EUR, etc.)';
COMMENT ON COLUMN user_profiles.fixed_expenses IS 'Gastos fijos mensuales del usuario en la moneda especificada';

-- Verificar que las columnas se agregaron correctamente
SELECT 
    column_name, 
    data_type, 
    character_maximum_length,
    numeric_precision,
    numeric_scale,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'user_profiles' 
  AND column_name IN ('currency', 'fixed_expenses')
ORDER BY column_name;

