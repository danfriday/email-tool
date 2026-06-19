-- =====================================================================
--  Seed the default admin login into Supabase Auth.
--
--  Login at /login with:
--    Email:    admin@rccglp20youths.com
--    Password: Rccglp20youths!
--
--  The login form's field is type="email", so use the full address above
--  (the "username" is the admin@rccglp20youths.com local part).
--
--  Idempotent: re-running resets the password to the value below instead
--  of creating a duplicate. Change the password after first sign-in.
-- =====================================================================

do $$
declare
  v_user_id  uuid;
  v_email    text := 'admin@rccglp20youths.com';
  v_password text := 'Rccglp20youths!';
begin
  select id into v_user_id from auth.users where email = v_email;

  if v_user_id is not null then
    -- Already exists: just (re)set the password and confirm the email.
    update auth.users
       set encrypted_password = crypt(v_password, gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           updated_at         = now()
     where id = v_user_id;
    raise notice 'Admin % already existed — password reset.', v_email;
    return;
  end if;

  v_user_id := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_user_id, 'authenticated', 'authenticated', v_email,
    crypt(v_password, gen_salt('bf')),
    now(),
    now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    '', '', '', ''
  );

  -- Identity row is required for email/password sign-in to work.
  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_user_id, v_user_id::text,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  raise notice 'Created admin user % (id %)', v_email, v_user_id;
end $$;
