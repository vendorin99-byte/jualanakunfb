-- Fix "column reference order_number is ambiguous" caused by order_number appearing
-- in both the INSERT column list and RETURNING clause.
-- Use two-step: RETURNING id, then SELECT order_number by id.

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
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, COALESCE(v_current, 0), 'Saldo tidak cukup'::text;
    RETURN;
  END IF;

  -- Insert order. The set_order_number BEFORE INSERT trigger overwrites order_number.
  -- Use two-step: get id from RETURNING, then SELECT actual order_number by id.
  INSERT INTO public.orders (
    user_id, customer_name, customer_email, customer_phone,
    product_id, quantity, total_price, order_number,
    package_id, grade_id, payment_method, payment_status, order_status
  ) VALUES (
    v_user, v_name, v_email, v_phone,
    _product_id, v_qty, v_total, 'TMP',
    _package_id, _grade_id, 'wallet', 'paid', 'processing'
  ) RETURNING id INTO v_order_id;

  -- Get the ACTUAL order_number assigned by the set_order_number trigger
  SELECT o.order_number INTO v_order_num FROM public.orders o WHERE o.id = v_order_id;

  -- Deduct balance
  UPDATE public.wallets SET balance = v_current - v_total, updated_at = now() WHERE user_id = v_user;
  INSERT INTO public.wallet_transactions (user_id, type, status, amount, balance_after, order_id, notes)
  VALUES (v_user, 'purchase', 'completed', v_total, v_current - v_total, v_order_id, 'Pembelian order ' || v_order_num);

  RETURN QUERY SELECT true, v_order_id, v_order_num, v_current - v_total, 'OK'::text;
END;
$$;
