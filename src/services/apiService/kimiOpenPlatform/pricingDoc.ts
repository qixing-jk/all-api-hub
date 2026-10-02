import type { ApiServiceRequest } from "~/services/apiTransport/type"
import {
  parseKimiPricingDoc,
  type KimiPricingDocEntry,
} from "~/services/kimiOpenPlatform/pricingDoc"

import { fetchKimiPlatformText } from "./transport"

/**
 * The platform serves each documentation page as raw Markdown next to its
 * rendered route, so the price table is readable without a browser.
 */
const KIMI_PRICING_DOC_PATH = "/docs/pricing.md"

/**
 * Reads the price table published for the deployment the request points at.
 *
 * The document is per deployment — the China console publishes CNY and the
 * global console USD — and the parsed rows carry the symbol they were written
 * with, so callers can tell which prices the canonical USD field can hold.
 */
export async function fetchKimiPricingDoc(
  request: Pick<ApiServiceRequest, "baseUrl" | "abortSignal">,
): Promise<KimiPricingDocEntry[]> {
  return parseKimiPricingDoc(
    await fetchKimiPlatformText(request, KIMI_PRICING_DOC_PATH),
  )
}
