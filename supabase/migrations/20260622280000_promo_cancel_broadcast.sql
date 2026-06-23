-- 1. Track promo usage on orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS promo_id uuid REFERENCES public.promos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discount_amount bigint NOT NULL DEFAULT 0;

-- 2. purchase_with_wallet extended with promo_code support
CREATE OR REPLACE FUNCTION public.purchase_with_wallet(
  _product_id   uuid,
  _quantity     integer,
  _grade_id     uuid    DEFAULT NULL::uuid,
  _package_id   uuid    DEFAULT NULL::uuid,
  _customer_name  text  DEFAULT NULL::text,
  _customer_phone text  DEFAULT NULL::text,
  _promo_code   text    DEFAULT NULL::text
)
RETURNS TABLE(success boolean, order_id uuid, order_number text, new_balance bigint, discount_amount bigint, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user          uuid := auth.uid();
  v_email         text;
  v_current       bigint;
  v_total         bigint := 0;
  v_discount      bigint := 0;
  v_qty           integer;
  v_pkg_price     bigint;
  v_pkg_qty       integer;
  v_pkg_grade     uuid;
  v_grade_price   bigint;
  v_product_price bigint;
  v_order_id      uuid;
  v_order_num     text;
  v_name          text;
  v_phone         text;
  v_promo         record;
BEGIN
  IF v_user IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, 0::bigint, 0::bigint, 'Tidak login'::text; RETURN;
  END IF;
  IF _quantity <= 0 OR _quantity > 100 THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, 0::bigint, 0::bigint, 'Kuantitas tidak valid'::text; RETURN;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_user;
  IF v_email IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, 0::bigint, 0::bigint, 'User tidak ditemukan'::text; RETURN;
  END IF;

  SELECT
    COALESCE(NULLIF(trim(_customer_name), ''), p.full_name, split_part(v_email, '@', 1)),
    COALESCE(NULLIF(trim(_customer_phone), ''), p.phone, '-')
  INTO v_name, v_phone
  FROM public.profiles p WHERE p.user_id = v_user;
  IF v_name IS NULL THEN
    v_name  := COALESCE(NULLIF(trim(_customer_name), ''), split_part(v_email, '@', 1));
    v_phone := COALESCE(NULLIF(trim(_customer_phone), ''), '-');
  END IF;

  -- Price calculation
  IF _package_id IS NOT NULL THEN
    SELECT price, quantity, grade_id INTO v_pkg_price, v_pkg_qty, v_pkg_grade
      FROM public.packages WHERE id = _package_id AND is_active = true;
    IF v_pkg_price IS NULL THEN
      RETURN QUERY SELECT false, NULL::uuid, NULL::text, 0::bigint, 0::bigint, 'Paket tidak valid'::text; RETURN;
    END IF;
    _grade_id := COALESCE(_grade_id, v_pkg_grade);
    v_total   := v_pkg_price;
    v_qty     := v_pkg_qty;
  ELSIF _grade_id IS NOT NULL THEN
    SELECT base_price INTO v_grade_price
      FROM public.account_grades WHERE id = _grade_id AND is_active = true;
    IF v_grade_price IS NULL THEN
      RETURN QUERY SELECT false, NULL::uuid, NULL::text, 0::bigint, 0::bigint, 'Grade tidak valid'::text; RETURN;
    END IF;
    v_total := v_grade_price * _quantity;
    v_qty   := _quantity;
  ELSE
    SELECT price INTO v_product_price
      FROM public.products WHERE id = _product_id AND status = 'active';
    IF v_product_price IS NULL THEN
      RETURN QUERY SELECT false, NULL::uuid, NULL::text, 0::bigint, 0::bigint, 'Produk tidak valid'::text; RETURN;
    END IF;
    v_total := v_product_price * _quantity;
    v_qty   := _quantity;
  END IF;

  IF v_total <= 0 THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, 0::bigint, 0::bigint, 'Total tidak valid'::text; RETURN;
  END IF;

  -- Apply promo code
  IF _promo_code IS NOT NULL AND trim(_promo_code) <> '' THEN
    SELECT * INTO v_promo FROM public.promos
    WHERE UPPER(code) = UPPER(trim(_promo_code))
      AND is_active = true
      AND (starts_at IS NULL OR starts_at <= now())
      AND (ends_at   IS NULL OR ends_at   >= now())
      AND (max_uses  IS NULL OR used_count < max_uses)
    FOR UPDATE;

    IF v_promo IS NULL THEN
      RETURN QUERY SELECT false, NULL::uuid, NULL::text, 0::bigint, 0::bigint, 'Kode promo tidak valid atau sudah habis'::text; RETURN;
    END IF;
    IF v_total < v_promo.min_purchase THEN
      RETURN QUERY SELECT false, NULL::uuid, NULL::text, 0::bigint, 0::bigint,
        ('Minimum pembelian ' || v_promo.min_purchase::text || ' untuk promo ini')::text; RETURN;
    END IF;

    IF v_promo.discount_type = 'percent' THEN
      v_discount := (v_total * v_promo.discount_value / 100)::bigint;
    ELSE
      v_discount := v_promo.discount_value::bigint;
    END IF;
    v_discount := LEAST(v_discount, v_total);
    v_total    := v_total - v_discount;

    UPDATE public.promos SET used_count = used_count + 1, updated_at = now() WHERE id = v_promo.id;
  END IF;

  -- Check balance
  SELECT balance INTO v_current FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF v_current IS NULL OR v_current < v_total THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, COALESCE(v_current, 0), 0::bigint, 'Saldo tidak cukup'::text; RETURN;
  END IF;

  -- Insert order
  INSERT INTO public.orders (
    user_id, customer_name, customer_email, customer_phone,
    product_id, quantity, total_price, order_number,
    package_id, grade_id, payment_method, payment_status, order_status,
    promo_id, discount_amount
  ) VALUES (
    v_user, v_name, v_email, v_phone,
    _product_id, v_qty, v_total, 'TMP',
    _package_id, _grade_id, 'wallet', 'paid', 'processing',
    v_promo.id, v_discount
  ) RETURNING id INTO v_order_id;

  SELECT o.order_number INTO v_order_num FROM public.orders o WHERE o.id = v_order_id;

  -- Deduct balance
  UPDATE public.wallets SET balance = v_current - v_total, updated_at = now() WHERE user_id = v_user;
  INSERT INTO public.wallet_transactions (user_id, type, status, amount, balance_after, order_id, notes)
  VALUES (v_user, 'purchase', 'completed', v_total, v_current - v_total, v_order_id, 'Pembelian order ' || v_order_num);

  RETURN QUERY SELECT true, v_order_id, v_order_num, v_current - v_total, v_discount, 'OK'::text;
END;
$$;

-- 3. List user's own orders
CREATE OR REPLACE FUNCTION public.get_my_orders()
RETURNS TABLE(
  id uuid, order_number text, total_price bigint, discount_amount bigint,
  payment_status text, order_status text, created_at timestamptz,
  product_name text, product_category text, quantity integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT o.id, o.order_number, o.total_price::bigint, o.discount_amount::bigint,
           o.payment_status::text, o.order_status::text, o.created_at,
           p.name, p.category, o.quantity
    FROM public.orders o
    LEFT JOIN public.products p ON p.id = o.product_id
    WHERE o.user_id = auth.uid()
    ORDER BY o.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_orders() TO authenticated;

-- 4. Cancel pending order (pending payment = no wallet was charged)
CREATE OR REPLACE FUNCTION public.user_cancel_order(_order_id uuid)
RETURNS TABLE(success boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order record;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN QUERY SELECT false, 'Tidak login'::text; RETURN;
  END IF;

  SELECT * INTO v_order FROM public.orders
  WHERE id = _order_id AND user_id = auth.uid();

  IF v_order IS NULL THEN
    RETURN QUERY SELECT false, 'Order tidak ditemukan'::text; RETURN;
  END IF;
  IF v_order.payment_status <> 'pending' THEN
    RETURN QUERY SELECT false, 'Hanya order yang belum dibayar yang bisa dibatalkan'::text; RETURN;
  END IF;
  IF v_order.order_status = 'completed' THEN
    RETURN QUERY SELECT false, 'Order sudah selesai, tidak bisa dibatalkan'::text; RETURN;
  END IF;

  UPDATE public.orders
  SET order_status = 'cancelled', payment_status = 'failed', updated_at = now()
  WHERE id = _order_id;

  RETURN QUERY SELECT true, 'Order berhasil dibatalkan'::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.user_cancel_order(uuid) TO authenticated;

-- 5. Admin broadcast notification to all active users
CREATE OR REPLACE FUNCTION public.admin_broadcast_notification(
  _title text,
  _body  text,
  _link  text DEFAULT NULL::text
)
RETURNS TABLE(success boolean, sent_count integer, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN QUERY SELECT false, 0, 'Tidak diizinkan'::text; RETURN;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, order_number)
  SELECT u.id, 'broadcast', _title, _body,
         CASE WHEN _link IS NOT NULL AND _link <> '' THEN _link ELSE NULL END
  FROM auth.users u
  WHERE u.email IS NOT NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT true, v_count, ('Notifikasi terkirim ke ' || v_count || ' user')::text;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_broadcast_notification(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_broadcast_notification(text, text, text) TO authenticated;
