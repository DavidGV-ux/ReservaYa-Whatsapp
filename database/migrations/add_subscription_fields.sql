-- Script para agregar campos de suscripción a la tabla user_profiles
-- Ejecutar en Supabase SQL Editor

-- Agregar campos de suscripción
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS subscription_start_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS subscription_active BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS subscription_manual_override BOOLEAN DEFAULT false;

-- Crear índice para mejorar consultas de suscripciones activas
CREATE INDEX IF NOT EXISTS idx_subscription_active ON user_profiles(subscription_active) 
WHERE subscription_active = true;

CREATE INDEX IF NOT EXISTS idx_subscription_end_date ON user_profiles(subscription_end_date);

-- Comentarios para documentar las columnas
COMMENT ON COLUMN user_profiles.subscription_start_date IS 'Fecha de inicio de la suscripción (se establece en el primer mensaje)';
COMMENT ON COLUMN user_profiles.subscription_end_date IS 'Fecha de fin de la suscripción (15 días después del inicio)';
COMMENT ON COLUMN user_profiles.subscription_active IS 'Estado de la suscripción (true = activa, false = inactiva)';
COMMENT ON COLUMN user_profiles.subscription_manual_override IS 'Si es true, el admin tiene control manual sobre la suscripción';

-- Verificar que las columnas se agregaron correctamente
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'user_profiles' 
  AND column_name LIKE 'subscription%'
ORDER BY column_name;

