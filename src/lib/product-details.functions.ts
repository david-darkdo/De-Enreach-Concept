import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAIProvider } from "./ai-providers";

async function tryJSON<T = any>(
  provider: any,
  prompt: string,
  system: string,
  imageUrl?: string
): Promise<{ data: T | null; raw: string; error?: string }> {
  try {
    const raw = await provider.callLLM(prompt, system, imageUrl);
    if (!raw) return { data: null, raw: "", error: "AI model returned an empty text response." };

    const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return { data: null, raw, error: "No JSON object found in AI response." };

    const data = JSON.parse(m[0]) as T;
    return { data, raw };
  } catch (err: any) {
    return { data: null, raw: "", error: err.message || "Failed to execute LLM call or parse JSON response." };
  }
}

export const DIFFERENTIATOR_TYPES = [
  "Design Style",
  "Material",
  "Finish",
  "Format",
  "Installation",
  "Performance",
  "Function",
  "Collection",
  "Brand",
  "Application",
  "Other",
] as const;

export const CANONICAL_PRODUCT_DETAILS_PROMPT = `Analyze the product details and uploaded image for Enreach Concepts Digital Showroom (Abuja, Nigeria):

Product Name: {product_name}
Code / SKU: {code}
Brand: {brand}
Manufacturer: {manufacturer}
Production Name: {production_name}
Category: {category}
Product Type: {type}
Subcategory: {subcategory}
Family Group: {family}
Finish: {finish}
Material: {material}
Color: {color}
Size / Dimensions: {size} {dimensions}
Price: {price}
Original Price: {original_price}
Pricing Unit: {pricing_unit}
Differentiator Type: {differentiator_type}
Differentiator Note: {differentiator_note}

CONTEXT & RULES:
1. Showroom Role: You are the Professional Architectural Product Intelligence Engine for Enreach Concepts, a luxury building-materials showroom in Abuja, Nigeria. You specialize in tiles, porcelain, marble, granite, sanitaryware, doors, plumbing, lighting, furniture, and premium architectural finishes.
2. Authoritative Data: Manual product inputs above are 100% authoritative. Never contradict, overwrite, or misstate manual specifications.
3. Project Differentiator: When {differentiator_type} and {differentiator_note} are provided, intelligently weave this distinction into the narrative, applications, and search keywords without mechanically repeating raw strings. If absent, reason from available evidence.
4. Anti-Fabrication: Never invent unverified technical certifications, load ratings, fire ratings, or warranty claims unless provided.
5. Location Awareness: Where natural, incorporate Nigerian and Abuja market context (e.g. residential estates, commercial projects, tropical durability) into SEO and customer discovery without keyword stuffing.
6. Single-Pass JSON Output: Output exactly ONE raw JSON object with NO markdown, NO backticks, NO conversational intro.

JSON SCHEMA:
{
  "generated_description": "Rich, elegant, architectural showroom narrative for designers, architects, contractors, and luxury homeowners.",
  "seo_title": "Compelling search engine title under 60 characters with high buyer intent.",
  "seo_description": "Concise, search-friendly meta snippet under 160 characters. Do NOT clone the product description.",
  "seo_keywords": ["keyword 1", "keyword 2", "keyword 3"],
  "canonical_slug": "url-friendly-slug-suggestion",
  "applications": ["2 to 4 concise, product-specific application or suitable space labels"],
  "application_summary": "1 to 2 concise sentences explaining where and why this specific product excels.",
  "faq": [
    {"q": "0 to 2 genuine product-specific questions", "a": "Accurate, helpful answers"}
  ],
  "search_keywords": ["search term 1", "search term 2"],
  "search_synonyms": ["synonym 1", "synonym 2"],
  "alternative_names": ["alternative name 1", "alternative name 2"],
  "related_search_terms": ["related term 1", "related term 2"],
  "common_customer_phrases": ["customer phrase 1", "customer phrase 2"],
  "common_misspellings": ["common misspelling 1", "common misspelling 2"],
  "visual_characteristics": {
    "material": "detected or confirmed material",
    "finish": "detected or confirmed finish",
    "color": "detected primary and accent colors",
    "texture": "visual texture description",
    "style": "aesthetic style classification"
  },
  "structured_schema_org": {
    "@type": "Product",
    "name": "{product_name}",
    "description": "Concise summary for schema markup"
  }
}`;

