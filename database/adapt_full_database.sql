-- ============================================================================
--  FYN · ADAPTA / CORRIGE / CONSOLIDA TODA LA BASE DE DATOS
--  Fecha: 2026-09-09  ·  Ejecutar en el SQL Editor de Supabase
--
--  Diseñado para ser IDEMPOTENTE (se puede ejecutar varias veces).
--  SE BORRAN SOLO: filas de prueba/huérfanas y dependientes de ellas.
--  NO se borran usuarios reales ni su historial.
--
--  Secciones:
--    [1] Crear tablas que el código usa y NO existen
--        (budget_alert_logs, referrals, monthly_feedback_log)
--    [2] Saneamiento: borrar datos de prueba y huérfanos
--    [3] user_profiles: asegurar todas las columnas que usa el código
--    [4] monthly_expense_history: corregir restricciones y columnas
--    [5] transactions: corregir defaults, FK e índices
--    [6] Duplicados por teléfono: fusionar en un solo perfil
--    [7] CONCILIACIÓN DE IDENTIDAD: darle a cada cuenta Auth su perfil
--        (mueve la fila del chat de WhatsApp al id del usuario de Auth)
--    [8] Índices únicos finales (email y teléfono)
--    [9] OPCIONAL (comentado): limpieza de tablas legacy sin uso
-- ============================================================================


-- ============================================================================
-- [1] TABLAS QUE FALTAN (las usa el backend pero no existen en la BD)
-- ============================================================================

-- 1.1) budget_alert_logs  → Services/budgetAlertService.js
CREATE TABLE IF NOT EXISTS public.budget_alert_logs (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    alert_year       INTEGER NOT NULL,
    alert_month      INTEGER NOT NULL,
    alert_level      TEXT NOT NULL,
    percent_at_alert NUMERIC,
    budget_at_alert  NUMERIC,
    spent_at_alert   NUMERIC,
    sent_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (user_id, alert_year, alert_month, alert_level)
);

-- 1.2) referrals  → Services/referralService.js
CREATE TABLE IF NOT EXISTS public.referrals (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    referred_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    reward_type TEXT NOT NULL CHECK (reward_type IN ('3_days_free', '10_percent_discount')),
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (referrer_id, referred_id)
);
CREATE INDEX IF NOT EXISTS idx_referrals_referred  ON public.referrals(referred_id);

-- 1.3) monthly_feedback_log  → Services/monthlyFeedbackService.js::getStats
CREATE TABLE IF NOT EXISTS public.monthly_feedback_log (
    id                 BIGSERIAL PRIMARY KEY,
    user_phone         VARCHAR(50) NOT NULL,
    income             DECIMAL(15, 2),
    fixed_expenses     DECIMAL(15, 2),
    variable_expenses  DECIMAL(15, 2),
    total_expenses     DECIMAL(15, 2),
    savings            DECIMAL(15, 2),
    savings_percentage DECIMAL(5, 2),
    expense_categories TEXT[],
    status             VARCHAR(20) DEFAULT 'sent',
    sent_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feedback_user_phone ON public.monthly_feedback_log(user_phone);
CREATE INDEX IF NOT EXISTS idx_feedback_sent_at    ON public.monthly_feedback_log(sent_at DESC);


-- ============================================================================
-- [2] SANEAMIENTO · borrar datos de prueba y huérfanos
--     (test-flow@fyn.ai, teléfonos dummy, transacciones sin usuario)
-- ============================================================================

DO $$
DECLARE
    test_ids uuid[] := ARRAY(
        SELECT id FROM public.user_profiles
        WHERE  email ILIKE '%@fyn.ai'
           OR  email ILIKE '%@test%'
           OR  email ILIKE 'test%@%'
           OR  phone_number IN ('1234567890','99999999999','0000000000','00000000000')
           OR  user_name ILIKE 'Usuario de prueba%'
           OR  user_name ILIKE 'Test%'
    );
BEGIN
    IF array_length(test_ids, 1) IS NULL THEN
        RAISE NOTICE '[2] No se encontraron perfiles de prueba';
        RETURN;
    END IF;

    -- dependientes de esos perfiles (baja de huérfanos)
    DELETE FROM public.transactions           WHERE user_id = ANY(test_ids);
    DELETE FROM public.monthly_expense_history WHERE user_id = ANY(test_ids);
    DELETE FROM public.financial_health_scores WHERE user_id = ANY(test_ids);
    DELETE FROM public.product_surveys         WHERE user_id = ANY(test_ids);
    DELETE FROM public.recommendations         WHERE user_id = ANY(test_ids);
    DELETE FROM public.savings_goals           WHERE user_id = ANY(test_ids);
    DELETE FROM public.budget_alert_logs       WHERE user_id = ANY(test_ids);
    DELETE FROM public.referrals               WHERE referrer_id = ANY(test_ids) OR referred_id = ANY(test_ids);

    -- referred_by puede no existir aún (se crea en [3]): limpiarlo solo si la columna existe
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'user_profiles' AND column_name = 'referred_by'
    ) THEN
        UPDATE public.user_profiles SET referred_by = NULL WHERE referred_by = ANY(test_ids);
    END IF;

    DELETE FROM public.user_profiles WHERE id = ANY(test_ids);
    RAISE NOTICE '[2] % perfil(es) de prueba eliminados', array_length(test_ids, 1);
