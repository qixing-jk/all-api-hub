import { describe, expect, it } from "vitest"

import { NewApiModelSyncService } from "~/services/newApiModelSync/NewApiModelSyncService"

describe("NewApiModelSyncService - allowed model filtering", () => {
  const createService = (allowed?: string[]) =>
    new NewApiModelSyncService(
      "https://example.com",
      "dummy-token",
      "1",
      undefined,
      allowed
    )

  const callFilter = (service: NewApiModelSyncService, models: string[]) =>
    (service as any).filterAllowedModels(models) as string[]

  it("returns trimmed unique models when no allow-list exists", () => {
    const service = createService()

    const result = callFilter(service, [
      "  gpt-4o  ",
      "gpt-4o",
      "claude-3",
      "  "
    ])

    expect(result).toEqual(["gpt-4o", "claude-3"])
  })

  it("filters models using the configured allow-list", () => {
    const service = createService(["gpt-4o", "claude-3"])

    const result = callFilter(service, [
      " gpt-4o  ",
      "gpt-4o-mini",
      "claude-3",
      "unknown-model"
    ])

    expect(result).toEqual(["gpt-4o", "claude-3"])
  })

  it("deduplicates after filtering", () => {
    const service = createService(["gpt-4o"])

    const result = callFilter(service, ["gpt-4o", " gpt-4o  ", "gpt-4o"])

    expect(result).toEqual(["gpt-4o"])
  })
})
