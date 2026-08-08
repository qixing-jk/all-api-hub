import type { Page } from "@playwright/test"
import { describe, expect, it, vi } from "vitest"

import { sendTypedRuntimeMessageFromPage } from "~~/e2e/utils/runtimeMessaging"

describe("sendTypedRuntimeMessageFromPage", () => {
  it("uses distinct numeric ids for messages created in the same millisecond", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_234)

    try {
      const evaluate = vi.fn(
        async (_expression: unknown, envelope: Record<string, unknown>) =>
          envelope,
      )
      const page = { evaluate } as unknown as Page

      const envelopes = await Promise.all([
        sendTypedRuntimeMessageFromPage<Record<string, unknown>>(
          page,
          "example:first",
        ),
        sendTypedRuntimeMessageFromPage<Record<string, unknown>>(
          page,
          "example:second",
        ),
      ])

      expect(envelopes.map(({ id }) => typeof id)).toEqual(["number", "number"])
      expect(new Set(envelopes.map(({ id }) => id)).size).toBe(2)
      expect(envelopes.map(({ timestamp }) => timestamp)).toEqual([
        1_234, 1_234,
      ])
    } finally {
      nowSpy.mockRestore()
    }
  })
})
