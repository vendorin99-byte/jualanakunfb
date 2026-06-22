-- Fix 1: purchase_with_wallet — immediately assign available credentials
-- If no stock, order stays 'processing' until admin adds credentials
CREATE OR REPLACE FUNCTION public.purchase_with_wallet(
  _product_id uuid,
  _quantity integer,
  _grade_id uuid DEFAULT NULL::uuid,
  _package_id uuid DEFAULT NULL::uuid,
  _customer_name text DEFAULT NULL::text,
  _customer_phone text DEFAULT NULL::text
)
RETURNS TABLE(success boolean, order_id uuid, order_number text, new_balance bigint, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_email text;
  v_current bigint;
  v_total bigint := 0;
  v_qty integer;
  v_pkg_price bigint;
  v_pkg_qty integer;
  v_pkg_grade uuid;
  v_grade_price bigint;
  v_product_price bigint;
  v_order_id uuid;
  v_order_num text;
  v_name text;
  v_phone text;
  v_assigned integer := 0;
BEGIN
  IF v_user IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, 0::bigint, 'Tidak login'::text;
    RETURN;
  END IF;
  IF _quantity <= 0 OR _quantity > 100 THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, 0::bigint, 'Kuantitas tidak valid'::text;
    RETURN;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_user;
  IF v_email IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, 0::bigint, 'User tidak ditemukan'::text;
    RETURN;
  END IF;

  SELECT
    COALESCE(NULLIF(trim(_customer_name), ''), p.full_name, split_part(v_email, '@', 1)),
    COALESCE(NULLIF(trim(_customer_phone), ''), p.phone, '-')
  INTO v_name, v_phone
  FROM public.profiles p WHERE p.user_id = v_user;
  IF v_name IS NULL THEN
    v_name := COALESCE(NULLIF(trim(_customer_name), ''), split_part(v_email, '@', 1));
    v_phone := COALESCE(NULLIF(trim(_customer_phone), ''), '-');
  END IF;

  IF _package_id IS NOT NULL THEN
    SELECT price, quantity, grade_id INTO v_pkg_price, v_pkg_qty, v_pkg_grade
    FROM public.packages WHERE id = _package_id AND is_active = true;
    IF v_pkg_price IS NULL THEN
      RETURN QUERY SELECT false, NULL::uuid, NULL::text, 0::bigint, 'Paket tidak valid'::text;
      RETURN;
    END IF;
    _grade_id := COALESCE(_grade_id, v_pkg_grade);
    v_total := v_pkg_price;
    v_qty := v_pkg_qty;
  ELSIF _grade_id IS NOT NULL THEN
    SELECT base_price INTO v_grade_price
    FROM public.account_grades WHERE id = _grade_id AND is_active = true;
    IF v_grade_price IS NULL THEN
      RETURN QUERY SELECT false, NULL::uuid, NULL::text, 0::bigint, 'Grade tidak valid'::text;
      RETURN;
    END IF;
    v_total := v_grade_price * _quantity;
    v_qty := _quantity;
  ELSE
    SELECT price INTO v_product_price
    FROM public.products WHERE id = _product_id AND status = 'active';
    IF v_product_price IS NULL THEN
      RETURN QUERY SELECT false, NULL::uuid, NULL::text, 0::bigint, 'Produk tidak valid'::text;
      RETURN;
    END IF;
    v_total := v_product_price * _quantity;
    v_qty := _quantity;
  END IF;

  IF v_total <= 0 THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, 0::bigint, 'Total tidak valid'::text;
    RETURN;
  END IF;

  -- Check balance
  SELECT balance INTO v_current FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF v_current IS NULL OR v_current < v_total THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, COALESCE(v_current, 0), 'Saldo tidak mencukupi'::text;
    RETURN;
  END IF;

  -- Generate order number and create order
  v_order_num := public.generate_short_order_code();
  INSERT INTO public.orders (
    user_id, customer_name, customer_email, customer_phone,
    product_id, quantity, total_price, order_number,
    package_id, grade_id, payment_method, payment_status, order_status
  ) VALUES (
    v_user, v_name, v_email, v_phone,
    _product_id, v_qty, v_total, v_order_num,
    _package_id, _grade_id, 'wallet', 'paid', 'processing'
  ) RETURNING id INTO v_order_id;

  -- Deduct balance
  UPDATE public.wallets SET balance = v_current - v_total, updated_at = now() WHERE user_id = v_user;
  INSERT INTO public.wallet_transactions (user_id, type, status, amount, balance_after, order_id, notes)
  VALUES (v_user, 'purchase', 'completed', v_total, v_current - v_total, v_order_id, 'Pembelian order ' || v_order_num);

  -- Try to immediately assign available credentials
  WITH avail AS (
    SELECT id FROM public.account_credentials
    WHERE product_id = _product_id
      AND is_sold = false
      AND sold_to_order IS NULL
      AND (_grade_id IS NULL OR grade_id = _grade_id)
    ORDER BY created_at ASC
    LIMIT v_qty
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.account_credentials c
  SET is_sold = true, sold_to_order = v_order_id, updated_at = now()
  FROM avail WHERE c.id = avail.id;

  GET DIAGNOSTICS v_assigned = ROW_COUNT;

  -- Update grade stock
  IF _grade_id IS NOT NULL AND v_assigned > 0 THEN
    UPDATE public.account_grades
    SET stock = GREATEST(0, stock - v_assigned), updated_at = now()
    WHERE id = _grade_id;
  END IF;

  -- Mark completed if all credentials assigned (triggers email send via trg_send_credentials_on_complete)
  IF v_assigned >= v_qty THEN
    UPDATE public.orders SET order_status = 'completed', updated_at = now() WHERE id = v_order_id;
  END IF;

  RETURN QUERY SELECT true, v_order_id, v_order_num, v_current - v_total, 'OK'::text;
END;
$$;


-- Fix 2: Trigger to send credentials email automatically when wallet order completes
-- Fires on INSERT (purchase_with_wallet sets to completed) AND on UPDATE (auto_assign fills remaining)
CREATE OR REPLACE FUNCTION public.send_credentials_email_on_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creds jsonb;
BEGIN
  -- Only for wallet orders becoming 'completed'
  IF NEW.order_status <> 'completed' THEN
    RETURN NEW;
  END IF;
  -- On INSERT (shouldn't happen in current flow, but safe guard)
  IF TG_OP = 'INSERT' AND NEW.payment_method <> 'wallet' THEN
    RETURN NEW;
  END IF;
  -- On UPDATE: only fire when transitioning to completed
  IF TG_OP = 'UPDATE' THEN
    IF OLD.order_status = 'completed' THEN
      RETURN NEW; -- already was completed, skip
    END IF;
    -- Skip non-wallet unless we want all payments (admin fulfillment already sends from frontend)
    IF NEW.payment_method <> 'wallet' THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Build credentials JSON array
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

  IF v_creds IS NULL OR jsonb_array_length(v_creds) = 0 THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := 'https://hbcgkbkrwyjnkmuvssez.supabase.co/functions/v1/send-email',
    headers := '{"Content-Type":"application/json"}'::jsonb,
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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_send_credentials_on_complete ON public.orders;
CREATE TRIGGER trg_send_credentials_on_complete
  AFTER UPDATE OF order_status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.send_credentials_email_on_complete();
