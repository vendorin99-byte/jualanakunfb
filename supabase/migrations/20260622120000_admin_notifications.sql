-- Enable pg_net for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Trigger function: notify admin on new order & payment proof upload
CREATE OR REPLACE FUNCTION notify_admin_order_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_admin_email text;
  v_subject     text;
  v_template    text;
  v_data        jsonb;
BEGIN
  SELECT value INTO v_admin_email
    FROM public.app_settings
   WHERE key = 'admin_notification_email';

  IF v_admin_email IS NULL OR v_admin_email = '' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_subject  := 'Order Baru Masuk: ' || NEW.order_number;
    v_template := 'admin-new-order';
    v_data := jsonb_build_object(
      'orderNumber',   NEW.order_number,
      'customerName',  NEW.customer_name,
      'customerEmail', NEW.customer_email,
      'totalPrice',    NEW.total_price
    );

  ELSIF TG_OP = 'UPDATE'
    AND (OLD.payment_proof_url IS NULL OR OLD.payment_proof_url = '')
    AND NEW.payment_proof_url IS NOT NULL
    AND NEW.payment_proof_url <> '' THEN
    v_subject  := 'Bukti Bayar Diunggah: ' || NEW.order_number;
    v_template := 'admin-payment-proof';
    v_data := jsonb_build_object(
      'orderNumber',   NEW.order_number,
      'customerName',  NEW.customer_name,
      'customerEmail', NEW.customer_email,
      'totalPrice',    NEW.total_price
    );

  ELSE
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := 'https://hbcgkbkrwyjnkmuvssez.supabase.co/functions/v1/send-email',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := jsonb_build_object(
      'to',       v_admin_email,
      'subject',  v_subject,
      'template', v_template,
      'data',     v_data
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admin_new_order ON public.orders;
CREATE TRIGGER trg_notify_admin_new_order
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION notify_admin_order_event();

DROP TRIGGER IF EXISTS trg_notify_admin_payment_proof ON public.orders;
CREATE TRIGGER trg_notify_admin_payment_proof
  AFTER UPDATE OF payment_proof_url ON public.orders
  FOR EACH ROW EXECUTE FUNCTION notify_admin_order_event();
