-- Script para agregar campos de validación de usuario
-- Ejecutar en Supabase SQL Editor

-- Agregar campo email para vincular con Supabase Auth
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS email VARCHAR(255),
ADD COLUMN IF NOT EXISTS phone_changed_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS phone_last_changed TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS original_phone_number VARCHAR(50);

-- Crear índices únicos
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email) 
WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_phone ON user_profiles(phone_number);

-- Comentarios
COMMENT ON COLUMN user_profiles.email IS 'Email del usuario (vinculado con Supabase Auth)';
COMMENT ON COLUMN user_profiles.phone_changed_count IS 'Número de veces que se ha cambiado el teléfono (máximo 1)';
COMMENT ON COLUMN user_profiles.phone_last_changed IS 'Fecha del último cambio de teléfono';
COMMENT ON COLUMN user_profiles.original_phone_number IS 'Teléfono original asignado al usuario';

-- Verificar que las columnas se agregaron correctamente
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'user_profiles' 
  AND column_name IN ('email', 'phone_changed_count', 'phone_last_changed', 'original_phone_number')
ORDER BY column_name;

