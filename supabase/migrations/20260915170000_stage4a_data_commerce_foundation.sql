-- Migration: 20260915170000_stage4a_data_commerce_foundation.sql
-- Description: Establishes two-tier commerce pricing, dynamic pricing units, optional differentiator fields, and updates manual search indexing.

-- 1. Add commerce pricing and differentiator columns to public.products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS original_price numeric NULL,
  ADD COLUMN IF NOT EXISTS pricing_unit text NOT NULL DEFAULT 'sqm',
  ADD COLUMN IF NOT EXISTS differentiator_type text NULL,
  ADD COLUMN IF NOT EXISTS differentiator_note text NULL;

-- 2. Add validation constraint for pricing_unit
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS chk_products_pricing_unit;

ALTER TABLE public.products
  ADD CONSTRAINT chk_products_pricing_unit
  CHECK (pricing_unit IN ('sqm', 'piece', 'set', 'carton', 'box', 'metre', 'roll', 'unit'));

-- 3. Sensible non-destructive initial backfill for known non-tile product types
UPDATE public.products p
SET pricing_unit = 'set'
FROM public.product_types t
WHERE p.type_id = t.id
  AND t.slug = 'doors'
  AND p.pricing_unit = 'sqm';

UPDATE public.products p
SET pricing_unit = 'piece'
FROM public.product_types t
WHERE p.type_id = t.id
  AND t.slug IN ('sanitary-wares', 'plumbing', 'stainless-handrail')
  AND p.pricing_unit = 'sqm';

-- 4. Update rebuild_search_index to include differentiator_note and pricing_unit in manual search indexing
CREATE OR REPLACE FUNCTION public.rebuild_search_index(_product_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE 
  p record; 
  t_name text; 
  c_name text; 
  s_name text; 
  f_name text; 
  ic_name text;
  size_val text; 
  aliases text[]; 
  keywords text[]; 
  master jsonb; 
  combined text;
BEGIN
  SELECT * INTO p FROM public.products WHERE id = _product_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT name INTO t_name FROM public.product_types WHERE id = p.type_id;
  SELECT name INTO c_name FROM public.categories WHERE id = p.category_id;
  SELECT name INTO s_name FROM public.subcategories WHERE id = p.subcategory_id;
  SELECT name INTO f_name FROM public.family_groups WHERE id = p.family_id;
  
  SELECT ic.name INTO ic_name 
    FROM public.product_types pt
    LEFT JOIN public.installation_contexts ic ON ic.id = pt.installation_context_id
   WHERE pt.id = p.type_id;

  size_val := p.size;
  aliases := public.generate_size_aliases(size_val);
  keywords := ARRAY['luxury','premium','quality','high quality','imported','Nigeria','Abuja']
    || COALESCE(p.app_keywords, ARRAY[]::text[])
    || COALESCE(p.seo_keywords, ARRAY[]::text[]);

  master := jsonb_build_object(
    'title', p.name, 
    'manufacturer', p.brand,
    'finish', COALESCE(p.finish, p.finish_name),
    'type', t_name, 
    'category', c_name, 
    'subcategory', s_name, 
    'family', f_name,
    'size', size_val, 
    'aliases', to_jsonb(aliases),
    'installation_context', ic_name, 
    'keywords', to_jsonb(keywords),
    'ai_description', p.generated_description,
    'seo_title', p.seo_title, 
    'seo_description', p.seo_description,
    'location', 'Abuja, Nigeria',
    'pricing_unit', p.pricing_unit,
    'differentiator_type', p.differentiator_type,
    'differentiator_note', p.differentiator_note,
    'quality_terms', to_jsonb(ARRAY['luxury','premium','quality','high quality','Italian','imported'])
  );

  combined := concat_ws(' ',
    p.name, p.code, p.brand, p.color, p.material, p.finish, p.finish_name,
    p.short_description, p.generated_description, p.seo_title, p.seo_description,
    p.differentiator_note, p.differentiator_type, p.pricing_unit,
    t_name, c_name, s_name, f_name, ic_name, size_val,
    array_to_string(aliases,' '), array_to_string(keywords,' ')
  );

  INSERT INTO public.search_index (
    product_id, 
    normalized_size, 
    search_aliases, 
    combined_search_text, 
    master_document, 
    search_vector, 
    updated_at
  )
  VALUES (
    _product_id, 
    size_val, 
    aliases, 
    combined, 
    master, 
    to_tsvector('english', combined), 
    now()
  )
  ON CONFLICT (product_id) DO UPDATE
    SET normalized_size = EXCLUDED.normalized_size, 
        search_aliases = EXCLUDED.search_aliases,
        combined_search_text = EXCLUDED.combined_search_text, 
        master_document = EXCLUDED.master_document,
        search_vector = EXCLUDED.search_vector, 
        updated_at = now();
END $$;
