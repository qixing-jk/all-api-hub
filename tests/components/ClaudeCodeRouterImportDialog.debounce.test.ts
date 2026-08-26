import { afterEach, describe, expect, it, vi } from "vitest"

const ENVIRONMENT_MODULE_PATH = "~/utils/core/environment"

describe("ClaudeCodeRouterImportDialog model-fetch debounce", () => {
  afterEach(() => {
    vi.resetModules()
    vi.doUnmock(ENVIRONMENT_MODULE_PATH)
  })

  it("uses no delay in test mode and the production delay elsewhere", async () => {
    vi.doMock(ENVIRONMENT_MODULE_PATH, () => ({
      isTestMode: () => true,
    }))
    const testModule = await import("~/components/ClaudeCodeRouterImportDialog")

    expect(testModule.UPSTREAM_MODEL_FETCH_DEBOUNCE_MS).toBe(0)

    vi.resetModules()
    vi.doMock(ENVIRONMENT_MODULE_PATH, () => ({
      isTestMode: () => false,
    }))
    const productionModule = await import(
      "~/components/ClaudeCodeRouterImportDialog"
    )

    expect(productionModule.UPSTREAM_MODEL_FETCH_DEBOUNCE_MS).toBe(300)
  })
})
