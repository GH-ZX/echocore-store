-- =============================================================================
-- Contact message in-app conversation (admin ↔ customer)
-- Apply: supabase db query --linked -f scripts/contact-replies-migration.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.contact_message_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_message_id uuid NOT NULL REFERENCES public.contact_messages(id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('admin', 'user')),
  sender_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_message_replies_thread_idx
  ON public.contact_message_replies (contact_message_id, created_at ASC);

ALTER TABLE public.contact_message_replies ENABLE ROW LEVEL SECURITY;

-- Users may read their own contact form rows (registered submitters)
DROP POLICY IF EXISTS "Users read own contact messages" ON public.contact_messages;
CREATE POLICY "Users read own contact messages" ON public.contact_messages
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- Replies: admin full access; users read/write only on their threads
DROP POLICY IF EXISTS "Admins manage contact replies" ON public.contact_message_replies;
CREATE POLICY "Admins manage contact replies" ON public.contact_message_replies
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Users read own contact replies" ON public.contact_message_replies;
CREATE POLICY "Users read own contact replies" ON public.contact_message_replies
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.contact_messages cm
      WHERE cm.id = contact_message_id
        AND cm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users insert own contact replies" ON public.contact_message_replies;
CREATE POLICY "Users insert own contact replies" ON public.contact_message_replies
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_role = 'user'
    AND sender_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.contact_messages cm
      WHERE cm.id = contact_message_id
        AND cm.user_id = auth.uid()
        AND cm.status <> 'archived'
    )
  );

-- ---------------------------------------------------------------------------
-- Fetch thread (message + replies) for admin or owning user
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_contact_thread(p_message_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_msg public.contact_messages%ROWTYPE;
  v_replies jsonb;
BEGIN
  IF p_message_id IS NULL THEN
    RAISE EXCEPTION 'Message id required';
  END IF;

  SELECT * INTO v_msg
  FROM public.contact_messages
  WHERE id = p_message_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message not found';
  END IF;

  IF NOT public.is_admin() AND (v_msg.user_id IS NULL OR v_msg.user_id <> auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(r)::jsonb ORDER BY r.created_at ASC), '[]'::jsonb)
  INTO v_replies
  FROM (
    SELECT
      id,
      contact_message_id,
      sender_role,
      sender_user_id,
      body,
      created_at
    FROM public.contact_message_replies
    WHERE contact_message_id = p_message_id
    ORDER BY created_at ASC
  ) r;

  RETURN jsonb_build_object(
    'message', jsonb_build_object(
      'id', v_msg.id,
      'user_id', v_msg.user_id,
      'name', v_msg.name,
      'email', v_msg.email,
      'message', v_msg.message,
      'status', v_msg.status,
      'created_at', v_msg.created_at
    ),
    'replies', v_replies
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_contact_thread(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_contact_thread(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Send reply (admin or owning registered user)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_contact_reply(
  p_message_id uuid,
  p_body text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_msg public.contact_messages%ROWTYPE;
  v_body text := trim(COALESCE(p_body, ''));
  v_role text;
  v_reply public.contact_message_replies%ROWTYPE;
  v_admin_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_message_id IS NULL THEN
    RAISE EXCEPTION 'Message id required';
  END IF;
  IF length(v_body) = 0 THEN
    RAISE EXCEPTION 'Reply body required';
  END IF;
  IF length(v_body) > 4000 THEN
    RAISE EXCEPTION 'Reply too long';
  END IF;

  SELECT * INTO v_msg
  FROM public.contact_messages
  WHERE id = p_message_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message not found';
  END IF;

  IF public.is_admin() THEN
    v_role := 'admin';
  ELSIF v_msg.user_id IS NOT NULL AND v_msg.user_id = auth.uid() THEN
    v_role := 'user';
  ELSE
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_role = 'user' AND v_msg.status = 'archived' THEN
    RAISE EXCEPTION 'Conversation is closed';
  END IF;

  INSERT INTO public.contact_message_replies (
    contact_message_id,
    sender_role,
    sender_user_id,
    body
  )
  VALUES (
    p_message_id,
    v_role,
    auth.uid(),
    v_body
  )
  RETURNING * INTO v_reply;

  -- Mark thread active for admin when customer replies
  IF v_role = 'user' AND v_msg.status = 'read' THEN
    UPDATE public.contact_messages
    SET status = 'new'
    WHERE id = p_message_id;
  ELSIF v_role = 'admin' AND v_msg.status = 'new' THEN
    UPDATE public.contact_messages
    SET status = 'read'
    WHERE id = p_message_id;
  END IF;

  -- Notify the other party
  IF v_role = 'admin' AND v_msg.user_id IS NOT NULL THEN
    SELECT nullif(trim(COALESCE(p.name, p.username, '')), '') INTO v_admin_name
    FROM public.profiles p
    WHERE p.id = auth.uid();

    PERFORM public.notify_user(
      v_msg.user_id,
      'contact_reply',
      jsonb_build_object(
        'messageId', v_msg.id,
        'name', COALESCE(v_admin_name, 'ECHOCORE'),
        'preview', left(v_body, 160)
      ),
      '/support?message=' || v_msg.id::text
    );
  ELSIF v_role = 'user' THEN
    PERFORM public.notify_all_admins(
      'admin_contact_reply',
      jsonb_build_object(
        'messageId', v_msg.id,
        'name', COALESCE(v_msg.name, ''),
        'email', COALESCE(v_msg.email, ''),
        'preview', left(v_body, 160),
        'userId', auth.uid()
      ),
      '/dashboard/contact?message=' || v_msg.id::text
    );
  END IF;

  RETURN jsonb_build_object(
    'id', v_reply.id,
    'contact_message_id', v_reply.contact_message_id,
    'sender_role', v_reply.sender_role,
    'sender_user_id', v_reply.sender_user_id,
    'body', v_reply.body,
    'created_at', v_reply.created_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.send_contact_reply(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.send_contact_reply(uuid, text) TO authenticated;

-- List contact threads for the current registered user
CREATE OR REPLACE FUNCTION public.get_my_contact_threads(p_limit int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.sort_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      s.id,
      s.name,
      s.email,
      s.message,
      s.status,
      s.created_at,
      s.last_reply_at,
      s.reply_count,
      s.sort_at
    FROM (
      SELECT
        cm.id,
        cm.name,
        cm.email,
        cm.message,
        cm.status,
        cm.created_at,
        (
          SELECT max(r.created_at)
          FROM public.contact_message_replies r
          WHERE r.contact_message_id = cm.id
        ) AS last_reply_at,
        (
          SELECT count(*)::int
          FROM public.contact_message_replies r
          WHERE r.contact_message_id = cm.id
        ) AS reply_count,
        COALESCE(
          (
            SELECT max(r.created_at)
            FROM public.contact_message_replies r
            WHERE r.contact_message_id = cm.id
          ),
          cm.created_at
        ) AS sort_at
      FROM public.contact_messages cm
      WHERE cm.user_id = auth.uid()
    ) s
    ORDER BY s.sort_at DESC
    LIMIT v_limit
  ) q;

  RETURN COALESCE(v_rows, '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_contact_threads(int) FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_contact_threads(int) TO authenticated;
