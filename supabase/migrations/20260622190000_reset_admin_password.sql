CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Reset admin password and ensure admin user exists
DO $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM auth.users WHERE email = 'admin@buyingaccount.local' LIMIT 1;

  IF v_id IS NOT NULL THEN
    -- User exists, just reset password
    UPDATE auth.users
    SET
      encrypted_password = extensions.crypt('Admin@2026', extensions.gen_salt('bf')),
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      updated_at = now()
    WHERE id = v_id;
  ELSE
    -- Create admin user fresh
    v_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_id, 'authenticated', 'authenticated',
      'admin@buyingaccount.local',
      extensions.crypt('Admin@2026', extensions.gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Super Admin"}'::jsonb,
      false, '', '', '', ''
    );

    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (
      gen_random_uuid(), v_id,
      jsonb_build_object('sub', v_id::text, 'email', 'admin@buyingaccount.local', 'email_verified', true),
      'email', v_id::text, now(), now(), now()
    );
  END IF;

  -- Ensure admin role assigned
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_id, 'admin')
  ON CONFLICT DO NOTHING;
END $$;
