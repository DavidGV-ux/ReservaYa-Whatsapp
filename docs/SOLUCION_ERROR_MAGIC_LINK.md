# 🔧 Solución: Error "Database error saving new user" con Magic Link

## 📋 Problema

Al intentar enviar un magic link desde el frontend, se produce un error 500 con el mensaje:
```
Database error saving new user
```

## 🔍 Causa

El error ocurre porque:
1. El frontend estaba usando la tabla `profiles` pero el backend usa `user_profiles`
2. No existe un trigger en Supabase que cree automáticamente un perfil en `user_profiles` cuando se crea un nuevo usuario en `auth.users`
3. Supabase intenta crear el usuario pero falla al intentar crear el perfil asociado

## ✅ Solución

### Paso 1: Ejecutar el script SQL en Supabase

1. Ve a tu proyecto en [Supabase Dashboard](https://app.supabase.com)
2. Navega a **SQL Editor**
3. Abre el archivo `FYN/create_auth_trigger.sql`
4. Copia y pega todo el contenido en el editor SQL
5. Ejecuta el script (botón "Run" o `Ctrl/Cmd + Enter`)

Este script:
- Crea una función `handle_new_user()` que se ejecuta automáticamente cuando se crea un nuevo usuario
- Crea un trigger que vincula la función con la creación de usuarios en `auth.users`
- Inserta un perfil básico en `user_profiles` con los datos del usuario

### Paso 2: Verificar que el trigger se creó correctamente

Después de ejecutar el script, deberías ver:
- ✅ Un trigger llamado `on_auth_user_created` en la tabla `auth.users`
- ✅ Una función llamada `handle_new_user()` en el esquema `public`

### Paso 3: Verificar la estructura de la tabla `user_profiles`

Asegúrate de que la tabla `user_profiles` tenga:
- Una columna `id` de tipo UUID (debe coincidir con `auth.users.id`)
- Una columna `email` de tipo VARCHAR
- Una columna `user_name` de tipo VARCHAR
- Columnas `created_at` y `updated_at` de tipo TIMESTAMP

Si falta alguna columna, ejecuta los scripts SQL correspondientes:
- `add_user_validation_fields.sql` - Agrega campos de validación
- `add_subscription_fields.sql` - Agrega campos de suscripción
- `add_language_column.sql` - Agrega campo de idioma
- `add_client_study_fields.sql` - Agrega campos del estudio inicial

### Paso 4: Verificar URLs de redirección en Supabase

1. Ve a **Authentication** → **URL Configuration**
2. Añade estas URLs a "Redirect URLs":
   - `https://d1exfqj410k21e.cloudfront.net/account`
   - `https://d1exfqj410k21e.cloudfront.net/auth-callback`
   - `http://localhost:4200/account` (para desarrollo)
   - `http://localhost:4200/auth-callback` (para desarrollo)

### Paso 5: Verificar que el Email Provider esté habilitado

1. Ve a **Authentication** → **Providers** → **Email**
2. Asegúrate de que "Enable Email Provider" esté activado

## 🔄 Cambios Realizados en el Código

### Frontend (`fYN-FRONT/src/app/services/auth.ts`)

- ✅ Cambiado de tabla `profiles` a `user_profiles`
- ✅ Mapeo entre `user_name` (BD) y `username` (frontend)
- ✅ Mejorado manejo de errores para el error 500

### Backend

- ✅ Script SQL para crear trigger automático (`create_auth_trigger.sql`)

## 🧪 Prueba

1. Intenta enviar un magic link desde el frontend
2. Deberías recibir el email sin errores
3. Al hacer clic en el enlace, deberías ser redirigido a `/account`
4. El perfil debería crearse automáticamente en `user_profiles`

## ⚠️ Notas Importantes

- El trigger usa `SECURITY DEFINER` para ejecutarse con permisos elevados
- El trigger tiene manejo de errores: si falla la creación del perfil, no falla la creación del usuario
- El trigger usa `ON CONFLICT DO UPDATE` para actualizar el email si el perfil ya existe

## 🐛 Si el Error Persiste

1. **Revisa los logs de Supabase:**
   - Ve a **Logs** → **Postgres Logs**
   - Busca errores relacionados con `handle_new_user`

2. **Verifica la estructura de la tabla:**
   ```sql
   SELECT column_name, data_type 
   FROM information_schema.columns 
   WHERE table_name = 'user_profiles';
   ```

3. **Verifica que el trigger existe:**
   ```sql
   SELECT * FROM information_schema.triggers 
   WHERE trigger_name = 'on_auth_user_created';
   ```

4. **Verifica que la función existe:**
   ```sql
   SELECT * FROM information_schema.routines 
   WHERE routine_name = 'handle_new_user';
   ```

## 📝 Archivos Modificados

- `FYN/create_auth_trigger.sql` - Script SQL para crear el trigger
- `fYN-FRONT/src/app/services/auth.ts` - Actualizado para usar `user_profiles`
- `fYN-FRONT/src/app/components/account/account.ts` - Mapeo de `user_name` a `username`

