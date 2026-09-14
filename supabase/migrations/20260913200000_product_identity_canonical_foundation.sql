-- Migration: 20260913200000_product_identity_canonical_foundation.sql
-- Description: Establishes permanent unique constraints for product codes and slugs, ensuring deterministic identity and canonical stability.

-- 1. Unique Permanent Index on Product Code
-- Guarantees customer-facing catalog codes (e.g. EC-TL-000042) remain permanently reserved and unique across all historical records
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_code_unique 
  ON public.products(code) 
  WHERE code IS NOT NULL AND btrim(code) != '';


-- 2. Unique Partial Index on Product Slug
-- Guarantees no two published/active products share the same canonical URL path
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_slug_unique 
  ON public.products(slug) 
  WHERE slug IS NOT NULL AND btrim(slug) != '' AND deleted_at IS NULL;

-- 3. Concurrency-Safe Atomic Product Code Generator Function
-- Uses pg_advisory_xact_lock to prevent simultaneous race conditions across concurrent product uploads
CREATE OR REPLACE FUNCTION public.generate_product_code(_type_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_next int;
  v_code text;
BEGIN
  SELECT code_prefix INTO v_prefix FROM public.product_types WHERE id = _type_id;
  IF v_prefix IS NULL OR btrim(v_prefix) = '' THEN 
    v_prefix := 'GEN'; 
  END IF;

  -- Acquire transaction-scoped advisory lock for this type prefix to guarantee serial concurrency safety
  PERFORM pg_advisory_xact_lock(hashtext('ec_code_lock_' || v_prefix));

  SELECT COALESCE(MAX(
    NULLIF(REGEXP_REPLACE(SPLIT_PART(code, '-', 3), '[^0-9]', '', 'g'), '')::int
  ), 0) + 1
    INTO v_next
    FROM public.products
   WHERE code LIKE 'EC-' || v_prefix || '-%';

  v_code := 'EC-' || v_prefix || '-' || LPAD(v_next::text, 6, '0');
  RETURN v_code;
END $$;

GRANT EXECUTE ON FUNCTION public.generate_product_code(uuid) TO authenticated, service_role;

-- 4. Auto-assign Code on Insert if Blank
CREATE OR REPLACE FUNCTION public.products_autocode()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.code IS NULL OR btrim(NEW.code) = '') AND NEW.type_id IS NOT NULL THEN
    NEW.code := public.generate_product_code(NEW.type_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_products_autocode ON public.products;
CREATE TRIGGER trg_products_autocode
  BEFORE INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_autocode();
