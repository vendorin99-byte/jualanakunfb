-- SECURITY FIX: topup_wallet had no admin check, allowing any authenticated user to
-- self-credit their wallet without payment. Restrict to admin-only and add a
-- user-facing submit_topup_request function for the manual bank-transfer flow.

-- 1. Add admin guard to topup_wallet (admin-only direct credit)
CREATE OR REPLACE FUNCTION public.topup_wallet(
  _amount bigint,
  _payment_method text DEFAULT 'manual'::text,
  _notes text DEFAULT NULL::text
)
RETURNS TABLE(success boolean, new_balance bigint, transaction_id uuid, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN QUERY SELECT false, 0::bigint, NULL::uuid, 'Tidak login'::text;
    RETURN;
  END IF;
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN QUERY SELECT false, 0::bigint, NULL::uuid, 'Akses ditolak'::text;
    RETURN;
  END IF;
  RETURN QUERY SELECT * FROM public.topup_wallet_internal(_amount, _payment_method, _notes);
END;
$$;

REVOKE ALL ON FUNCTION public.topup_wallet(bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.topup_wallet(bigint, text, text) TO authenticated;

-- 2. New function: admin_topup_user — admin credits another user's wallet
CREATE OR REPLACE FUNCTION public.admin_topup_user(
  _user_id uuid,
  _amount bigint,
  _notes text DEFAULT NULL::text
)
RETURNS TABLE(success boolean, new_balance bigint, transaction_id uuid, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_wallet_id uuid;
  v_current_balance bigint;
  v_new_balance bigint;
  v_tx_id uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN QUERY SELECT false, 0::bigint, NULL::uuid, 'Akses ditolak'::text;
    RETURN;
  END IF;
  IF _amount < 1000 OR _amount > 50000000 THEN
    RETURN QUERY SELECT false, 0::bigint, NULL::uuid, 'Nominal tidak valid'::text;
    RETURN;
  END IF;

  SELECT id, balance INTO v_wallet_id, v_current_balance
  FROM public.wallets WHERE user_id = _user_id FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    RETURN QUERY SELECT false, 0::bigint, NULL::uuid, 'Wallet tidak ditemukan'::text;
    RETURN;
  END IF;

  v_new_balance := v_current_balance + _amount;

  UPDATE public.wallets SET balance = v_new_balance, updated_at = now() WHERE id = v_wallet_id;

  INSERT INTO public.wallet_transactions (user_id, type, status, amount, balance_after, payment_method, notes)
  VALUES (_user_id, 'topup', 'completed', _amount, v_new_balance, 'admin_manual', COALESCE(_notes, 'Admin top up manual'))
  RETURNING id INTO v_tx_id;

  RETURN QUERY SELECT true, v_new_balance, v_tx_id, 'Top up berhasil'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_topup_user(uuid, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_topup_user(uuid, bigint, text) TO authenticated;

-- 3. User-facing: submit_topup_request — creates a pending transaction without crediting
CREATE OR REPLACE FUNCTION public.submit_topup_request(
  _amount bigint,
  _payment_method text DEFAULT 'bank_transfer'::text,
  _notes text DEFAULT NULL::text
)
RETURNS TABLE(success boolean, transaction_id uuid, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tx_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, 'Tidak login'::text;
    RETURN;
  END IF;
  IF _amount < 10000 OR _amount > 50000000 THEN
    RETURN QUERY SELECT false, NULL::uuid, 'Nominal tidak valid (Rp 10.000 – Rp 50.000.000)'::text;
    RETURN;
  END IF;

  INSERT INTO public.wallet_transactions (user_id, type, status, amount, payment_method, notes)
  VALUES (auth.uid(), 'topup', 'pending', _amount, _payment_method, COALESCE(_notes, 'Top up via transfer bank — menunggu konfirmasi admin'))
  RETURNING id INTO v_tx_id;

  RETURN QUERY SELECT true, v_tx_id, 'Permintaan top up berhasil dikirim. Setelah admin mengonfirmasi pembayaranmu, saldo akan ditambahkan otomatis.'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_topup_request(bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_topup_request(bigint, text, text) TO authenticated;
