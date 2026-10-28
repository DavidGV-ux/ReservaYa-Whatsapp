-- Create table for admin broadcast messages
CREATE TABLE IF NOT EXISTS admin_broadcast_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_sent_at TIMESTAMP WITH TIME ZONE,
    sent_count INTEGER DEFAULT 0
);

-- Enable RLS
ALTER TABLE admin_broadcast_messages ENABLE ROW LEVEL SECURITY;

-- Simple policy for admin access (assuming service_role is used for backend)
CREATE POLICY "Allow all for service role" ON admin_broadcast_messages
    FOR ALL USING (true) WITH CHECK (true);

-- Add sample message
INSERT INTO admin_broadcast_messages (title, content)
VALUES ('Bienvenida', '¡Hola! Te damos la bienvenida a Fyn. ¿En qué podemos ayudarte hoy?');
