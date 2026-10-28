-- Migration: Sistema de Referidos
-- Agrega campos necesarios a user_profiles y crea tabla de referidos

-- 1. Campos adicionales en user_profiles
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES public.user_profiles(id),
ADD COLUMN IF NOT EXISTS referral_discount_pending BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS last_referral_reward_at TIMESTAMP WITH TIME ZONE;

-- 2. Crear tabla de historial de referidos
CREATE TABLE IF NOT EXISTS public.referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id UUID NOT NULL REFERENCES public.user_profiles(id),
    referred_id UUID NOT NULL REFERENCES public.user_profiles(id),
    reward_type TEXT NOT NULL CHECK (reward_type IN ('3_days_free', '10_percent_discount')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(referrer_id, referred_id)
);

-- 3. Función para generar código de referido aleatorio
CREATE OR REPLACE FUNCTION generate_referral_code() RETURNS TEXT AS $$
DECLARE
    chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    result TEXT := '';
    i INTEGER := 0;
BEGIN
    FOR i IN 1..6 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 4. Asignar códigos a usuarios existentes que no tengan uno
UPDATE public.user_profiles 
SET referral_code = generate_referral_code() 
WHERE referral_code IS NULL;