END $$;

-- Transacciones / historial huérfanos (sin perfil válido)
DELETE FROM public.transactions t
WHERE t.user_id IS NULL
   OR NOT EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = t.user_id);

DELETE FROM public.monthly_expense_history m
WHERE m.user_id IS NULL
   OR NOT EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = m.user_id);

DELETE FROM public.financial_health_scores f
WHERE f.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = f.user_id);

DELETE FROM public.product_surveys s
WHERE s.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = s.user_id);

DELETE FROM public.recommendations r
WHERE r.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = r.user_id);

DELETE FROM public.savings_goals g
WHERE g.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = g.user_id);


-- ============================================================================
-- [3] user_profiles · asegurar TODAS las columnas que usa el código + índices
-- ============================================================================

ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS user_name            TEXT;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS phone_number         VARCHAR(20);
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS email                VARCHAR(255);
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS country              TEXT;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS currency             VARCHAR(10) DEFAULT 'COP';
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS monthly_salary       NUMERIC DEFAULT 0;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS fixed_expenses       DECIMAL(15,2) DEFAULT 0;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS subscription_active         BOOLEAN DEFAULT false;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS subscription_start_date     TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS subscription_end_date       TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS subscription_manual_override BOOLEAN DEFAULT false;

ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS referral_code           TEXT;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS referred_by             UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS referral_discount_pending BOOLEAN DEFAULT false;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS last_referral_reward_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS phone_changed_count    INTEGER DEFAULT 0;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS phone_last_changed     TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS original_phone_number  VARCHAR(50);

ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS onboarding_step   INTEGER DEFAULT 0;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS last_onboarding_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS expiry_alert_sent  BOOLEAN DEFAULT false;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS language           VARCHAR(10) DEFAULT 'es';

ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS total_monthly_expenses NUMERIC DEFAULT 0;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS monthly_expenses_budget NUMERIC DEFAULT 0;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS current_expenses_year  INTEGER;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS current_expenses_month INTEGER;

CREATE INDEX IF NOT EXISTS idx_user_profiles_subscription_active ON public.user_profiles(subscription_active) WHERE subscription_active = true;
CREATE INDEX IF NOT EXISTS idx_user_profiles_subscription_end    ON public.user_profiles(subscription_end_date);
CREATE INDEX IF NOT EXISTS idx_user_profiles_referred_by         ON public.user_profiles(referred_by);


-- ============================================================================
-- [4] monthly_expense_history · corregir columnas y restricciones de unicidad
--     (debe haber UNA única compuesta por (user_id, year, month), nunca una
--      única por columna suelta, que impediría guardar más de un mes)
-- ============================================================================

ALTER TABLE public.monthly_expense_history ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

DO $$
DECLARE c record;
BEGIN
    -- única compuesta (ya existía en producción)
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'monthly_expense_history_user_month_unique'
          AND conrelid = 'public.monthly_expense_history'::regclass
    ) THEN
        ALTER TABLE public.monthly_expense_history
        ADD CONSTRAINT monthly_expense_history_user_month_unique UNIQUE (user_id, year, month);
        RAISE NOTICE '[4] Unicidad compuesta (user_id, year, month) creada';
    END IF;

    -- eliminar cualquier unique de UNA sola columna suelta (user_id, year o month)
    FOR c IN
        SELECT conname, conkey
        FROM pg_constraint
        WHERE conrelid = 'public.monthly_expense_history'::regclass
          AND contype = 'u'
    LOOP
        IF coalesce(array_length(c.conkey, 1), 0) = 1 THEN
            EXECUTE format('ALTER TABLE public.monthly_expense_history DROP CONSTRAINT %I', c.conname);
            RAISE NOTICE '[4] Unique suelto eliminado: %', c.conname;
        END IF;
    END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_monthly_expense_history_user_month
    ON public.monthly_expense_history(user_id, year, month);


