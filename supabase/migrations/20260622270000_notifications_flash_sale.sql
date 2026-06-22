-- Flash sale columns on products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sale_price integer,
  ADD COLUMN IF NOT EXISTS sale_ends_at timestamptz;

-- In-app notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type         text NOT NULL DEFAULT 'info',
  title        text NOT NULL,
  body         text,
  order_id     uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  order_number text,
  is_read      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users mark read" ON public.notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Trigger: insert notification when order_status flips to 'completed'
CREATE OR REPLACE FUNCTION public.notify_order_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.order_status = 'completed'
     AND (OLD IS NULL OR OLD.order_status IS DISTINCT FROM 'completed')
     AND NEW.user_id IS NOT NULL
  THEN
    INSERT INTO public.notifications (user_id, type, title, body, order_id, order_number)
    VALUES (
      NEW.user_id,
      'order_completed',
      'Pesanan selesai! 🎉',
      'Akun untuk pesanan #' || NEW.order_number || ' sudah siap. Cek sekarang!',
      NEW.id,
      NEW.order_number
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_order_complete ON public.orders;
CREATE TRIGGER trg_notify_order_complete
AFTER UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.notify_order_complete();
