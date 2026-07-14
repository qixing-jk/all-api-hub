import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { MODEL_LIST_TEST_IDS } from "~/features/ModelList/testIds"
import { TOKEN_PROVISIONING_TEST_IDS } from "~/features/TokenProvisioning/testIds"
import { runModelListCatalogScenario } from "~~/e2e/scenarios/modelListCatalog"
import { runModelToKeyManagementScenario } from "~~/e2e/scenarios/modelToKeyManagement"
import { expectPermissionOnboardingHidden } from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"
import {
  getRealSiteModelToKeySkipReason,
  maybeRunRealSiteModelToKeyScenario,
  resolveRealSiteModelToKeyConfig,
} from "~~/e2e/utils/realSite/modelToKey"

const mocks = vi.hoisted(() => ({
  expect: vi.fn((_locator?: unknown) => ({
    toBeVisible: vi.fn().mockResolvedValue(undefined),
    toHaveCount: vi.fn().mockResolvedValue(undefined),
    toHaveValue: vi.fn().mockResolvedValue(undefined),
    toHaveURL: vi.fn().mockResolvedValue(undefined),
    toBe: vi.fn((expected: unknown) => {
      expect(locator).toBe(expected)
    }),
  })),
  runModelListCatalogScenario: vi.fn(),
  deleteTokenFromKeyManagementPage: vi.fn(),
  expectPermissionOnboardingHidden: vi.fn(),
  waitForExtensionRoot: vi.fn(),
}))

vi.mock("~~/e2e/fixtures/extensionTest", () => ({
  expect: mocks.expect,
}))

vi.mock("~~/e2e/scenarios/modelListCatalog", () => ({
  runModelListCatalogScenario: mocks.runModelListCatalogScenario,
}))

vi.mock("~~/e2e/utils/accountLifecycle", () => ({
  deleteTokenFromKeyManagementPage: mocks.deleteTokenFromKeyManagementPage,
}))

vi.mock("~~/e2e/utils/extensionState", () => ({
  expectPermissionOnboardingHidden: mocks.expectPermissionOnboardingHidden,
}))

vi.mock("~~/e2e/utils/lazyLoading", () => ({
  waitForExtensionRoot: mocks.waitForExtensionRoot,
}))

