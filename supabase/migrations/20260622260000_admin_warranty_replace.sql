-- Admin warranty replacement: assign a credential to an order regardless of
-- how many are already assigned (bypasses the quantity check in admin_fulfill_order).
-- Used when buyer reports a broken account and admin sends a replacement.

CREATE OR REPLACE FUNCTION public.admin_warranty_replace(
  _order_id    uuid,
  _credential_id uuid DEFAULT NULL::uuid  -- NULL = auto-pick from stock
)
RETURNS TABLE(
  success        boolean,
  cred_email     text,
  cred_password  text,
  cred_twofa     text,
  cred_recovery  text,
  cred_notes     text,
  grade_label    text,
  order_number   text,
  customer_email text,
  message        text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order  record;
  v_cred   record;
  v_cid    uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN QUERY SELECT false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Tidak diizinkan'::text;
    RETURN;
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = _order_id;
  IF v_order IS NULL THEN
    RETURN QUERY SELECT false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Order tidak ditemukan'::text;
    RETURN;
  END IF;

  IF _credential_id IS NOT NULL THEN
    SELECT id INTO v_cid FROM public.account_credentials
    WHERE id = _credential_id AND is_sold = false AND product_id = v_order.product_id;
    IF v_cid IS NULL THEN
      RETURN QUERY SELECT false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Credential tidak tersedia atau sudah terjual'::text;
      RETURN;
    END IF;
  ELSE
    SELECT id INTO v_cid FROM public.account_credentials
    WHERE product_id = v_order.product_id
      AND is_sold = false
      AND sold_to_order IS NULL
      AND (v_order.grade_id IS NULL OR grade_id = v_order.grade_id)
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_cid IS NULL THEN
      RETURN QUERY SELECT false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Stok habis untuk produk ini'::text;
      RETURN;
    END IF;
  END IF;

  UPDATE public.account_credentials
  SET is_sold = true, sold_to_order = _order_id, updated_at = now()
  WHERE id = v_cid;

  UPDATE public.account_grades
  SET stock = GREATEST(0, stock - 1), updated_at = now()
  WHERE id = (SELECT grade_id FROM public.account_credentials WHERE id = v_cid);

  SELECT ac.email, ac.password, ac.twofa_secret, ac.recovery_email, ac.notes,
         ag.grade AS grade_val
  INTO v_cred
  FROM public.account_credentials ac
  LEFT JOIN public.account_grades ag ON ag.id = ac.grade_id
  WHERE ac.id = v_cid;

  RETURN QUERY SELECT
    true,
    v_cred.email,
    v_cred.password,
    v_cred.twofa_secret,
    v_cred.recovery_email,
    v_cred.notes,
    CASE WHEN v_cred.grade_val IS NOT NULL THEN 'Grade ' || v_cred.grade_val ELSE NULL END,
    v_order.order_number,
    v_order.customer_email,
    'OK'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_warranty_replace(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_warranty_replace(uuid, uuid) TO authenticated;