-- ============================================================================
-- [5] transactions · corregir defaults, FK e índices
-- ============================================================================

ALTER TABLE public.transactions ALTER COLUMN currency         SET DEFAULT 'COP';
ALTER TABLE public.transactions ALTER COLUMN transaction_type SET DEFAULT 'expense';

-- FK a user_profiles con borrado en cascada (como define update_schema.sql)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'transactions_user_id_fkey'
          AND table_name = 'transactions'
    ) THEN
        ALTER TABLE public.transactions DROP CONSTRAINT transactions_user_id_fkey;
    END IF;

    ALTER TABLE public.transactions
    ADD CONSTRAINT transactions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;
END $$;

-- FK a categories si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'transactions'
          AND constraint_type = 'FOREIGN KEY'
          AND constraint_name LIKE '%category%'
    ) THEN
        ALTER TABLE public.transactions
        ADD CONSTRAINT transactions_category_id_fkey
        FOREIGN KEY (category_id) REFERENCES public.categories(id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON public.transactions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_type      ON public.transactions(transaction_type);


-- ============================================================================
-- [6] FUSIÓN DE DUPLICADOS POR TELÉFONO
--     Si hay 2+ perfiles con el mismo teléfono, se conserva el que tiene más
--     datos y se mueve el historial/dependientes del resto hacia él.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fyn_merge_profiles(p_drop uuid, p_keep uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    IF p_drop IS NULL OR p_keep IS NULL OR p_drop = p_keep THEN RETURN; END IF;

    -- Si el destino no existe, solo renombramos el id (sin dependientes que reposicionar)
    IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = p_keep) THEN
        UPDATE public.user_profiles SET id = p_keep WHERE id = p_drop;
        RETURN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = p_drop) THEN RETURN; END IF;

    -- Mover dependientes hacia el perfil que se conserva
    UPDATE public.transactions           SET user_id = p_keep WHERE user_id = p_drop;
    UPDATE public.financial_health_scores SET user_id = p_keep WHERE user_id = p_drop;
    UPDATE public.product_surveys         SET user_id = p_keep WHERE user_id = p_drop;
    UPDATE public.recommendations         SET user_id = p_keep WHERE user_id = p_drop;
    UPDATE public.savings_goals           SET user_id = p_keep WHERE user_id = p_drop;
    UPDATE public.budget_alert_logs       SET user_id = p_keep WHERE user_id = p_drop;
    UPDATE public.referrals               SET referrer_id = p_keep WHERE referrer_id = p_drop;
    UPDATE public.referrals               SET referred_id = p_keep WHERE referred_id = p_drop;
    UPDATE public.user_profiles           SET referred_by = p_keep WHERE referred_by = p_drop;

    -- monthly_expense_history: descartar el mes si ya existe en el destino (no duplicar)
    DELETE FROM public.monthly_expense_history d
    USING public.monthly_expense_history k
    WHERE d.user_id = p_drop AND k.user_id = p_keep
      AND k.year = d.year AND k.month = d.month;
    UPDATE public.monthly_expense_history SET user_id = p_keep WHERE user_id = p_drop;

    -- Completar campos vacíos del perfil conservado con los del eliminado
    UPDATE public.user_profiles m
    SET phone_number             = COALESCE(m.phone_number,             d.phone_number),
        email                    = COALESCE(m.email,                    d.email),
        user_name                = COALESCE(m.user_name,                d.user_name),
        currency                 = COALESCE(m.currency,                 d.currency),
        country                  = COALESCE(m.country,                  d.country),
        monthly_salary           = COALESCE(m.monthly_salary,           d.monthly_salary),
        fixed_expenses           = COALESCE(m.fixed_expenses,           d.fixed_expenses),
        referral_code            = COALESCE(NULLIF(m.referral_code,''), NULLIF(d.referral_code,'')),
        referral_discount_pending = m.referral_discount_pending OR d.referral_discount_pending
    FROM public.user_profiles d
    WHERE m.id = p_keep AND d.id = p_drop;

    DELETE FROM public.user_profiles WHERE id = p_drop;
END $$;

DO $$
DECLARE r record;
        keep_id  uuid;
        drop_ids uuid[];
