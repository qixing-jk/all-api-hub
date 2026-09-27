import { describe, expectTypeOf, it } from "vitest"

import type {
  ProductAnalyticsEventName,
  ProductAnalyticsEventPayloadMap,
} from "~/services/productAnalytics/contracts"
import type { ProductAnalyticsEventAllowedKeys } from "~/services/productAnalytics/privacy"

/**
 * Payload keys that are missing from the privacy allow-list, per event.
 *
 * `sanitizeProductAnalyticsEvent` silently drops any property absent from
 * `EVENT_ALLOWED_KEYS[event]`, so a payload field that is declared but not
 * allow-listed becomes an invisible analytics gap: the code emits it, the
 * sanitizer discards it, and nothing fails. Asserting the type-level diff
 * here turns that drift into a compile error caught by `pnpm compile` in CI.
 */
type PayloadKeysMissingFromAllowList = {
  [E in ProductAnalyticsEventName]: Exclude<
    keyof ProductAnalyticsEventPayloadMap[E],
    ProductAnalyticsEventAllowedKeys[E][number]
  >
}

describe("analytics payload / privacy allow-list parity", () => {
  it("allows every declared payload field", () => {
    expectTypeOf<
      PayloadKeysMissingFromAllowList[ProductAnalyticsEventName]
    >().toEqualTypeOf<never>()
  })
})
