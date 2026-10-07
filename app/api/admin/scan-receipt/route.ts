import { handle, json, readJson, HttpError } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/adminAuth";
import { serverEnv } from "@/lib/server/env";

// Receipt scanning for the Accounts page. Runs on the server so the
// Anthropic API key (ANTHROPIC_API_KEY in Vercel) is never sent to the browser.
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export const POST = handle(async (req: Request) => {
  await requireAdmin(req);
  const env = serverEnv();
  if (!env.anthropicApiKey) throw new HttpError(503, "Receipt scanning is not set up (ANTHROPIC_API_KEY is missing).");
  const b = await readJson<{ image?: unknown; mediaType?: unknown; categories?: unknown }>(req, 7_000_000);
  if (typeof b.image !== "string" || !TYPES.includes(String(b.mediaType))) throw new HttpError(400, "Upload a JPG, PNG, WEBP or GIF photo.");
  const categories = Array.isArray(b.categories) ? b.categories.map(String).slice(0, 30).join(", ") : "Ingredients, Packaging, Other";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": env.anthropicApiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6", max_tokens: 1000,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: b.mediaType, data: b.image } },
        { type: "text", text: `You are analyzing a receipt for The Club Boils, a seafood business in Trinidad. Extract all line items. For each item pick the best category from: ${categories}. Return ONLY JSON: {"items":[{"description":"string","amount":number,"category":"string"}],"total":number,"date":"YYYY-MM-DD or empty","supplier":"store name or empty"}` },
      ] }],
    }),
  });
  if (!res.ok) throw new HttpError(502, "Could not read receipt. Try a clearer photo or enter manually.");
  const data = await res.json();
  const text: string = data?.content?.[0]?.text || "";
  try {
    return json({ result: JSON.parse(text.replace(/```json|```/g, "").trim()) });
  } catch {
    throw new HttpError(502, "Could not read receipt. Try a clearer photo or enter manually.");
  }
});
