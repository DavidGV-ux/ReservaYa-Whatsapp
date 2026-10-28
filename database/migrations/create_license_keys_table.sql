-- Script para crear la tabla de licencias
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS license_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key_code TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('available', 'pending', 'used')) DEFAULT 'available',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    activated_at TIMESTAMP WITH TIME ZONE,
    activated_by TEXT -- Se guarda el número de teléfono del usuario
);

-- Crear índices para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_license_keys_status ON license_keys(status);
CREATE INDEX IF NOT EXISTS idx_license_keys_code ON license_keys(key_code);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_license_keys_updated_at
    BEFORE UPDATE ON license_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insertar algunas claves de prueba (Opcional, se pueden generar más)
INSERT INTO license_keys (key_code) VALUES 
('FYN-START-2024'),
('FYN-PRO-15DAYS'),
('FYN-WELCOME-01'),
('FYN-TRIAL-CODE'),
('FYN-GIFT-2025')
ON CONFLICT DO NOTHING;
