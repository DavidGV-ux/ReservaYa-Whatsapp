-- CORRECCIÓN CRÍTICA DE CLAVE FORÁNEA
-- El problema es que la tabla 'transactions' está apuntando a la tabla de autenticación 'users',
-- pero debería apuntar a tu tabla personalizada 'user_profiles'.

DO $$
BEGIN
    -- 1. Intentar eliminar la restricción incorrecta si existe
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'transactions_user_id_fkey') THEN
        ALTER TABLE transactions DROP CONSTRAINT transactions_user_id_fkey;
    END IF;

    -- 2. Agregar la restricción correcta apuntando a user_profiles
    ALTER TABLE transactions
    ADD CONSTRAINT transactions_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES user_profiles(id)
    ON DELETE CASCADE;
    
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error al intentar modificar constraints: %', SQLERRM;
END $$;