BEGIN
    FOR r IN
        SELECT p.phone_number
        FROM public.user_profiles p
        WHERE p.phone_number IS NOT NULL AND length(trim(p.phone_number)) >= 6
        GROUP BY p.phone_number
        HAVING count(*) > 1
    LOOP
        -- Conservar el perfil con más datos en campos clave
        SELECT p.id INTO keep_id
        FROM public.user_profiles p
        WHERE p.phone_number = r.phone_number
        ORDER BY (p.monthly_salary IS NOT NULL)::int
               + (p.fixed_expenses  IS NOT NULL)::int
               + (length(COALESCE(p.email,''))    > 0)::int
               + (length(COALESCE(p.user_name,'')) > 0)::int DESC,
                 p.created_at ASC
        LIMIT 1;

        SELECT array_agg(id) INTO drop_ids
        FROM public.user_profiles
        WHERE phone_number = r.phone_number AND id <> keep_id;

        IF drop_ids IS NOT NULL THEN
            FOR i IN array_lower(drop_ids,1) .. array_upper(drop_ids,1) LOOP
                PERFORM public.fyn_merge_profiles(drop_ids[i], keep_id);
            END LOOP;
            RAISE NOTICE '[6] Teléfono % fusionado en %', r.phone_number, keep_id;
        END IF;
    END LOOP;
END $$;


-- ============================================================================
-- [7] CONCILIACIÓN DE IDENTIDAD (Auth ↔ perfil)
--     PROBLEMA: la fila creada por el chat de WhatsApp tiene un id distinto
--     al de la cuenta de Supabase Auth (ej. David: 5f6cf796 vs 332f5ed6).
--     Resultado: al entrar al front no se encontraba el perfil por id y se
--     redirigía a "actualizar datos"; y los endpoints rechazaban con 403.
--
--     SOLUCIÓN: para cada usuario de auth.users que tiene un perfil vinculable
--     por EMAIL (o por teléfono de metadata), se mueve ese perfil al id de
--     Auth (junto con su historial). Un solo perfil por cuenta.
--
--     Aplicar SOLO si quieres que el id del perfil sea EXACTAMENTE el de Auth.
--     El código ya funciona con vínculo por email (compatibilidad), esto lo deja 100% alineado.
-- ============================================================================

DO $$
DECLARE
    u    record;
    cand uuid;
    fk   record;
BEGIN
    -- Inventario de las FKs que referencian user_profiles. Las soltamos un
    -- momento (renombrar id / borrar filas no choca con el FK) y las recreamos
    -- idénticas al final. El teléfono NUNCA cambia: conversaciones queda viva.
    DROP TABLE IF EXISTS tk_fks;
    CREATE TEMP TABLE tk_fks (tbl text, conname text, lhs text, rhs text, def text);
    INSERT INTO tk_fks
    SELECT c.conrelid::regclass::text AS tbl,
           c.conname,
           (SELECT a.attname FROM pg_attribute a
            WHERE a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey) LIMIT 1) AS lhs,
           (SELECT a.attname FROM pg_attribute a
            WHERE a.attrelid = c.confrelid AND a.attnum = ANY(c.confkey) LIMIT 1) AS rhs,
           pg_get_constraintdef(c.oid)
    FROM pg_constraint c
    WHERE c.contype = 'f' AND c.confrelid = 'public.user_profiles'::regclass;

    FOR fk IN SELECT tbl, conname FROM tk_fks LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', fk.tbl, fk.conname);
    END LOOP;

    FOR u IN
        SELECT au.id, au.email, au.raw_user_meta_data->>'phone_number' AS meta_phone
        FROM auth.users au
    LOOP
        BEGIN
            IF u.email IS NULL AND u.meta_phone IS NULL THEN CONTINUE; END IF;

            -- candidato por email (perfil real del chat), nunca el ya alineado
            cand := NULL;
            IF u.email IS NOT NULL THEN
                SELECT p.id INTO cand FROM public.user_profiles p
                WHERE p.email = u.email AND p.id <> u.id
                ORDER BY (p.monthly_salary IS NOT NULL)::int
                       + (p.fixed_expenses   IS NOT NULL)::int
                       + (length(COALESCE(p.user_name,'')) > 0)::int DESC
                LIMIT 1;
            END IF;

            -- candidato por teléfono de la metadata de auth
            IF cand IS NULL AND u.meta_phone IS NOT NULL THEN
                SELECT p.id INTO cand FROM public.user_profiles p
                WHERE regexp_replace(COALESCE(p.phone_number,''), '[^0-9]', '', 'g') = regexp_replace(u.meta_phone, '[^0-9]', '', 'g')
                  AND p.id <> u.id
                LIMIT 1;
            END IF;

            IF cand IS NULL THEN CONTINUE; END IF;

            -- re-apuntar self-FK (referred_by) si apuntaba al candidato
            UPDATE public.user_profiles SET referred_by = u.id WHERE referred_by = cand;

            -- historial: sin duplicar (user_id, year, month) y mover
            DELETE FROM public.monthly_expense_history d
            USING public.monthly_expense_history k
            WHERE d.user_id = cand AND k.user_id = u.id
              AND k.year = d.year AND k.month = d.month;
            UPDATE public.monthly_expense_history SET user_id = u.id WHERE user_id = cand;

            -- mover filas que referencian user_profiles por ID (hijas → auth id)
            FOR fk IN SELECT tbl, lhs, rhs FROM tk_fks WHERE rhs = 'id' LOOP
                EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = $2', fk.tbl, fk.lhs, fk.lhs)
                    USING u.id, cand;
            END LOOP;

            IF EXISTS (SELECT 1 FROM public.user_profiles WHERE id = u.id) THEN
                -- ya existe la fila del signup: fusionar (solo campos vacíos) y borrar el chat
                UPDATE public.user_profiles m
                SET phone_number             = COALESCE(m.phone_number, d.phone_number),
                    email                    = COALESCE(m.email, d.email),
                    user_name                = COALESCE(m.user_name, d.user_name),
                    currency                 = COALESCE(m.currency, d.currency),
                    country                  = COALESCE(m.country, d.country),
                    monthly_salary           = COALESCE(m.monthly_salary, d.monthly_salary),
                    fixed_expenses           = COALESCE(m.fixed_expenses, d.fixed_expenses),
                    referral_code            = COALESCE(NULLIF(m.referral_code,''), NULLIF(d.referral_code,'')),
                    referral_discount_pending = m.referral_discount_pending OR d.referral_discount_pending
                FROM public.user_profiles d
                WHERE m.id = u.id AND d.id = cand;
                DELETE FROM public.user_profiles WHERE id = cand;
                RAISE NOTICE '[7] Fusionado dentro de % (origen %)', u.id, cand;
            ELSE
                -- no existe la fila auth: renombrar el id del perfil del chat
                UPDATE public.user_profiles SET id = u.id WHERE id = cand;
                RAISE NOTICE '[7] Identidad conciliada: %→% (email: %)', cand, u.id, COALESCE(u.email,'');
            END IF;
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE '[7] Omitido por error: %→% → %', cand, u.id, SQLERRM;
        END;
    END LOOP;

    -- recrear las FKs idénticas (todo quedó consistente: ningún teléfono cambió)
    FOR fk IN SELECT tbl, conname, def FROM tk_fks LOOP
        EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', fk.tbl, fk.conname, fk.def);
    END LOOP;
