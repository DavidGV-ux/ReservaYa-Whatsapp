-- Script para agregar el campo 'language' a la tabla user_profiles
-- Ejecutar en Supabase SQL Editor

-- Agregar columna 'language' si no existe
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS language VARCHAR(10);

-- Comentario para documentar la columna
COMMENT ON COLUMN user_profiles.language IS 'Código de idioma ISO 639-1 del usuario (es, en, pt, fr, it, de, etc.)';

-- Verificar que la columna se agregó correctamente
SELECT 
    column_name, 
    data_type, 
    character_maximum_length,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'user_profiles' 
  AND column_name = 'language';

