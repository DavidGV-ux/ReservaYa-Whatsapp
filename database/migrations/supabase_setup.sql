-- Crear tabla de conversaciones para el chatbot WhatsApp
CREATE TABLE IF NOT EXISTS conversaciones (
  id BIGSERIAL PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  user_name VARCHAR(100),
  mensaje TEXT NOT NULL,
  respuesta TEXT NOT NULL,
  fecha TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear índices para mejorar el rendimiento de las consultas
CREATE INDEX IF NOT EXISTS idx_user_id ON conversaciones(user_id);
CREATE INDEX IF NOT EXISTS idx_fecha ON conversaciones(fecha DESC);

-- Habilitar Row Level Security (RLS) para mayor seguridad
ALTER TABLE conversaciones ENABLE ROW LEVEL SECURITY;

-- Política para permitir insertar registros (opcional, ajusta según tus necesidades)
CREATE POLICY "Enable insert for all users" ON conversaciones
    FOR INSERT WITH CHECK (true);

-- Política para permitir leer registros (opcional, ajusta según tus necesidades)
CREATE POLICY "Enable read for all users" ON conversaciones
    FOR SELECT USING (true);

-- Comentarios para documentar la tabla
COMMENT ON TABLE conversaciones IS 'Tabla para almacenar las conversaciones del chatbot WhatsApp';
COMMENT ON COLUMN conversaciones.user_id IS 'Número de teléfono del usuario';
COMMENT ON COLUMN conversaciones.user_name IS 'Nombre del usuario';
COMMENT ON COLUMN conversaciones.mensaje IS 'Mensaje enviado por el usuario';
COMMENT ON COLUMN conversaciones.respuesta IS 'Respuesta generada por la IA';
COMMENT ON COLUMN conversaciones.fecha IS 'Fecha y hora de la conversación';
