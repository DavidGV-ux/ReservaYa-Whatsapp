-- Script para crear trigger que crea perfil en user_profiles cuando se crea un usuario en auth.users
-- Ejecutar en Supabase SQL Editor
-- IMPORTANTE: Este script resuelve el error "Database error saving new user" al crear usuarios con magic link

-- 1. Primero, verificar si existe una función/trigger anterior y eliminarla
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- 2. Crear función que se ejecuta cuando se crea un nuevo usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  existing_id UUID;
  meta_user_name TEXT;
  meta_phone TEXT;
  meta_country TEXT;
  meta_currency TEXT;
  meta_salary NUMERIC;
  meta_expenses NUMERIC;
BEGIN
  -- 1. Extraer metadatos con COALESCE para evitar nulos
  meta_user_name := COALESCE(NEW.raw_user_meta_data->>'user_name', NEW.raw_user_meta_data->>'username', '');
  meta_phone := NEW.raw_user_meta_data->>'phone_number';
  meta_country := NEW.raw_user_meta_data->>'country';
  meta_currency := NEW.raw_user_meta_data->>'currency';
  meta_salary := (NEW.raw_user_meta_data->>'monthly_salary')::NUMERIC;
  meta_expenses := (NEW.raw_user_meta_data->>'fixed_expenses')::NUMERIC;

  -- 2. Buscar si ya existe un perfil con este email o teléfono (para migración)
  SELECT id INTO existing_id 
  FROM public.user_profiles 
  WHERE email = NEW.email 
     OR (phone_number = meta_phone AND meta_phone IS NOT NULL)
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    -- 3. Si existe, actualizar el registro existente con el nuevo ID de Auth
    -- Esto vincula el perfil previo (chatbot o web) con el nuevo usuario de Auth
    UPDATE public.user_profiles SET
      id = NEW.id,  -- Sincronizar ID con Auth
      email = NEW.email,
      user_name = CASE WHEN user_name = '' OR user_name IS NULL THEN meta_user_name ELSE user_name END,
      phone_number = COALESCE(phone_number, meta_phone),
      country = COALESCE(country, meta_country),
      currency = COALESCE(currency, meta_currency),
      monthly_salary = COALESCE(monthly_salary, meta_salary),
      fixed_expenses = COALESCE(fixed_expenses, meta_expenses),
      updated_at = NOW()
    WHERE id = existing_id;
  ELSE
    -- 4. Si no existe, insertar un nuevo perfil
    INSERT INTO public.user_profiles (
      id,
      email,
      user_name,
      phone_number,
      country,
      currency,
      monthly_salary,
      fixed_expenses,
      created_at,
      updated_at,
      subscription_active,
      phone_changed_count
    )
    VALUES (
      NEW.id,
      NEW.email,
      meta_user_name,
      meta_phone,
      meta_country,
      meta_currency,
      COALESCE(meta_salary, 0),
      COALESCE(meta_expenses, 0),
      NOW(),
      NOW(),
      false,
      0
    );
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Capturar cualquier error (como duplicados de teléfono) para no bloquear el registro
    -- El perfil se puede crear/arreglar después en el primer login
    RAISE WARNING 'Error en handle_new_user para %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Crear trigger que se activa cuando se inserta un nuevo usuario en auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 3. Verificar que la función y el trigger se crearon correctamente
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';

-- 4. Verificar que la función existe
SELECT 
  routine_name,
  routine_type,
  security_type
FROM information_schema.routines
WHERE routine_name = 'handle_new_user';