describe("model-to-key E2E scenario", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.expect.mockImplementation(createE2eAssertions)
  })

  it("creates a model-scoped key from an account model catalog and opens Key Management", async () => {
    const page = createModelToKeyPage()

    vi.mocked(runModelListCatalogScenario).mockResolvedValue(page)

    const result = await runModelToKeyManagementScenario({
      page,
      extensionId: "extension-id",
      accountId: "account-1",
      modelId: "gpt-model-key-mini",
      createdKeyName: "model gpt-model-key-mini",
      expectedModelDialogLabels: ["vip"],
      expectedAddKeyDialogLabels: ["vip - VIP"],
      expectedKeyManagementLabels: ["vip"],
    })

    expect(runModelListCatalogScenario).toHaveBeenCalledWith({
      page,
      extensionId: "extension-id",
      source: { accountId: "account-1" },
      expectations: undefined,
    })
    expect(result).toBe(page)
    expect(page.url()).toBe(
      "chrome-extension://extension-id/options.html?accountId=account-1#keys",
    )
    expect(waitForExtensionRoot).toHaveBeenCalledWith(page)
    expect(expectPermissionOnboardingHidden).toHaveBeenCalledWith(page)
  })

  it("uses the first visible catalog model when no model id is configured", async () => {
    const page = createModelToKeyPage({
      inferredTokenName: "model gpt-visible-real-site-model",
      createdTokenName: "model gpt-visible-real-site-model",
    })

    vi.mocked(runModelListCatalogScenario).mockResolvedValue(page)

    await runModelToKeyManagementScenario({
      page,
      extensionId: "extension-id",
      accountId: "account-1",
      cleanupCreatedKey: true,
    })

    expect(mocks.deleteTokenFromKeyManagementPage).toHaveBeenCalledWith({
      page,
      token: {
        id: "created-token-id",
        name: "model gpt-visible-real-site-model",
      },
    })
  })

  it("cleans up the actual Key Management token row when the backend normalizes the submitted name", async () => {
    const page = createModelToKeyPage({
      inferredTokenName: "model [official]claude-opus",
      selectedCompatibleKeyName: "model 【official】claude-opus",
      createdTokenName: "model 【official】claude-opus",
    })

    vi.mocked(runModelListCatalogScenario).mockResolvedValue(page)

    await runModelToKeyManagementScenario({
      page,
      extensionId: "extension-id",
      accountId: "account-1",
      cleanupCreatedKey: true,
    })

    expect(mocks.deleteTokenFromKeyManagementPage).toHaveBeenCalledWith({
      page,
      token: {
        id: "created-token-id",
        name: "model 【official】claude-opus",
      },
    })
  })

  it("ignores the compatible key select placeholder when resolving the created Key Management token", async () => {
    const page = createModelToKeyPage({
      selectedCompatibleKeyName: "Select a key",
    })

    vi.mocked(runModelListCatalogScenario).mockResolvedValue(page)

    await runModelToKeyManagementScenario({
      page,
      extensionId: "extension-id",
      accountId: "account-1",
      modelId: "gpt-model-key-mini",
      createdKeyName: "model gpt-model-key-mini",
      cleanupCreatedKey: true,
    })

    expect(page.getByRole).toHaveBeenCalledWith("heading", {
      name: "model gpt-model-key-mini",
      exact: true,
    })
    expect(page.getByRole).not.toHaveBeenCalledWith("heading", {
      name: "Select a key",
      exact: true,
    })
  })

  it("still verifies the model key dialog leaves the empty state when the compatible key select shows a placeholder", async () => {
    const page = createModelToKeyPage({
      selectedCompatibleKeyName: "Select a key",
    })

    vi.mocked(runModelListCatalogScenario).mockResolvedValue(page)

    await runModelToKeyManagementScenario({
      page,
      extensionId: "extension-id",
      accountId: "account-1",
      modelId: "gpt-model-key-mini",
      createdKeyName: "model gpt-model-key-mini",
    })

    expect(page.keyDialog.getByText).toHaveBeenCalledWith(
      "No compatible keys for gpt-model-key-mini",
    )
    const keyDialogGetByTextCalls = page.keyDialog.getByText.mock.calls as [
      string,
      ...unknown[],
    ][]
    expect(
      keyDialogGetByTextCalls.filter(
        ([text]) => text === "No compatible keys for gpt-model-key-mini",
      ),
    ).toHaveLength(2)
  })

  it("cleans up the created key when cleanup is enabled", async () => {
    const page = createModelToKeyPage()

    vi.mocked(runModelListCatalogScenario).mockResolvedValue(page)

    await runModelToKeyManagementScenario({
      page,
      extensionId: "extension-id",
      accountId: "account-1",
      modelId: "gpt-model-key-mini",
      createdKeyName: "model gpt-model-key-mini",
      cleanupCreatedKey: true,
    })

    expect(mocks.deleteTokenFromKeyManagementPage).toHaveBeenCalledWith({
      page,
      token: {
        id: "created-token-id",
        name: "model gpt-model-key-mini",
      },
    })
  })

  it("cleans up the created key when post-creation verification fails", async () => {
    const error = new Error("post-create verification failed")
    const page = createModelToKeyPage({
      tokenRowGetByText: vi.fn((text: string) => {
        if (text === "vip") {
          throw error
        }

        return {
          toString: () => "created token row text",
        }
      }),
    })

    vi.mocked(runModelListCatalogScenario).mockResolvedValue(page)

    await expect(
      runModelToKeyManagementScenario({
        page,
        extensionId: "extension-id",
        accountId: "account-1",
        modelId: "gpt-model-key-mini",
        createdKeyName: "model gpt-model-key-mini",
        expectedKeyManagementLabels: ["vip"],
        cleanupCreatedKey: true,
      }),
    ).rejects.toThrow(error)

    expect(mocks.deleteTokenFromKeyManagementPage).toHaveBeenCalledWith({
      page,
      token: {
        id: "created-token-id",
        name: "model gpt-model-key-mini",
      },
    })
  })

  it("resolves the token row during cleanup when verification fails before recording it", async () => {
    const error = new Error("prepare failed")
    const page = createModelToKeyPage()

    vi.mocked(runModelListCatalogScenario).mockResolvedValue(page)

    await expect(
      runModelToKeyManagementScenario({
        page,
        extensionId: "extension-id",
        accountId: "account-1",
        modelId: "gpt-model-key-mini",
        createdKeyName: "model gpt-model-key-mini",
        prepareKeyManagementPage: vi.fn().mockRejectedValue(error),
        cleanupCreatedKey: true,
      }),
    ).rejects.toThrow(error)

    expect(mocks.deleteTokenFromKeyManagementPage).toHaveBeenCalledWith({
      page,
      token: {
        id: "created-token-id",
        name: "model gpt-model-key-mini",
      },
    })
  })

  it("does not fall back to name-only cleanup when the created token row cannot be resolved", async () => {
    const page = createModelToKeyPage({
      tokenRowsCountError: new Error("no token rows"),
    })

    vi.mocked(runModelListCatalogScenario).mockResolvedValue(page)

    await expect(
      runModelToKeyManagementScenario({
        page,
        extensionId: "extension-id",
        accountId: "account-1",
        modelId: "gpt-model-key-mini",
        createdKeyName: "model gpt-model-key-mini",
        cleanupCreatedKey: true,
      }),
    ).rejects.toThrow("no token rows")

    expect(mocks.deleteTokenFromKeyManagementPage).not.toHaveBeenCalled()
  })
})

