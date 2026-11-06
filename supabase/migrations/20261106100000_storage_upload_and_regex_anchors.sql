-- Security (2026-11-06, found while making the Stori game store template):
-- 1. Two storage policies let ANY signed-in user upload any file to the public product-images
--    bucket (hosted under the store's own address). Admin uploads and customers' own avatars keep
--    their dedicated policies ("Admins can upload to product-images", "Users upload own avatar").
-- 2. Three checks were missing their end anchor, so trailing junk passed: the sign-up username
--    (handle_new_user), the contact form email (submit_contact_message) and the transfer number on
--    a manual balance change (admin_adjust_user_balance). Each function is re-created from its own
--    live definition with only that check changed (grants are kept by CREATE OR REPLACE).

DROP POLICY IF EXISTS "Allow authenticated uploads to product-images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload to product-images" ON storage.objects;

DO $do$
DECLARE
  fixes text[][] := ARRAY[
    ARRAY['public.handle_new_user()',
          $f$v_username !~ '^[a-z][a-z0-9]*' THEN$f$,
          $f$v_username !~ '^[a-z][a-z0-9]*$' THEN$f$],
    ARRAY['public.submit_contact_message(text,text,text,text)',
          $f$v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+' THEN$f$,
          $f$v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN$f$],
    ARRAY['public.admin_adjust_user_balance(uuid,numeric,text,text,text,boolean)',
          $f$v_tx_ref !~ '^#[0-9]+' THEN$f$,
          $f$v_tx_ref !~ '^#[0-9]+$' THEN$f$]
  ];
  i int;
  def text;
  fixed text;
BEGIN
  FOR i IN 1 .. array_length(fixes, 1) LOOP
    def := pg_get_functiondef(fixes[i][1]::regprocedure);
    fixed := replace(def, fixes[i][2], fixes[i][3]);
    IF fixed = def THEN
      RAISE EXCEPTION 'check not found in %', fixes[i][1];
    END IF;
    EXECUTE fixed;
  END LOOP;
END
$do$;
