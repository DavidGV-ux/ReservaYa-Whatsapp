-- Script para crear la tabla de encuestas de satisfacción
-- Ejecutar en el SQL Editor de Supabase

CREATE TABLE IF NOT EXISTS public.product_surveys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id),
    ai_rating INTEGER NOT NULL CHECK (ai_rating >= 1 AND ai_rating <= 5),
    performance_rating INTEGER NOT NULL CHECK (performance_rating >= 1 AND performance_rating <= 5),
    ease_of_use_rating INTEGER NOT NULL CHECK (ease_of_use_rating >= 1 AND ease_of_use_rating <= 5),
    comments TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE public.product_surveys ENABLE ROW LEVEL SECURITY;

-- Política para que los usuarios solo puedan insertar sus propias respuestas
CREATE POLICY "Usuarios pueden insertar su propia encuesta" 
ON public.product_surveys 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Política para que el admin pueda ver todas las respuestas
-- Asumiendo que hay un rol o email específico para el admin
CREATE POLICY "Admin puede ver todas las encuestas" 
ON public.product_surveys 
FOR SELECT 
USING (auth.jwt()->>'email' = 'davidgalvis@fyn.com');
