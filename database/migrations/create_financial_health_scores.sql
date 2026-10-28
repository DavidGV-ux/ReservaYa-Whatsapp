-- ============================================================
-- MIGRACIÓN: FYN Financial Health Score
-- Tabla: financial_health_scores
-- ============================================================

-- Eliminar tabla si existe (reinicio limpio)
DROP TABLE IF EXISTS financial_health_scores CASCADE;

CREATE TABLE IF NOT EXISTS financial_health_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Asociación: puede venir de auth (user_id) o del chatbot (phone_number)
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  phone_number TEXT,
  -- Datos del test
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_points INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 0,
  level VARCHAR(20) NOT NULL DEFAULT 'Regular',
  -- Desglose por categoría (para coaching)
  category_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Re-test
  attempt_count INTEGER NOT NULL DEFAULT 1,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices por si queremos filtrar por usuario / teléfono
CREATE INDEX IF NOT EXISTS idx_fhs_user_id ON financial_health_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_fhs_phone_number ON financial_health_scores(phone_number);

-- RLS (Row Level Security)
ALTER TABLE financial_health_scores ENABLE ROW LEVEL SECURITY;

-- Usuarios autenticados ven y modifican sus propias filas
DROP POLICY IF EXISTS fhs_user_select ON financial_health_scores;
CREATE POLICY fhs_user_select ON financial_health_scores
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS fhs_user_insert ON financial_health_scores;
CREATE POLICY fhs_user_insert ON financial_health_scores
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS fhs_user_update ON financial_health_scores;
CREATE POLICY fhs_user_update ON financial_health_scores
  FOR UPDATE USING (auth.uid() = user_id);

-- El anon key NO debe acceder directamente (todo pasa por API)
-- Se deja sin policy para anon, por lo tanto denegado por defecto.

-- ============================================================
-- Agregar columna de score al perfil para acceso rápido
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='user_profiles' AND column_name='financial_health_score') THEN
    ALTER TABLE user_profiles ADD COLUMN financial_health_score INTEGER DEFAULT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='user_profiles' AND column_name='financial_health_level') THEN
    ALTER TABLE user_profiles ADD COLUMN financial_health_level VARCHAR(20) DEFAULT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='user_profiles' AND column_name='financial_health_updated_at') THEN
    ALTER TABLE user_profiles ADD COLUMN financial_health_updated_at TIMESTAMPTZ DEFAULT NULL;
  END IF;
END $$;

COMMENT ON TABLE financial_health_scores IS 'Resultados del Test FYN Financial Health Score (10 preguntas, max 40 puntos).';
COMMENT ON COLUMN user_profiles.financial_health_score IS 'Score 0-100 (caché del último test).';
COMMENT ON COLUMN user_profiles.financial_health_level IS 'Nivel: Crítico / Regular / Buena / Excelente.';
