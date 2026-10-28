-- Script de reparación final para categorías
-- Ejecutar en el SQL Editor de Supabase

-- 1. Limpiar y recrear con estructura correcta para evitar conflictos de ID y UNIQUE
DO $$
BEGIN
    -- Eliminar la tabla si existe para asegurar una estructura limpia y corregir la secuencia de IDs
    -- PRECAUCIÓN: Esto borrará categorías existentes, pero como estamos poblándolas de nuevo no hay problema.
    DROP TABLE IF EXISTS public.categories CASCADE;
    
    -- Crear la tabla con la restricción UNIQUE necesaria
    CREATE TABLE public.categories (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT categories_name_key UNIQUE (name)
    );
END $$;

-- 2. Habilitar RLS
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- 3. Política de lectura
CREATE POLICY "Allow read for all authenticated users" 
ON public.categories FOR SELECT USING (true);

-- 4. Insertar categorías base
INSERT INTO public.categories (name, icon) VALUES
('Alimentación', '🍕'),
('Transporte', '🚗'),
('Vivienda', '🏠'),
('Salud', '🏥'),
('Entretenimiento', '🎬'),
('Compras', '🛍️'),
('Educación', '📚'),
('Servicios', '⚡'),
('Otros', '✨');

-- 5. Vincular con transacciones si la columna existe
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'category_id') THEN
        ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS fk_transactions_category;
        ALTER TABLE public.transactions 
        ADD CONSTRAINT fk_transactions_category 
        FOREIGN KEY (category_id) 
        REFERENCES public.categories(id)
        ON DELETE SET NULL;
    END IF;
END $$;

-- 5. Asegurar que la columna category_id en transactions apunte a esta tabla
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'category_id') THEN
        -- Intentar agregar la FK si no existe
        IF NOT EXISTS (
            SELECT 1 
            FROM information_schema.table_constraints 
            WHERE constraint_name = 'fk_transactions_category'
        ) THEN
            ALTER TABLE public.transactions 
            ADD CONSTRAINT fk_transactions_category 
            FOREIGN KEY (category_id) 
            REFERENCES public.categories(id);
        END IF;
    END IF;
END $$;
