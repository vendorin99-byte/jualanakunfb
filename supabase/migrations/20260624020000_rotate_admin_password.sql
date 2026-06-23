-- SECURITY: Previous migrations (20260425025811, 20260622190000) committed plaintext admin
-- passwords to git history. This migration invalidates those credentials immediately by
-- setting a new random password. The admin MUST then reset their password via the
-- Supabase dashboard (Authentication → Users → admin@buyingaccount.local → Reset Password).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_id uuid;
  -- Random 32-char password generated at migration time (not a static known value)
  v_random_pwd text := encode(gen_random_bytes(24), 'hex');
BEGIN
  SELECT id INTO v_id FROM auth.users WHERE email = 'admin@buyingaccount.local' LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE auth.users
    SET
      encrypted_password  = extensions.crypt(v_random_pwd, extensions.gen_salt('bf')),
      updated_at          = now()
    WHERE id = v_id;
    -- Store the temporary password in a secure note so admin can retrieve it once
    -- from Supabase dashboard → SQL Editor. After logging in, change immediately.
    RAISE NOTICE 'ADMIN TEMP PASSWORD: % — Change this immediately after login!', v_random_pwd;
  END IF;
END $$;
