-- The net.http_post call was missing the apikey header required by Supabase API gateway.
-- Without it, send-email edge function returns 401 silently (pg_net is async, no throw).
-- Add apikey header (anon key is public, already in frontend bundle).
-- Also wrap in EXCEPTION so email failure never breaks the order transaction.

CREATE OR REPLACE FUNCTION public.send_credentials_email_on_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creds jsonb;
BEGIN
  IF NEW.order_status <> 'completed' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.order_status = 'completed' THEN
    RETURN NEW;
  END IF;
  IF NEW.payment_method <> 'wallet' THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT jsonb_agg(
      jsonb_build_object(
        'email',       ac.email,
        'password',    ac.password,
        'twofa',       ac.twofa_secret,
        'recovery',    ac.recovery_email,
        'notes',       ac.notes,
        'grade_label', CASE WHEN ag.grade IS NOT NULL THEN 'Grade ' || ag.grade ELSE NULL END
      )
      ORDER BY ac.created_at
    )
    INTO v_creds
    FROM public.account_credentials ac
    LEFT JOIN public.account_grades ag ON ag.id = ac.grade_id
    WHERE ac.sold_to_order = NEW.id;

    IF v_creds IS NOT NULL AND jsonb_array_length(v_creds) > 0 THEN
      PERFORM net.http_post(
        url     := 'https://hbcgkbkrwyjnkmuvssez.supabase.co/functions/v1/send-email',
        headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiY2drYmtyd3lqbmttdXZzc2V6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwOTIzOTEsImV4cCI6MjA5NzY2ODM5MX0.geTRRpAX5BY7_q7KUjz4o-QGyZHcufgVy0lSNAwdajg"}'::jsonb,
        body    := jsonb_build_object(
          'to',       NEW.customer_email,
          'subject',  'Akun kamu siap! Order #' || NEW.order_number,
          'template', 'order-credentials',
          'data',     jsonb_build_object(
            'orderNumber',   NEW.order_number,
            'customerName',  NEW.customer_name,
            'credentials',   v_creds,
            'adminNotes',    NEW.admin_notes
          )
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- Email failure must never rollback the order transaction
  END;

  RETURN NEW;
END;
$$;