END $$;


-- ============================================================================
-- [8] ÍNDICES ÚNICOS FINALES (después de fusiones y conciliación)
--     Solo se crean si NO existe ya un índice único sobre esa columna
--     (evita duplicados cuando el esquema base ya trae sus propios constraints).
-- ============================================================================

DO $$
DECLARE c record;
BEGIN
    FOR c IN
        SELECT *
        FROM (VALUES
            ('phone_number',    'idx_user_profiles_phone',          'WHERE phone_number IS NOT NULL AND length(trim(phone_number)) >= 6'),
            ('email',           'idx_user_profiles_email',          'WHERE email IS NOT NULL'),
            ('referral_code',   'idx_user_profiles_referral_code',  'WHERE referral_code IS NOT NULL')
        ) v(col, idx, wh)
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM pg_index i
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
            WHERE i.indrelid = 'public.user_profiles'::regclass
              AND i.indisunique = true
              AND a.attname = c.col
        ) THEN
            EXECUTE format('CREATE UNIQUE INDEX %I ON public.user_profiles(%I) %s', c.idx, c.col, c.wh);
        END IF;
    END LOOP;
END $$;


-- ============================================================================
-- [9] OPCIONAL · Tablas legacy que el código ya NO usa
--     'profiles' es la plantilla por defecto de Supabase. Si confirmas que
--     nadie la consulta, puedes eliminarla descomentando las líneas:
-- ============================================================================

-- DO $$
-- DECLARE
--     home_duplicates integer;
--     refs integer;
-- BEGIN
--     SELECT count(*) INTO refs
--     FROM information_schema.table_constraints tc
--     JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
--     WHERE tc.table_name = 'profiles' AND ccu.table_name <> 'profiles';
--     IF refs > 0 THEN
--         RAISE NOTICE '[9] profiles tiene % referencias externas; no se elimina', refs;
--     ELSE
--         -- DROP TABLE public.profiles;
--         RAISE NOTICE '[9] profiles candidata a eliminarse (descomenta el DROP tras confirmar)';
--     END IF;
-- END $$;

-- Fin del script de adaptación