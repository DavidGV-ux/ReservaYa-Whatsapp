-- ============================================================================
-- FYN · CONCILIACIÓN DE IDENTIDAD v6 (máxima simplicidad)
-- Mueve el perfil del chat de WhatsApp al id de la cuenta de Supabase Auth
-- re-nombrando el id del perfil (UPDATE user_profiles SET id = auth_id).
--  - Dropea temporalmente las FKs, mueve dependientes por id, y las recrea.
--  - Sin placeholders ni INSERT de columnas: sin conflictos de unicidad.
--  - Las referencias por phone_number (conversaciones) quedan válidas solas:
--    el teléfono no cambia, solo el id de la fila.
--  - Idempotente y ATÓMICO por usuario. LOG en public.fyn_reconcile_log.
-- Pegar TODO el archivo y ejecutar.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fyn_reconcile_log (
    id  BIGSERIAL PRIMARY KEY,
    msg TEXT,
    ts  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
TRUNCATE public.fyn_reconcile_log;

DO $$
DECLARE
    u        record;
    cand     uuid;
    fk       record;
    n        bigint;
BEGIN
    INSERT INTO public.fyn_reconcile_log (msg)
    VALUES ('>>> DO_INICIO v6 en ' || NOW());

    FOR u IN
        SELECT au.id, au.email, au.raw_user_meta_data->>'phone_number' AS meta_phone
        FROM auth.users au
    LOOP
        BEGIN
            IF u.email IS NULL AND u.meta_phone IS NULL THEN CONTINUE; END IF;
            IF EXISTS (SELECT 1 FROM public.user_profiles WHERE id = u.id) THEN CONTINUE; END IF;

            cand := NULL;
            IF u.email IS NOT NULL THEN
                SELECT p.id INTO cand FROM public.user_profiles p
                WHERE p.email = u.email
                ORDER BY (p.monthly_salary IS NOT NULL)::int
                       + (p.fixed_expenses   IS NOT NULL)::int
                       + (length(COALESCE(p.user_name,'')) > 0)::int DESC
                LIMIT 1;
            END IF;
            IF cand IS NULL AND u.meta_phone IS NOT NULL THEN
                SELECT p.id INTO cand FROM public.user_profiles p
                WHERE regexp_replace(COALESCE(p.phone_number,''), '[^0-9]', '', 'g')
                    = regexp_replace(u.meta_phone, '[^0-9]', '', 'g')
                LIMIT 1;
            END IF;
            IF cand IS NULL OR cand = u.id THEN CONTINUE; END IF;

            INSERT INTO public.fyn_reconcile_log (msg)
            VALUES ('candidato '||left(u.id::text,8)||' <- '||left(cand::text,8)||' (mail='||COALESCE(u.email,'NULL')||')');

            BEGIN
                -- 0) inventario de FKs que referencian user_profiles
                DROP TABLE IF EXISTS tk_fks;
                CREATE TEMP TABLE tk_fks (tbl text, conname text, lhs text, rhs text, def text);
                INSERT INTO tk_fks
                SELECT c.conrelid::regclass::text AS tbl,
                       c.conname AS conname,
                       (SELECT a.attname FROM pg_attribute a
                        WHERE a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey) LIMIT 1) AS lhs,
                       (SELECT a.attname FROM pg_attribute a
                        WHERE a.attrelid = c.confrelid AND a.attnum = ANY(c.confkey) LIMIT 1) AS rhs,
                       pg_get_constraintdef(c.oid) AS def
                FROM pg_constraint c
                WHERE c.contype = 'f'
                  AND c.confrelid = 'public.user_profiles'::regclass;

                -- DROP temporal de esas FKs
                FOR fk IN SELECT tbl, conname FROM tk_fks LOOP
                    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', fk.tbl, fk.conname);
                END LOOP;

                -- 1) re-apuntar self-FK (referred_by) si apuntaba al candidato
                UPDATE public.user_profiles SET referred_by = u.id WHERE referred_by = cand;

                -- 2) historial: sin duplicar (user_id, year, month) y mover
                DELETE FROM public.monthly_expense_history d
                USING public.monthly_expense_history k
                WHERE d.user_id = cand AND k.user_id = u.id
                  AND k.year = d.year AND k.month = d.month;
                UPDATE public.monthly_expense_history SET user_id = u.id WHERE user_id = cand;

                -- 3) mover filas que referencian user_profiles ID (hijas → auth id)
                FOR fk IN SELECT tbl, lhs, rhs FROM tk_fks WHERE rhs = 'id' LOOP
                    EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = $2', fk.tbl, fk.lhs, fk.lhs)
                        USING u.id, cand;
                    GET DIAGNOSTICS n = ROW_COUNT;
                    IF n > 0 THEN
                        INSERT INTO public.fyn_reconcile_log (msg)
                        VALUES ('movido por id ' || n || ' filas en ' || fk.tbl);
                    END IF;
                END LOOP;

                -- 4) RENÓMBRAR el perfil del candidato al id de Auth
                UPDATE public.user_profiles SET id = u.id WHERE id = cand;

                -- 5) recrear las FKs idénticas (todo quedó consistente)
                FOR fk IN SELECT tbl, conname, def FROM tk_fks LOOP
                    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', fk.tbl, fk.conname, fk.def);
                END LOOP;

                INSERT INTO public.fyn_reconcile_log (msg)
                VALUES ('CONCILIADO '||left(cand::text,8)||' -> '||left(u.id::text,8)||' (mail='||COALESCE(u.email,'NULL')||')');
            EXCEPTION
                WHEN OTHERS THEN
                    INSERT INTO public.fyn_reconcile_log (msg)
                    VALUES ('OMITIDO error '||left(cand::text,8)||'->'||left(u.id::text,8)||': '||SQLERRM);
            END;
        EXCEPTION
            WHEN OTHERS THEN
                INSERT INTO public.fyn_reconcile_log (msg)
                VALUES ('FALLO OUTER '||left(u.id::text,8)||': '||SQLERRM);
        END;
    END LOOP;

    INSERT INTO public.fyn_reconcile_log (msg) VALUES ('>>> Fin conciliación');
END $$;

-- 2) LOG (tabla visible con lo que pasó)
SELECT id, msg, ts FROM public.fyn_reconcile_log ORDER BY id;

-- 3) Verificación: perfiles que viven en el id de Auth
SELECT id, user_name, email, phone_number, monthly_salary
FROM public.user_profiles
WHERE id IN (SELECT id FROM auth.users)
ORDER BY created_at;

-- 4) Marcador de versión: la última tabla de tu ejecución DEBE decir V6_OK
SELECT 'V6_OK' AS marcador, count(*) AS perfiles_con_historial
FROM public.user_profiles
WHERE id IN (SELECT id FROM auth.users);