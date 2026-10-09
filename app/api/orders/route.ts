import { handle, json, readJson, clientIp, HttpError } from "@/lib/server/http";
import { placeRegularOrder } from "@/lib/server/orders";
import { rateLimitAllowed, rateLimitRecord } from "@/lib/server/db";
import { hashIp } from "@/lib/server/crypto";
import { serverEnv } from "@/lib/server/env";

// Main website checkout. Prices, availability, day cutoff and totals are all
// decided here, never by the browser.
export const POST = handle(async (req: Request) => {
  const body = await readJson(req);
  const bucket = `orders:${hashIp(clientIp(req), serverEnv().sessionSecret)}`;
  if (!(await rateLimitAllowed(bucket, 15, 10 * 60))) throw new HttpError(429, "Too many orders from this connection. Please WhatsApp 868-293-0570.");
  const receipt = await placeRegularOrder(body);
  if (!receipt.duplicate) await rateLimitRecord(bucket);
  return json({ order: receipt }, receipt.duplicate ? 200 : 201);
});
