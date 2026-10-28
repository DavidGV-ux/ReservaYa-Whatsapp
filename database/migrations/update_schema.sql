-- 1. Actualizar user_profiles (Asegurar campos de presupuesto y totales)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'total_monthly_expenses') THEN
        ALTER TABLE user_profiles ADD COLUMN total_monthly_expenses NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'monthly_expenses_budget') THEN
        ALTER TABLE user_profiles ADD COLUMN monthly_expenses_budget NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'current_expenses_year') THEN
        ALTER TABLE user_profiles ADD COLUMN current_expenses_year INT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'current_expenses_month') THEN
        ALTER TABLE user_profiles ADD COLUMN current_expenses_month INT;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS monthly_expense_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES user_profiles(id),
  year INT NOT NULL,
  month INT NOT NULL,
  total NUMERIC NOT NULL,
  currency VARCHAR(10) DEFAULT 'MXN',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monthly_expense_history_user_month
  ON monthly_expense_history(user_id, year, month);

-- 2. Crear tabla transactions si no existe (estructura básica)
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES user_profiles(id),
  amount NUMERIC NOT NULL,
  description TEXT,
  date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Actualizar transactions con columnas nuevas (si la tabla ya existía sin ellas)
DO $$
BEGIN
    -- Agregar currency
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'currency') THEN
        ALTER TABLE transactions ADD COLUMN currency VARCHAR(10) DEFAULT 'MXN';
    END IF;

    -- Agregar receipt_url
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'receipt_url') THEN
        ALTER TABLE transactions ADD COLUMN receipt_url TEXT;
    END IF;

    -- Agregar transaction_type
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'transaction_type') THEN
        ALTER TABLE transactions ADD COLUMN transaction_type VARCHAR(20) CHECK (transaction_type IN ('expense', 'income'));
    END IF;

    -- Agregar metadata
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'metadata') THEN
        ALTER TABLE transactions ADD COLUMN metadata JSONB;
    END IF;

    -- Agregar category_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'category_id') THEN
        ALTER TABLE transactions ADD COLUMN category_id INT;
    END IF;
END $$;

-- 4. Crear índices (solo si las columnas existen, lo cual ya garantizamos arriba)
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(transaction_type);

-- 5. Corregir Foreign Key de transactions para asegurar que apunte a user_profiles
DO $$
BEGIN
    -- Intentar eliminar la constraint si apunta incorrectamente (o para recrearla)
    IF EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'transactions_user_id_fkey' 
        AND table_name = 'transactions'
    ) THEN
        ALTER TABLE transactions DROP CONSTRAINT transactions_user_id_fkey;
    END IF;

    -- Agregar la constraint correcta apuntando a user_profiles
    ALTER TABLE transactions 
    ADD CONSTRAINT transactions_user_id_fkey 
    FOREIGN KEY (user_id) 
    REFERENCES user_profiles(id)
    ON DELETE CASCADE;
END $$;
