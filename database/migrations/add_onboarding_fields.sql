-- Migration to add onboarding tracking columns to user_profiles
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS onboarding_step INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_onboarding_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS expiry_alert_sent BOOLEAN DEFAULT false;

-- Comment for documentation
COMMENT ON COLUMN user_profiles.onboarding_step IS 'Current step in the 7-day onboarding flow (0-7)';
COMMENT ON COLUMN user_profiles.last_onboarding_at IS 'Timestamp of the last onboarding message sent';
COMMENT ON COLUMN user_profiles.expiry_alert_sent IS 'Whether the subscription expiry alert has been sent';
