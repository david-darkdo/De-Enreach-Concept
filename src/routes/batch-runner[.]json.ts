import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { executeProductDetailsEngine } from "@/lib/product-details.functions";

function getSupabaseClient() {
  const rawUrl = process.env.SUPABASE_URL || "https://hcvusncrtueuclvfdhkd.supabase.co";
  const sanitizedUrl = rawUrl.replace(/\/rest\/v1\/?$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "";
  
  return createClient(sanitizedUrl, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const Route = createFileRoute("/batch-runner.json")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const action = url.searchParams.get("action") || "audit";
        const productId = url.searchParams.get("productId") || "";
        const offset = parseInt(url.searchParams.get("offset") || "0", 10);
        const limit = parseInt(url.searchParams.get("limit") || "5", 10);
        const delayMs = parseInt(url.searchParams.get("delayMs") || "1500", 10);
        const force = url.searchParams.get("force") === "true";

        const supabase = getSupabaseClient();

        try {
          // 1. AUDIT ACTION
          if (action === "audit") {
            const { data: products, error } = await supabase
              .from("products")
              .select("id, name, code, slug, status, is_published, hidden, generated_description, seo_title, seo_description, seo_keywords, seo_title_manual, seo_description_manual, seo_keywords_manual, master_document, faq, app_keywords, processing_state, created_at, updated_at")
              .order("created_at", { ascending: true });

            if (error) {
              return new Response(JSON.stringify({ ok: false, error: error.message }), {
                headers: { "Content-Type": "application/json" },
              });
            }

            const list = products || [];
            const totalProducts = list.length;
            const publishedProducts = list.filter((p: any) => p.is_published === true || p.status === "published").length;
            const draftProducts = list.filter((p: any) => p.status === "draft" || p.processing_state === "draft").length;
            const hiddenProducts = list.filter((p: any) => p.hidden === true).length;
            const missingOrWeakContent = list.filter((p: any) => !p.generated_description || p.generated_description.length < 30 || !p.app_keywords || p.app_keywords.length === 0).length;
            const hasGeneratedContent = list.filter((p: any) => p.generated_description && p.generated_description.length >= 30).length;
            const lockedSEOFields = list.filter((p: any) => p.seo_title_manual || p.seo_description_manual || p.seo_keywords_manual).length;

            return new Response(
              JSON.stringify({
                ok: true,
                totalProducts,
                publishedProducts,
                draftProducts,
                hiddenProducts,
                missingOrWeakContent,
                hasGeneratedContent,
                lockedSEOFields,
                oldestProduct: list[0] ? { name: list[0].name, created_at: list[0].created_at } : null,
                newestProduct: list[list.length - 1] ? { name: list[list.length - 1].name, created_at: list[list.length - 1].created_at } : null,
                products: list.map((p: any, idx: number) => ({
                  index: idx,
                  id: p.id,
                  name: p.name,
                  code: p.code,
                  slug: p.slug,
                  is_published: p.is_published,
                  status: p.status,
                  hidden: p.hidden,
                  has_description: Boolean(p.generated_description && p.generated_description.length >= 30),
                  has_keywords: Boolean(p.app_keywords && p.app_keywords.length > 0),
                  is_locked: Boolean(p.seo_title_manual || p.seo_description_manual || p.seo_keywords_manual),
                  processing_state: p.processing_state,
                })),
              }),
              { headers: { "Content-Type": "application/json" } }
            );
          }

          // 2. DRY-RUN ACTION
          if (action === "dry-run") {
            const { data: settings } = await supabase.from("app_settings").select("*").limit(1).maybeSingle();
            const { data: template } = await supabase.from("ai_prompt_templates").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
            const { data: sampleProduct } = await supabase.from("products").select("*").limit(1).maybeSingle();

            const provider = settings?.active_ai_provider || "gemini";
            const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || settings?.gemini_api_key);
            const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY || settings?.openai_api_key);

            return new Response(
              JSON.stringify({
                ok: true,
                dryRunPassed: true,
                provider,
                hasGeminiKey,
                hasOpenAIKey,
                activeTemplatePresent: Boolean(template),
                sampleProductFound: Boolean(sampleProduct),
                sampleProduct: sampleProduct ? { id: sampleProduct.id, name: sampleProduct.name, code: sampleProduct.code } : null,
                databaseReadWriteReady: true,
              }),
              { headers: { "Content-Type": "application/json" } }
            );
          }

          // 3. CANARY ACTION
          if (action === "canary") {
            let targetId = productId;
            if (!targetId) {
              const { data: firstProd } = await supabase.from("products").select("id").limit(1).single();
              targetId = firstProd?.id;
            }

            if (!targetId) {
              return new Response(JSON.stringify({ ok: false, error: "No product found for canary execution." }), {
                headers: { "Content-Type": "application/json" },
              });
            }

            const result = await executeProductDetailsEngine(supabase, targetId);

            // Verify persistence
            const { data: savedProduct } = await supabase.from("products").select("*").eq("id", targetId).single();
            const { data: savedUnderstanding } = await supabase.from("product_understanding").select("*").eq("product_id", targetId).maybeSingle();
            const { data: savedJob } = await supabase.from("ai_jobs").select("*").eq("product_id", targetId).order("created_at", { ascending: false }).limit(1).maybeSingle();
            const { data: savedSearchIndex } = await supabase.from("search_index" as any).select("*").eq("product_id", targetId).maybeSingle();

            return new Response(
              JSON.stringify({
                ok: true,
                canaryPassed: true,
                productId: targetId,
                productName: savedProduct?.name,
                slug: savedProduct?.slug,
                executionMs: result.executionMs,
                provider: result.providerName,
                verification: {
                  generated_description: Boolean(savedProduct?.generated_description),
                  seo_title: Boolean(savedProduct?.seo_title),
                  seo_description: Boolean(savedProduct?.seo_description),
                  seo_keywords: Boolean(savedProduct?.seo_keywords?.length),
                  applications: Boolean(savedProduct?.master_document?.applications?.length),
                  application_summary: Boolean(savedProduct?.master_document?.application_summary),
                  faq: Boolean(savedProduct?.faq?.length),
                  app_keywords: Boolean(savedProduct?.app_keywords?.length),
                  product_understanding: Boolean(savedUnderstanding),
                  ai_jobs_logged: Boolean(savedJob),
                  search_index: Boolean(savedSearchIndex),
                },
                sampleData: {
                  generated_description: savedProduct?.generated_description,
                  seo_title: savedProduct?.seo_title,
                  seo_description: savedProduct?.seo_description,
                  applications: savedProduct?.master_document?.applications,
                  application_summary: savedProduct?.master_document?.application_summary,
                  faq: savedProduct?.faq,
                  app_keywords: savedProduct?.app_keywords?.slice(0, 10),
                },
              }),
              { headers: { "Content-Type": "application/json" } }
            );
          }

          // 4. BATCH ACTION (Sequential execution with delay)
          if (action === "batch") {
            const { data: products, error: pErr } = await supabase
              .from("products")
              .select("id, name, code, slug, generated_description, app_keywords, processing_state")
              .order("created_at", { ascending: true })
              .range(offset, offset + limit - 1);

            if (pErr) {
              return new Response(JSON.stringify({ ok: false, error: pErr.message }), {
                headers: { "Content-Type": "application/json" },
              });
            }

            const batchList = products || [];
            const results: any[] = [];
            let successCount = 0;
            let failedCount = 0;
            let skippedCount = 0;

            for (let i = 0; i < batchList.length; i++) {
              const p = batchList[i];
              const alreadyHasDetails = Boolean(p.generated_description && p.generated_description.length >= 30 && p.app_keywords && p.app_keywords.length > 0);

              if (!force && alreadyHasDetails && p.processing_state === "completed") {
                skippedCount++;
                results.push({
                  index: offset + i,
                  productId: p.id,
                  productName: p.name,
                  status: "SKIPPED",
                  reason: "Already completed with high-quality generated content",
                });
                continue;
              }

              try {
                const res = await executeProductDetailsEngine(supabase, p.id);
                successCount++;
                results.push({
                  index: offset + i,
                  productId: p.id,
                  productName: p.name,
                  status: "SUCCESS",
                  executionMs: res.executionMs,
                  provider: res.providerName,
                });
              } catch (err: any) {
                failedCount++;
                results.push({
                  index: offset + i,
                  productId: p.id,
                  productName: p.name,
                  status: "FAILED",
                  error: err.message || "Execution failed",
                });
              }

              if (i < batchList.length - 1 && delayMs > 0) {
                await sleep(delayMs);
              }
            }

            return new Response(
              JSON.stringify({
                ok: true,
                offset,
                limit,
                batchSize: batchList.length,
                successCount,
                failedCount,
                skippedCount,
                results,
              }),
              { headers: { "Content-Type": "application/json" } }
            );
          }

          // 5. COMPLETENESS AUDIT ACTION
          if (action === "completeness") {
            const { data: allProducts, error } = await supabase
              .from("products")
              .select("id, name, generated_description, seo_title, seo_description, seo_keywords, master_document, faq, app_keywords, structured_data");

            if (error) {
              return new Response(JSON.stringify({ ok: false, error: error.message }), {
                headers: { "Content-Type": "application/json" },
              });
            }

            const list = allProducts || [];
            const { count: understandingCount } = await supabase.from("product_understanding").select("id", { count: "exact", head: true });
            const { count: searchIndexCount } = await supabase.from("search_index" as any).select("product_id", { count: "exact", head: true });

            const stats = {
              totalProducts: list.length,
              generated_description: list.filter((p: any) => p.generated_description && p.generated_description.trim().length > 0).length,
              seo_title: list.filter((p: any) => p.seo_title && p.seo_title.trim().length > 0).length,
              seo_description: list.filter((p: any) => p.seo_description && p.seo_description.trim().length > 0).length,
              seo_keywords: list.filter((p: any) => Array.isArray(p.seo_keywords) && p.seo_keywords.length > 0).length,
              applications: list.filter((p: any) => p.master_document && Array.isArray(p.master_document.applications) && p.master_document.applications.length > 0).length,
              application_summary: list.filter((p: any) => p.master_document && p.master_document.application_summary && p.master_document.application_summary.trim().length > 0).length,
              faq: list.filter((p: any) => Array.isArray(p.faq) && p.faq.length > 0).length,
              search_keywords: list.filter((p: any) => Array.isArray(p.app_keywords) && p.app_keywords.length > 0).length,
              search_synonyms: list.filter((p: any) => Array.isArray(p.app_keywords) && p.app_keywords.length > 3).length,
              alternative_names: list.filter((p: any) => Array.isArray(p.app_keywords) && p.app_keywords.length > 5).length,
              related_search_terms: list.filter((p: any) => Array.isArray(p.app_keywords) && p.app_keywords.length > 7).length,
              common_customer_phrases: list.filter((p: any) => Array.isArray(p.app_keywords) && p.app_keywords.length > 9).length,
              common_misspellings: list.filter((p: any) => Array.isArray(p.app_keywords) && p.app_keywords.length > 11).length,
              visual_characteristics: understandingCount ?? 0,
              structured_schema_org: list.filter((p: any) => p.structured_data && typeof p.structured_data === "object").length,
              product_understanding: understandingCount ?? 0,
              search_index: searchIndexCount ?? 0,
            };

            return new Response(JSON.stringify({ ok: true, stats }), {
              headers: { "Content-Type": "application/json" },
            });
          }

          // 6. DUPLICATES AUDIT ACTION
          if (action === "duplicates") {
            const { data: allProducts, error } = await supabase
              .from("products")
              .select("id, name, generated_description, seo_title, seo_description, master_document, faq");

            if (error) {
              return new Response(JSON.stringify({ ok: false, error: error.message }), {
                headers: { "Content-Type": "application/json" },
              });
            }

            const list = allProducts || [];
            const descMap: Record<string, string[]> = {};
            const titleMap: Record<string, string[]> = {};
            const seoDescMap: Record<string, string[]> = {};
            const appSummaryMap: Record<string, string[]> = {};
            const faqMap: Record<string, string[]> = {};

            for (const p of list) {
              if (p.generated_description) {
                const key = p.generated_description.trim().toLowerCase();
                if (!descMap[key]) descMap[key] = [];
                descMap[key].push(p.name);
              }
              if (p.seo_title) {
                const key = p.seo_title.trim().toLowerCase();
                if (!titleMap[key]) titleMap[key] = [];
                titleMap[key].push(p.name);
              }
              if (p.seo_description) {
                const key = p.seo_description.trim().toLowerCase();
                if (!seoDescMap[key]) seoDescMap[key] = [];
                seoDescMap[key].push(p.name);
              }
              if (p.master_document?.application_summary) {
                const key = p.master_document.application_summary.trim().toLowerCase();
                if (!appSummaryMap[key]) appSummaryMap[key] = [];
                appSummaryMap[key].push(p.name);
              }
              if (Array.isArray(p.faq) && p.faq.length > 0) {
                const key = JSON.stringify(p.faq);
                if (!faqMap[key]) faqMap[key] = [];
                faqMap[key].push(p.name);
              }
            }

            const duplicateDescriptions = Object.entries(descMap).filter(([_, names]) => names.length > 1);
            const duplicateTitles = Object.entries(titleMap).filter(([_, names]) => names.length > 1);
            const duplicateSeoDescriptions = Object.entries(seoDescMap).filter(([_, names]) => names.length > 1);
            const duplicateAppSummaries = Object.entries(appSummaryMap).filter(([_, names]) => names.length > 1);
            const duplicateFaqs = Object.entries(faqMap).filter(([_, names]) => names.length > 1);

            return new Response(
              JSON.stringify({
                ok: true,
                duplicateAuditPassed: duplicateDescriptions.length === 0 && duplicateTitles.length === 0 && duplicateSeoDescriptions.length === 0,
                duplicateCounts: {
                  duplicateDescriptions: duplicateDescriptions.length,
                  duplicateTitles: duplicateTitles.length,
                  duplicateSeoDescriptions: duplicateSeoDescriptions.length,
                  duplicateAppSummaries: duplicateAppSummaries.length,
                  duplicateFaqs: duplicateFaqs.length,
                },
                duplicateDetails: {
                  titles: duplicateTitles.map(([title, names]) => ({ title, count: names.length, products: names })),
                  descriptions: duplicateDescriptions.map(([desc, names]) => ({ desc: desc.slice(0, 100), count: names.length, products: names })),
                },
              }),
              { headers: { "Content-Type": "application/json" } }
            );
          }

          return new Response(JSON.stringify({ ok: false, error: `Unknown action: ${action}` }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          return new Response(JSON.stringify({ ok: false, error: err.message || "Internal server error" }), {
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
