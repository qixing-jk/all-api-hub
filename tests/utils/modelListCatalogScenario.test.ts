import { beforeEach, describe, expect, it, vi } from "vitest"

import { MODEL_LIST_TEST_IDS } from "~/features/ModelList/testIds"
import { runModelListCatalogScenario } from "~~/e2e/scenarios/modelListCatalog"

const mocks = vi.hoisted(() => {
  type MockedPlaywrightExpect = ReturnType<typeof vi.fn>

  return {
    expect: vi.fn((target: unknown) => ({
      target,
      toBeVisible: vi.fn().mockResolvedValue(undefined),
      toContainText: vi.fn().mockResolvedValue(undefined),
    })) as MockedPlaywrightExpect,
    expectPermissionOnboardingHidden: vi.fn(),
    waitForExtensionRoot: vi.fn(),
  }
})

vi.mock("~~/e2e/fixtures/extensionTest", () => ({
  expect: mocks.expect,
}))

vi.mock("~~/e2e/utils/extensionState", () => ({
  expectPermissionOnboardingHidden: mocks.expectPermissionOnboardingHidden,
}))

vi.mock("~~/e2e/utils/lazyLoading", () => ({
  waitForExtensionRoot: mocks.waitForExtensionRoot,
}))

describe("model list catalog E2E scenario", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("allows an empty catalog when the real-site account has no available models", async () => {
    const page = createModelListPage()

    await runModelListCatalogScenario({
      page: page as any,
      extensionId: "extension-id",
      source: { accountId: "account-1" },
      expectations: {
        allowEmptyCatalog: true,
      },
    })

    expect(page.goto).toHaveBeenCalledWith(
      "chrome-extension://extension-id/options.html?accountId=account-1#models",
    )
    expect(page.getByTestId).toHaveBeenCalledWith(MODEL_LIST_TEST_IDS.page)
    expect(page.getByTestId).toHaveBeenCalledWith(
      MODEL_LIST_TEST_IDS.controlPanel,
    )
    expect(page.getByTestId).not.toHaveBeenCalledWith(
      MODEL_LIST_TEST_IDS.modelDisplay,
    )
  })
})

function createModelListPage() {
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    getByTestId: vi.fn((testId: string) => ({
      testId,
      toString: () => testId,
    })),
    getByRole: vi.fn(() => ({
      toString: () => "heading",
    })),
    getByText: vi.fn((text: string | RegExp) => ({
      text,
      toString: () => String(text),
    })),
  }
}
