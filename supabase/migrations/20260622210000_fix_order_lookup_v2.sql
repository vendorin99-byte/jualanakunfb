-- Rewrite get_order_by_number to query orders directly (no dependency on _internal)
-- SECURITY DEFINER bypasses RLS, PII masking handled inline
CREATE OR REPLACE FUNCTION public.get_order_by_number(_order_number text)
RETURNS TABLE(
  id uuid,
  order_number text,
  payment_status payment_status,
  order_status order_status,
  total_price bigint,
  quantity integer,
  created_at timestamp with time zone,
  product_id uuid,
  grade_id uuid,
  package_id uuid,
  admin_notes text,
  payment_proof_url text,
  customer_name text,
  customer_email text,
  customer_phone text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
  SELECT
    o.id,
    o.order_number,
    o.payment_status,
    o.order_status,
    o.total_price,
    o.quantity,
    o.created_at,
    o.product_id,
    o.grade_id,
    o.package_id,
    o.admin_notes,
    o.payment_proof_url,
    CASE
      WHEN auth.uid() = o.user_id OR public.has_role(auth.uid(), 'admin')
      THEN o.customer_name
      ELSE COALESCE(substr(o.customer_name, 1, 1), '') || '***'
    END AS customer_name,
    CASE
      WHEN auth.uid() = o.user_id OR public.has_role(auth.uid(), 'admin')
      THEN o.customer_email
      ELSE COALESCE(substr(o.customer_email, 1, 2), '') || '***@***'
    END AS customer_email,
    CASE
      WHEN auth.uid() = o.user_id OR public.has_role(auth.uid(), 'admin')
      THEN o.customer_phone
      ELSE '***'
    END AS customer_phone
  FROM public.orders o
  WHERE UPPER(TRIM(o.order_number)) = UPPER(TRIM(_order_number))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_order_by_number(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_by_number(text) TO anon, authenticated;