describe("real-site model-to-key config", () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it.each(["NEW_API", "VELOERA", "ONE_HUB", "DONE_HUB"] as const)(
    "runs supported %s model-to-key without model env config",
    (envPrefix) => {
      expect(resolveRealSiteModelToKeyConfig(envPrefix)).toEqual({})
    },
  )

  it("does not resolve unsupported Sub2API model-to-key config", () => {
    expect(resolveRealSiteModelToKeyConfig("SUB2API")).toBeNull()
  })

  it("reports unsupported model-to-key prefixes separately from missing env", () => {
    expect(getRealSiteModelToKeySkipReason("SUB2API", "Sub2API")).toBe(
      "Sub2API model-to-key flow skipped because this site type does not expose an account-backed model catalog.",
    )
  })

  it("skips real-site model-to-key when the site account has no available model", async () => {
    const testInfo = {
      annotations: [],
    } as any

    await maybeRunRealSiteModelToKeyScenario({
      testInfo,
      page: {} as any,
      extensionId: "extension-id",
      accountId: "account-1",
      envPrefix: "DONE_HUB",
      label: "DoneHub",
      hasAvailableModel: false,
    })

    expect(testInfo.annotations).toEqual([
      {
        type: "skip",
        description:
          "DoneHub model-to-key flow skipped because no account-backed model is available.",
      },
    ])
  })
})

function createE2eAssertions(locator?: unknown) {
  return {
    toBeVisible: vi.fn().mockResolvedValue(undefined),
    toHaveCount: vi.fn().mockResolvedValue(undefined),
    toHaveValue: vi.fn().mockResolvedValue(undefined),
    toHaveURL: vi.fn(async (matcher: unknown) => {
      if (typeof matcher !== "function") return

      const url = (locator as { url?: () => string } | undefined)?.url?.()
      if (!url || !(matcher as (url: URL) => boolean)(new URL(url))) {
        throw new Error(`Expected page URL to match, received ${url ?? "none"}`)
      }
    }),
    toBe: vi.fn(),
  }
}

