-- Storage bucket for per-product images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880, -- 5 MB
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Public read for everyone
CREATE POLICY "product images public read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'product-images');

-- Admin upload / update / delete
CREATE POLICY "admin upload product images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'product-images' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admin update product images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'product-images' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admin delete product images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'product-images' AND has_role(auth.uid(), 'admin'::app_role));

-- ── Auto-update products.rating from product_reviews average ──────────────────
CREATE OR REPLACE FUNCTION public.refresh_product_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id uuid;
  v_avg numeric;
BEGIN
  v_product_id := COALESCE(NEW.product_id, OLD.product_id);
  SELECT ROUND(AVG(rating)::numeric, 1) INTO v_avg
  FROM public.product_reviews
  WHERE product_id = v_product_id AND is_approved = true;

  IF v_avg IS NOT NULL THEN
    UPDATE public.products SET rating = v_avg, updated_at = now() WHERE id = v_product_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_product_rating ON public.product_reviews;
CREATE TRIGGER trg_refresh_product_rating
AFTER INSERT OR UPDATE OR DELETE ON public.product_reviews
FOR EACH ROW EXECUTE FUNCTION public.refresh_product_rating();

-- ── Notify wishlist users when stock goes from 0 → >0 ────────────────────────
CREATE OR REPLACE FUNCTION public.notify_wishlist_on_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when stock goes from 0 (or null) to positive
  IF (OLD.stock IS NULL OR OLD.stock = 0) AND NEW.stock > 0 THEN
    INSERT INTO public.notifications (user_id, title, body, link)
    SELECT
      w.user_id,
      '🔔 Stok tersedia: ' || NEW.name,
      'Produk "' || NEW.name || '" yang kamu wishlist sudah tersedia. Segera pesan sebelum kehabisan!',
      '/products/' || NEW.id::text
    FROM public.wishlists w
    WHERE w.product_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_wishlist_stock ON public.products;
CREATE TRIGGER trg_notify_wishlist_stock
AFTER UPDATE OF stock ON public.products
FOR EACH ROW EXECUTE FUNCTION public.notify_wishlist_on_stock();
