-- Migration: 20261008001500_product_name_slug_identity.sql
-- Description: Make product URLs name-based on creation and replace legacy
-- add-details-* placeholder slugs for existing products.
--
-- URL policy:
-- 1. A real stored slug remains permanent.
-- 2. A blank slug gets generated from the product name.
-- 3. Legacy add-details-* slugs are replaced by the product-name slug.
-- 4. Duplicate names receive the product code as a deterministic suffix.
-- 5. Slug changes are recorded as 301 redirects by the existing redirect trigger.

CREATE OR REPLACE FUNCTION public.slugify_product_name(_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_slug text;
BEGIN
  v_slug := lower(btrim(coalesce(_name, '')));
  v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
  v_slug := regexp_replace(v_slug, '(^-+|-+$)', '', 'g');
  RETURN nullif(v_slug, '');
END;
$$;

CREATE OR REPLACE FUNCTION public.products_auto_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_base text;
  v_candidate text;
  v_suffix text;
  v_exists boolean;
  v_old_slug text;
BEGIN
  v_old_slug := lower(btrim(coalesce(OLD.slug, '')));
  v_base := public.slugify_product_name(NEW.name);

  IF v_base IS NOT NULL
     AND (
       NEW.slug IS NULL
       OR btrim(NEW.slug) = ''
       OR lower(btrim(NEW.slug)) = 'add-details'
       OR lower(btrim(NEW.slug)) LIKE 'add-details-%'
     )
  THEN
    v_candidate := v_base;

    SELECT EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.slug = v_candidate
        AND p.id <> NEW.id
        AND p.deleted_at IS NULL
    ) INTO v_exists;

    IF v_exists THEN
      v_suffix := lower(regexp_replace(coalesce(NEW.code, ''), '[^a-zA-Z0-9]+', '-', 'g'));
      v_suffix := regexp_replace(v_suffix, '(^-+|-+$)', '', 'g');

      IF v_suffix = '' THEN
        v_suffix := substr(replace(NEW.id::text, '-', ''), 1, 8);
      END IF;

      v_candidate := v_base || '-' || lower(v_suffix);
    END IF;

    NEW.slug := v_candidate;

    IF NEW.canonical_slug IS NULL
       OR btrim(NEW.canonical_slug) = ''
       OR lower(btrim(NEW.canonical_slug)) = v_old_slug
       OR lower(btrim(NEW.canonical_slug)) LIKE 'add-details-%'
    THEN
      NEW.canonical_slug := v_candidate;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_auto_slug ON public.products;

CREATE TRIGGER trg_products_auto_slug
  BEFORE INSERT OR UPDATE OF name, slug, canonical_slug ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.products_auto_slug();

DROP TRIGGER IF EXISTS trg_product_slug_change ON public.products;

CREATE TRIGGER trg_product_slug_change
  AFTER UPDATE ON public.products
  FOR EACH ROW
  WHEN (OLD.slug IS DISTINCT FROM NEW.slug)
  EXECUTE FUNCTION public.handle_product_slug_change();

-- Convert existing legacy placeholder URLs using the authoritative product names.
UPDATE public.products
SET name = btrim(name)
WHERE lower(coalesce(slug, '')) LIKE 'add-details-%'
  AND btrim(coalesce(name, '')) <> '';

UPDATE public.products
SET canonical_slug = slug
WHERE slug IS NOT NULL
  AND (
    canonical_slug IS NULL
    OR lower(coalesce(canonical_slug, '')) LIKE 'add-details-%'
  );