function createModelToKeyPage(
  options: {
    inferredTokenName?: string
    selectedCompatibleKeyName?: string
    createdTokenName?: string
    tokenRowGetByText?: (text: string) => unknown
    tokenRowsCountError?: Error
  } = {},
) {
  let currentUrl =
    "chrome-extension://extension-id/options.html?accountId=account-1#models"
  const tokenNameInput = {
    inputValue: vi
      .fn()
      .mockResolvedValue(
        options.inferredTokenName ?? "model gpt-model-key-mini",
      ),
    fill: vi.fn().mockResolvedValue(undefined),
    toString: () => "token name input",
  }
  const addKeyDialog = {
    locator: vi.fn(() => tokenNameInput),
    getByText: vi.fn(() => ({
      toString: () => "add key dialog text",
    })),
    getByTestId: vi.fn(() => ({
      click: vi.fn().mockResolvedValue(undefined),
    })),
    toString: () => "add key dialog",
  }
  const openKeyManagementButton = {
    click: vi.fn(async () => {
      currentUrl =
        "chrome-extension://extension-id/options.html?accountId=account-1#keys"
    }),
  }
  const keyDialog = {
    getByRole: vi.fn(() => ({
      innerText: vi
        .fn()
        .mockResolvedValue(options.selectedCompatibleKeyName ?? ""),
    })),
    getByText: vi.fn(() => ({
      toString: () => "model key dialog text",
    })),
    getByTestId: vi.fn((testId: string) => {
      if (testId === MODEL_LIST_TEST_IDS.openKeyManagementButton) {
        return openKeyManagementButton
      }

      return {
        click: vi.fn().mockResolvedValue(undefined),
        testId,
      }
    }),
    toString: () => "model key dialog",
  }
  const tokenHeading = {
    innerText: vi
      .fn()
      .mockResolvedValue(
        options.createdTokenName ?? "model gpt-model-key-mini",
      ),
    toString: () => "created token heading",
  }
  const tokenRow = {
    getAttribute: vi
      .fn()
      .mockResolvedValue("key-management-token-row-created-token-id"),
    getByText: options.tokenRowGetByText
      ? vi.fn(options.tokenRowGetByText)
      : vi.fn(() => ({
          toString: () => "created token row text",
        })),
    locator: vi.fn(() => ({
      first: vi.fn(() => tokenHeading),
    })),
    toString: () => "created token row",
  }
  const tokenRows = {
    filter: vi.fn(() => tokenRows),
    first: vi.fn(() => tokenRow),
    toString: () => "created token rows",
  }

  if (options.tokenRowsCountError) {
    mocks.expect.mockImplementation((locator?: unknown) => {
      const assertions = createE2eAssertions(locator)
      if (locator === tokenRows) {
        return {
          ...assertions,
          toHaveCount: vi.fn().mockRejectedValue(options.tokenRowsCountError),
        }
      }

      return assertions
    })
  }

  return {
    keyDialog,
    context: vi.fn(() => "browser-context"),
    url: vi.fn(() => currentUrl),
    getByTestId: vi.fn((testId: string) => {
      if (testId === MODEL_LIST_TEST_IDS.modelKeyDialog) return keyDialog
      if (testId === TOKEN_PROVISIONING_TEST_IDS.addTokenDialog) {
        return addKeyDialog
      }

      return {
        first: vi.fn(() => ({
          click: vi.fn().mockResolvedValue(undefined),
          testId,
        })),
        click: vi.fn().mockResolvedValue(undefined),
        testId,
      }
    }),
    getByRole: vi.fn(() => ({
      toString: () => "created key heading",
    })),
    getByText: vi.fn(() => ({
      toString: () => "keys page text",
    })),
    locator: vi.fn(() => tokenRows),
  } as any
}