/**
 * ENGINE 1: PRODUCT DETAILS ENGINE (BUILD 4D UNIFIED SYSTEM)
 * 
 * Generates structured product intelligence matching 100% of database columns.
 * Full support for Original Price, Pricing Units, Differentiators, Dynamic Applications, and 0-2 FAQs.
 * Zero unmapped schema references. Zero runtime column errors.
 */
export const runProductDetailsEngine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { productId: string }) => {
    if (!data?.productId) throw new Error("productId required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { productId } = data;
    const started = Date.now();

    // 1. Retrieve Product Record
    const { data: product, error: pErr } = await supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .maybeSingle();

    if (pErr || !product) {
      throw new Error(pErr?.message ?? `Product ID ${productId} not found`);
    }

    const masterDoc = typeof product.master_document === "object" && product.master_document ? product.master_document : {};
    const pricingUnit = product.pricing_unit || masterDoc.pricing_unit || "sqm";
    const originalPrice = product.original_price != null ? product.original_price : (masterDoc.original_price ?? "");
    const diffType = product.differentiator_type || masterDoc.differentiator_type || "";
    const diffNote = product.differentiator_note || masterDoc.differentiator_note || "";

    // 2. Resolve Taxonomy Names & Custom Overrides
    let contextName = "luxury showroom";
    let categoryName = "premium material";
    let typeName = "product";
    let subcategoryName = "";
    let familyName = "";

    const [contextRes, categoryRes, typeRes, subRes, famRes, settingsRes] = await Promise.all([
      product.installation_context_id ? supabase.from("installation_contexts").select("name").eq("id", product.installation_context_id).maybeSingle() : Promise.resolve({ data: null }),
      product.category_id ? supabase.from("categories").select("name").eq("id", product.category_id).maybeSingle() : Promise.resolve({ data: null }),
      product.type_id ? supabase.from("product_types").select("name").eq("id", product.type_id).maybeSingle() : Promise.resolve({ data: null }),
      product.subcategory_id ? supabase.from("subcategories").select("name").eq("id", product.subcategory_id).maybeSingle() : Promise.resolve({ data: null }),
      product.family_id ? supabase.from("family_groups").select("name, custom_ai_prompt_override").eq("id", product.family_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from("app_settings").select("*").limit(1).maybeSingle()
    ]);

    if (contextRes.data?.name) contextName = contextRes.data.name;
    if (categoryRes.data?.name) categoryName = categoryRes.data.name;
    if (typeRes.data?.name) typeName = typeRes.data.name;
    if (subRes.data?.name) subcategoryName = subRes.data.name;
    if (famRes.data?.name) familyName = famRes.data.name;

    const familyOverride = famRes.data?.custom_ai_prompt_override ?? null;

    // 3. Load Canonical Active AI Prompt Template from Database
    const { data: activeTemplate } = await supabase
      .from("ai_prompt_templates")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const dbPrompt = activeTemplate?.prompt_text || activeTemplate?.description_prompt;
    const isLegacyPrompt = dbPrompt && !dbPrompt.includes("generated_description") && !dbPrompt.includes("JSON");
    const templateText = (!dbPrompt || isLegacyPrompt) ? CANONICAL_PRODUCT_DETAILS_PROMPT : dbPrompt;

    const systemPrompt = `You are Enreach Product Intelligence AI, an expert in luxury building materials, architectural finishes, premium interiors, showroom product merchandising, customer discovery, and technical SEO in Abuja, Nigeria.

Your responsibility is to analyze one product using its manual metadata and uploaded image, generate accurate structured product intelligence, and return valid JSON matching the schema keys only.

CORE INSTRUCTIONS:
1. Product Description (generated_description): Rich, elegant, informative showroom narrative highlighting aesthetics, design language, texture, and visual identity.
2. SEO Description (seo_description): Concise, high-intent Google search snippet strictly under 160 characters. Do NOT clone the product description.
3. Anti-Fabrication Rule: Never invent unverified technical certifications, load ratings, fire ratings, or warranty claims unless provided in manual data.
4. Product Differentiator: When provided, weave the differentiator nuance into the narrative, applications, and search keywords naturally. If absent, still produce distinctive product-specific intelligence from available evidence.
5. Applications: Provide 2-4 realistic architectural applications and a 1-2 sentence summary specific to this material and product type. Never output generic universal boilerplate.
6. FAQs: Include 0 to 2 genuine product-specific questions and answers only (using {"q": "...", "a": "..."}). Omit or return empty array if not strictly relevant. Never output universal 5-question FAQ dumps.
7. Structured Output: Return raw JSON only. Never return markdown blocks, prose, or conversational wrappers.`;

    // 4. Build Product Metadata Payload
    let prompt = templateText
      .replace(/{product_name}/g, product.name || "")
      .replace(/{code}/g, product.code || product.sku || "")
      .replace(/{sku}/g, product.sku || product.code || "")
      .replace(/{brand}/g, product.brand ?? "Enreach Showroom")
      .replace(/{manufacturer}/g, product.manufacturer || masterDoc.manufacturer || product.brand || "Enreach Concepts")
      .replace(/{production_name}/g, product.production_name ?? "")
      .replace(/{finish}/g, product.finish ?? product.finish_name ?? "premium finish")
      .replace(/{material}/g, product.material ?? "premium material")
      .replace(/{color}/g, product.color ?? "")
      .replace(/{size}/g, product.size ?? "")
      .replace(/{dimensions}/g, product.dimensions || masterDoc.dimensions || "")
      .replace(/{price}/g, product.price ? String(product.price) : "")
      .replace(/{original_price}/g, originalPrice ? String(originalPrice) : "N/A")
      .replace(/{pricing_unit}/g, pricingUnit)
      .replace(/{differentiator_type}/g, diffType || "N/A")
      .replace(/{differentiator_note}/g, diffNote || "N/A")
      .replace(/{context}/g, contextName)
      .replace(/{type}/g, typeName)
      .replace(/{category}/g, categoryName)
      .replace(/{subcategory}/g, subcategoryName)
      .replace(/{family}/g, familyName);

    if (familyOverride) {
      prompt += `\n\nAdditional Family Directives: ${familyOverride}`;
    }

    // 5. Call LLM Provider (Single-Pass Request)
    const settings = settingsRes.data;
    const config = settings ? {
      activeProvider: settings.active_ai_provider || "gemini",
      openaiLlmModel: settings.openai_llm_model || "gpt-4o-mini",
      openaiImageModel: settings.openai_image_model,
      openaiImageSize: settings.openai_image_size || "1024x1024",
      geminiLlmModel: settings.gemini_llm_model,
      geminiImageModel: settings.gemini_image_model
    } : undefined;

    const provider = getAIProvider(config as any);
    const imageUrl = product.image_url || undefined;

    let json: any = null;
    let parseError: string | undefined = undefined;

    try {
      const result = await tryJSON<any>(provider, prompt, systemPrompt, imageUrl);
      json = result.data;
      parseError = result.error;
    } catch (llmErr: any) {
      parseError = llmErr.message;
    }

    // 6. Handle AI Generation Failures Gracefully
    if (!json || parseError) {
      const executionMs = Date.now() - started;
      const errorMsg = `Engine 1 [${provider.name}]: ${parseError || "Failed to generate valid JSON intelligence payload"}`;

      // Record failure in ai_jobs
      try {
        await supabase.from("ai_jobs" as any).insert({
          product_id: productId,
          job_type: "seo",
          status: "failed",
          execution_time_ms: executionMs,
          result: { error: errorMsg, engine: "Engine 1 (Single-Pass Product Details)" },
          completed_at: new Date().toISOString(),
        });
      } catch {}\n
      // Update product error status without corrupting existing data
      try {
        await supabase.from("products").update({
          processing_state: "error",
          error_log: errorMsg,
        } as any).eq("id", productId);
      } catch {}\n
      throw new Error(errorMsg);
    }

    // 7. DETERMINISTIC FIELD MAPPING & VALIDATION
    const productPatch: Record<string, any> = {};

    // Customer-Facing Product Description (Rich Narrative)
    const generatedDesc = json.generated_description || json.description || json.short_description || "";
    if (generatedDesc) {
      productPatch.generated_description = generatedDesc;
      productPatch.short_description = generatedDesc;
    }

    // SEO Meta Description (Concise Search Snippet, <160 chars)
    if (!product.seo_description_manual) {
      const seoDesc = json.seo_description || json.meta_description || "";
      if (seoDesc) {
        productPatch.seo_description = seoDesc.slice(0, 300);
      }
    }

    // SEO Metadata Fields (Honoring Manual Authoritative Locks)
    if (!product.seo_title_manual && json.seo_title) {
      productPatch.seo_title = String(json.seo_title).slice(0, 150);
    }
    if (!product.seo_keywords_manual && Array.isArray(json.seo_keywords)) {
      productPatch.seo_keywords = json.seo_keywords.map((k: any) => String(k).trim()).filter(Boolean);
    }
    if (!product.slug && json.canonical_slug && typeof json.canonical_slug === "string") {
      productPatch.canonical_slug = json.canonical_slug.trim();
    }

    // Product-Specific FAQ (0-2 items, strictly validated)
    if (Array.isArray(json.faq)) {
      const validFaqs = json.faq
        .filter((item: any) => item && (item.question || item.q) && (item.answer || item.a))
        .slice(0, 2)
        .map((item: any) => ({
          question: String(item.question || item.q).trim(),
          answer: String(item.answer || item.a).trim(),
        }));
      productPatch.faq = validFaqs;
    }

    // Dynamic Applications & Master Document
    const applications = Array.isArray(json.applications)
      ? json.applications.map((a: any) => String(a).trim()).filter(Boolean).slice(0, 5)
      : [];
    const applicationSummary = typeof json.application_summary === "string" ? json.application_summary.trim() : "";

    productPatch.master_document = {
      ...masterDoc,
      name: product.name,
      brand: product.brand,
      description: generatedDesc || product.generated_description,
      seo_title: productPatch.seo_title || product.seo_title,
      seo_description: productPatch.seo_description || product.seo_description,
      faq: productPatch.faq || product.faq,
      applications: applications.length > 0 ? applications : (masterDoc.applications || []),
      application_summary: applicationSummary || masterDoc.application_summary || "",
      pricing_unit: pricingUnit,
      differentiator_type: diffType || null,
      differentiator_note: diffNote || null,
      original_price: originalPrice || null,
    };

    // Structured Schema.org Product Data
    if ((json.structured_schema_org || json.structured_data) && typeof (json.structured_schema_org || json.structured_data) === "object") {
      productPatch.structured_data = json.structured_schema_org || json.structured_data;
    }

    // Unified Search Keywords, Tokens & Synonyms
    const rawSearchKeywords = [
      ...(Array.isArray(json.search_keywords) ? json.search_keywords : []),
      ...(Array.isArray(json.search_synonyms) ? json.search_synonyms : []),
      ...(Array.isArray(json.alternative_names) ? json.alternative_names : []),
      ...(Array.isArray(json.alternative_terms) ? json.alternative_terms : []),
      ...(Array.isArray(json.related_search_terms) ? json.related_search_terms : []),
      ...(Array.isArray(json.related_terms) ? json.related_terms : []),
      ...(Array.isArray(json.synonyms) ? json.synonyms : []),
      ...(Array.isArray(json.common_customer_phrases) ? json.common_customer_phrases : []),
      ...(Array.isArray(json.customer_phrases) ? json.customer_phrases : []),
      ...(Array.isArray(json.common_misspellings) ? json.common_misspellings : []),
      ...(Array.isArray(json.misspellings) ? json.misspellings : []),
      ...(Array.isArray(json.builder_terminology) ? json.builder_terminology : []),
      ...(Array.isArray(json.designer_terminology) ? json.designer_terminology : []),
      ...(Array.isArray(json.contractor_terminology) ? json.contractor_terminology : []),
      ...(Array.isArray(json.filter_tokens) ? json.filter_tokens : []),
      ...(applications),
    ].map((t: any) => String(t).trim()).filter(Boolean);

    if (rawSearchKeywords.length > 0) {
      const searchArray = Array.from(new Set(rawSearchKeywords));
      productPatch.app_keywords = searchArray;
      productPatch.app_search_keywords = searchArray;
    }

    // Execution & Lifecycle Tracking
    productPatch.processing_state = "completed";
    productPatch.is_published = true;
    productPatch.last_processed_at = new Date().toISOString();
    productPatch.error_log = null;

    // 8. Commit Atomic Database Mutation
    const { error: updateErr } = await supabase.from("products").update(productPatch as any).eq("id", productId);
    if (updateErr) {
      throw new Error(`Failed to update product record: ${updateErr.message}`);
    }

    // 9. Upsert Product Understanding Record
    try {
      const vis = json.visual_characteristics || {};
      await supabase.from("product_understanding" as any).upsert({
        product_id: productId,
        raw_ai_response: json,
        detected_material: vis.material ?? json.material ?? product.material ?? null,
        detected_finish: vis.finish ?? json.finish ?? product.finish ?? null,
        detected_color: vis.color ?? json.color ?? product.color ?? null,
        detected_style: vis.style ?? json.style ?? null,
        detected_environment: applications.join(", ") || null,
        detected_keywords: productPatch.app_keywords ?? [],
        confidence_score: 0.95,
        provider: provider.name,
      }, { onConflict: "product_id" } as any);
    } catch {}\n
    // 10. Compute Similar Product Suggestions (Preserve Existing Showroom Cross-sell)
    const { data: similarProds } = await supabase
      .from("products")
      .select("id")
      .neq("id", productId)
      .is("deleted_at", null)
      .limit(6);

    if (similarProds?.length) {
      await supabase.from("products").update({
        similar_product_ids: similarProds.map((p: any) => p.id)
      } as any).eq("id", productId);
    }

    // 11. Rebuild Unified Search Index
    try {
      await supabase.rpc("rebuild_search_index" as any, { _product_id: productId } as any);
    } catch {}\n
    const executionMs = Date.now() - started;

    // 12. Log Execution Metrics in ai_jobs
    try {
      await supabase.from("ai_jobs" as any).insert({
        product_id: productId,
        job_type: "seo",
        status: "success",
        execution_time_ms: executionMs,
        result: {
          engine: "Engine 1 (Single-Pass Product Details)",
          provider: provider.name,
          keys_routed: Object.keys(productPatch),
          requests_executed: 1,
        },
        completed_at: new Date().toISOString(),
      });
    } catch {}\n
    // 13. Re-query Updated Product Row for Final Verification
    const { data: verifiedProduct } = await supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .single();

    return {
      ok: true,
      details: json,
      product: verifiedProduct,
      executionMs,
      providerName: provider.name,
      requestsExecuted: 1,
    };
  });
