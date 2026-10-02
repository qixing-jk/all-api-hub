import fs from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { fetchKimiPricingDoc } from "~/services/apiService/kimiOpenPlatform/pricingDoc"
import { fetchKimiPlatformText } from "~/services/apiService/kimiOpenPlatform/transport"

vi.mock("~/services/apiService/kimiOpenPlatform/transport", () => ({
  fetchKimiPlatformText: vi.fn(),
}))
afterEach(() => vi.resetAllMocks())

describe("Kimi public pricing document", () => {
  it.each(["usd", "cny"])(
    "parses the regional %s document through the public asset transport",
    async (region) => {
      const request = {
        baseUrl:
          region === "usd"
            ? "https://platform.kimi.ai"
            : "https://platform.kimi.com",
        abortSignal: new AbortController().signal,
      }
      vi.mocked(fetchKimiPlatformText).mockResolvedValue(
        fs.readFileSync(
          path.resolve("tests/fixtures/kimi", `pricing-doc.${region}.md`),
          "utf8",
        ),
      )
      const entries = await fetchKimiPricingDoc(request)
      expect(entries).toHaveLength(4)
      expect(
        entries.every(
          (entry) => entry.currency === (region === "usd" ? "USD" : "CNY"),
        ),
      ).toBe(true)
      expect(fetchKimiPlatformText).toHaveBeenCalledWith(
        request,
        "/docs/pricing.md",
      )
    },
  )
  it("propagates document failures without manufacturing prices", async () => {
    const failure = new Error("unavailable")
    vi.mocked(fetchKimiPlatformText).mockRejectedValue(failure)
    await expect(
      fetchKimiPricingDoc({ baseUrl: "https://platform.kimi.ai" }),
    ).rejects.toBe(failure)
  })
})
