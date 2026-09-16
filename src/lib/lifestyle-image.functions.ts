import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAIProvider, AIProviderError } from "./ai-providers";

/**
 * Standalone Independent Lifestyle Image Generation Module (BUILD G)
 * 
 * Generates an installed/lifestyle product image from the original manufacturer product image
 * and the Universal Lifestyle Prompt template configured in the AI Control Center.
 * 
 * Strictly isolated: Does NOT invoke Product Understanding, SEO, Search, Recommendation, or Quality Validation.
 * Updates ONLY products.generated_installed_image and inserts a record into product_assets.
 */
export const generateStandaloneLifestyleImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { productId: string }) => {
    if (!data?.productId) throw new Error("productId required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { productId } = data;
    const started = Date.now();

    // 1. Retrieve Original Product Record
    const { data: product, error: pErr } = await supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .maybeSingle();

    if (pErr || !product) {
      return { ok: false, error: pErr?.message || "Product not found" };
    }

    // Require an original product image URL
    const originalImageUrl = product.image_url;
    if (!originalImageUrl) {
      return {
        ok: false,
        error: "Product has no original manufacturer image (image_url is required for lifestyle image generation).",
      };
    }

    // 2. Fetch Taxonomy Context for prompt enrichment
    const [tRes, cRes, sRes, fRes] = await Promise.all([
      product.type_id ? supabase.from("product_types").select("name").eq("id", product.type_id).maybeSingle() : Promise.resolve({ data: null }),
      product.category_id ? supabase.from("categories").select("name").eq("id", product.category_id).maybeSingle() : Promise.resolve({ data: null }),
      product.subcategory_id ? supabase.from("subcategories").select("name").eq("id", product.subcategory_id).maybeSingle() : Promise.resolve({ data: null }),
      product.family_id ? supabase.from("family_groups").select("name").eq("id", product.family_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);

    const typeName = tRes.data?.name || "Architectural Material";
    const catName = cRes.data?.name || "Finishes";
    const subName = sRes.data?.name || "General";
    const famName = fRes.data?.name || "";

    // 3. Load Active Universal Lifestyle Prompt Template from ai_prompt_templates
    let promptTemplate = "";
    let systemInstruction = "You are a world-class architectural photographer and 3D visualization artist creating ultra-luxury lifestyle scenes.";

    const { data: dbTemplate } = await supabase
      .from("ai_prompt_templates")
      .select("prompt_text, system_instruction")
      .eq("template_key", "lifestyle_image_generation")
      .eq("is_active", true)
      .maybeSingle();

    if (dbTemplate?.prompt_text) {
      promptTemplate = dbTemplate.prompt_text;
      if (dbTemplate.system_instruction) {
        systemInstruction = dbTemplate.system_instruction;
      }
    } else {
      // Fallback default lifestyle prompt template
      promptTemplate =
        "Create an ultra-photorealistic, luxury architectural showroom interior scene featuring the material {name} ({product_type} - {category} / {subcategory}). " +
        "The scene must highlight the genuine surface finish, tactile texture, lighting reflections, and elegant proportions of the material in a contemporary high-end residential or commercial living space in Abuja. " +
        "8k resolution, architectural digest photography, pristine ambient lighting, hyper-realistic details.";
    }

    // 4. Interpolate variables into prompt template
    const compiledPrompt = promptTemplate
      .replace(/{name}/g, product.name || "")
      .replace(/{code}/g, product.code || "")
      .replace(/{product_type}/g, typeName)
      .replace(/{category}/g, catName)
      .replace(/{subcategory}/g, subName)
      .replace(/{family}/g, famName)
      .replace(/{color}/g, product.color || "")
      .replace(/{material}/g, product.material || "")
      .replace(/{finish}/g, product.finish || "");

    // 5. Invoke AI Provider for Image Generation (e.g. DALL-E 3 / Flux)
    let generatedImageUrl: string | null = null;
    let providerName = "unknown";

    try {
      const provider = await getAIProvider(supabase);
      providerName = provider.providerName;

      // Check if provider supports image generation
      if (typeof provider.generateImage === "function") {
        const imgResult = await provider.generateImage(compiledPrompt, {
          referenceImageUrl: originalImageUrl,
          aspectRatio: "4:3",
          quality: "hd",
        });
        generatedImageUrl = imgResult.url;
      } else {
        // Fallback: If current text LLM provider doesn't support direct image generation,
        // create a stylized studio URL simulation or proxy via external endpoint
        return {
          ok: false,
          error: `Provider '${providerName}' does not support direct image generation API calls. Please configure an image-capable provider in Settings.`,
        };
      }
    } catch (aiErr: any) {
      const elapsed = Date.now() - started;

      // Log failure to ai_jobs
      await supabase.from("ai_jobs").insert({
        product_id: productId,
        stage: "lifestyle_image_generation",
        status: "failed",
        error_message: aiErr.message || "AI image generation failed",
        execution_time_ms: elapsed,
      });

      return {
        ok: false,
        error: aiErr.message || "AI image generation failed",
      };
    }

    if (!generatedImageUrl) {
      return {
        ok: false,
        error: "AI provider did not return a valid image URL.",
      };
    }

    const elapsed = Date.now() - started;

    // 6. Update ONLY products.generated_installed_image
    const { error: updateErr } = await supabase
      .from("products")
      .update({
        generated_installed_image: generatedImageUrl,
      } as any)
      .eq("id", productId);

    if (updateErr) {
      return {
        ok: false,
        error: "Failed to update product with generated installed image: " + updateErr.message,
      };
    }

    // 7. Insert entry into product_assets (Standalone Asset Vault)
    await supabase.from("product_assets").insert({
      product_id: productId,
      asset_type: "installed_image",
      storage_path: generatedImageUrl,
      public_url: generatedImageUrl,
      is_primary: false,
      metadata: {
        provider: providerName,
        generation_time_ms: elapsed,
        prompt: compiledPrompt,
      },
    });

    // 8. Log success to ai_jobs
    await supabase.from("ai_jobs").insert({
      product_id: productId,
      stage: "lifestyle_image_generation",
      status: "completed",
      execution_time_ms: elapsed,
    });

    return {
      ok: true,
      data: {
        installed_image_url: generatedImageUrl,
        generation_time_ms: elapsed,
      },
    };
  });
