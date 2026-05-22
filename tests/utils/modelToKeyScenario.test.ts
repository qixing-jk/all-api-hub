import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { MODEL_LIST_TEST_IDS } from "~/features/ModelList/testIds"
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
    toBe: vi.fn(),
  })),
  runModelListCatalogScenario: vi.fn(),
  waitForExtensionPage: vi.fn(),
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

vi.mock("~~/e2e/utils/commonUserFlows", () => ({
  waitForExtensionPage: mocks.waitForExtensionPage,
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
    mocks.expect.mockImplementation((_locator?: unknown) => ({
      toBeVisible: vi.fn().mockResolvedValue(undefined),
      toHaveCount: vi.fn().mockResolvedValue(undefined),
      toHaveValue: vi.fn().mockResolvedValue(undefined),
      toHaveURL: vi.fn().mockResolvedValue(undefined),
      toBe: vi.fn(),
    }))
  })

  it("creates a model-scoped key from an account model catalog and opens Key Management", async () => {
    const modelPage = createModelPage()
    const keysPage = createKeysPage()

    vi.mocked(runModelListCatalogScenario).mockResolvedValue(modelPage)
    vi.mocked(mocks.waitForExtensionPage).mockResolvedValue(keysPage)

    await runModelToKeyManagementScenario({
      page: {} as any,
      extensionId: "extension-id",
      accountId: "account-1",
      modelId: "gpt-model-key-mini",
      createdKeyName: "model gpt-model-key-mini",
      expectedModelDialogLabels: ["vip"],
      expectedAddKeyDialogLabels: ["vip - VIP"],
      expectedKeyManagementLabels: ["vip"],
    })

    expect(runModelListCatalogScenario).toHaveBeenCalledWith({
      page: {},
      extensionId: "extension-id",
      source: { accountId: "account-1" },
      expectations: undefined,
    })
    expect(mocks.waitForExtensionPage).toHaveBeenCalledWith(
      "browser-context",
      expect.objectContaining({
        extensionId: "extension-id",
        hash: "#keys",
        reuseExistingPage: false,
        searchParams: { accountId: "account-1" },
      }),
    )
    expect(waitForExtensionRoot).toHaveBeenCalledWith(keysPage)
    expect(expectPermissionOnboardingHidden).toHaveBeenCalledWith(keysPage)
  })

  it("uses the first visible catalog model when no model id is configured", async () => {
    const modelPage = createModelPage({
      inferredTokenName: "model gpt-visible-real-site-model",
    })
    const keysPage = createKeysPage({
      createdTokenName: "model gpt-visible-real-site-model",
      url: vi.fn(
        () =>
          "chrome-extension://extension-id/options.html?accountId=account-1#keys",
      ),
    })

    vi.mocked(runModelListCatalogScenario).mockResolvedValue(modelPage)
    vi.mocked(mocks.waitForExtensionPage).mockResolvedValue(keysPage)

    await runModelToKeyManagementScenario({
      page: {} as any,
      extensionId: "extension-id",
      accountId: "account-1",
      cleanupCreatedKey: true,
    })

    expect(mocks.deleteTokenFromKeyManagementPage).toHaveBeenCalledWith({
      page: keysPage,
      token: {
        id: "created-token-id",
        name: "model gpt-visible-real-site-model",
      },
    })
  })

  it("cleans up the actual Key Management token row when the backend normalizes the submitted name", async () => {
    const modelPage = createModelPage({
      inferredTokenName: "model [official]claude-opus",
      selectedCompatibleKeyName: "model 【official】claude-opus",
    })
    const keysPage = createKeysPage({
      createdTokenName: "model 【official】claude-opus",
    })

    vi.mocked(runModelListCatalogScenario).mockResolvedValue(modelPage)
    vi.mocked(mocks.waitForExtensionPage).mockResolvedValue(keysPage)

    await runModelToKeyManagementScenario({
      page: {} as any,
      extensionId: "extension-id",
      accountId: "account-1",
      cleanupCreatedKey: true,
    })

    expect(mocks.deleteTokenFromKeyManagementPage).toHaveBeenCalledWith({
      page: keysPage,
      token: {
        id: "created-token-id",
        name: "model 【official】claude-opus",
      },
    })
  })

  it("cleans up the created key when cleanup is enabled", async () => {
    const modelPage = createModelPage()
    const keysPage = createKeysPage()

    vi.mocked(runModelListCatalogScenario).mockResolvedValue(modelPage)
    vi.mocked(mocks.waitForExtensionPage).mockResolvedValue(keysPage)

    await runModelToKeyManagementScenario({
      page: {} as any,
      extensionId: "extension-id",
      accountId: "account-1",
      modelId: "gpt-model-key-mini",
      createdKeyName: "model gpt-model-key-mini",
      cleanupCreatedKey: true,
    })

    expect(mocks.deleteTokenFromKeyManagementPage).toHaveBeenCalledWith({
      page: keysPage,
      token: {
        id: "created-token-id",
        name: "model gpt-model-key-mini",
      },
    })
  })

  it("cleans up the created key when post-creation verification fails", async () => {
    const error = new Error("post-create verification failed")
    const modelPage = createModelPage()
    const keysPage = createKeysPage({
      tokenRowGetByText: vi.fn((text: string) => {
        if (text === "vip") {
          throw error
        }

        return {
          toString: () => "created token row text",
        }
      }),
    })

    vi.mocked(runModelListCatalogScenario).mockResolvedValue(modelPage)
    vi.mocked(mocks.waitForExtensionPage).mockResolvedValue(keysPage)

    await expect(
      runModelToKeyManagementScenario({
        page: {} as any,
        extensionId: "extension-id",
        accountId: "account-1",
        modelId: "gpt-model-key-mini",
        createdKeyName: "model gpt-model-key-mini",
        expectedKeyManagementLabels: ["vip"],
        cleanupCreatedKey: true,
      }),
    ).rejects.toThrow(error)

    expect(mocks.deleteTokenFromKeyManagementPage).toHaveBeenCalledWith({
      page: keysPage,
      token: {
        id: "created-token-id",
        name: "model gpt-model-key-mini",
      },
    })
  })

  it("resolves the token row during cleanup when verification fails before recording it", async () => {
    const error = new Error("prepare failed")
    const modelPage = createModelPage()
    const keysPage = createKeysPage()

    vi.mocked(runModelListCatalogScenario).mockResolvedValue(modelPage)
    vi.mocked(mocks.waitForExtensionPage).mockResolvedValue(keysPage)

    await expect(
      runModelToKeyManagementScenario({
        page: {} as any,
        extensionId: "extension-id",
        accountId: "account-1",
        modelId: "gpt-model-key-mini",
        createdKeyName: "model gpt-model-key-mini",
        prepareKeyManagementPage: vi.fn().mockRejectedValue(error),
        cleanupCreatedKey: true,
      }),
    ).rejects.toThrow(error)

    expect(mocks.deleteTokenFromKeyManagementPage).toHaveBeenCalledWith({
      page: keysPage,
      token: {
        id: "created-token-id",
        name: "model gpt-model-key-mini",
      },
    })
  })

  it("does not fall back to name-only cleanup when the created token row cannot be resolved", async () => {
    const modelPage = createModelPage()
    const keysPage = createKeysPage({
      tokenRowsCountError: new Error("no token rows"),
    })

    vi.mocked(runModelListCatalogScenario).mockResolvedValue(modelPage)
    vi.mocked(mocks.waitForExtensionPage).mockResolvedValue(keysPage)

    await expect(
      runModelToKeyManagementScenario({
        page: {} as any,
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

function createModelPage(
  options: {
    inferredTokenName?: string
    selectedCompatibleKeyName?: string
  } = {},
) {
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
  const keyDialog = {
    getByRole: vi.fn(() => ({
      innerText: vi
        .fn()
        .mockResolvedValue(options.selectedCompatibleKeyName ?? ""),
    })),
    getByText: vi.fn(() => ({
      toString: () => "model key dialog text",
    })),
    getByTestId: vi.fn((testId: string) => ({
      click: vi.fn().mockResolvedValue(undefined),
      testId,
    })),
    toString: () => "model key dialog",
  }

  return {
    context: vi.fn(() => "browser-context"),
    getByTestId: vi.fn((testId: string) => {
      if (testId === MODEL_LIST_TEST_IDS.modelKeyDialog) return keyDialog
      if (testId === "key-management-add-token-dialog") return addKeyDialog

      return {
        first: vi.fn(() => ({
          click: vi.fn().mockResolvedValue(undefined),
          testId,
        })),
        click: vi.fn().mockResolvedValue(undefined),
        testId,
      }
    }),
  } as any
}

function createKeysPage(overrides: Record<string, unknown> = {}) {
  const createdTokenName =
    typeof overrides.createdTokenName === "string"
      ? overrides.createdTokenName
      : "model gpt-model-key-mini"
  const tokenHeading = {
    innerText: vi.fn().mockResolvedValue(createdTokenName),
    toString: () => "created token heading",
  }
  const tokenRow = {
    getAttribute: vi
      .fn()
      .mockResolvedValue("key-management-token-row-created-token-id"),
    getByText:
      typeof overrides.tokenRowGetByText === "function"
        ? overrides.tokenRowGetByText
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

  if (overrides.tokenRowsCountError instanceof Error) {
    mocks.expect.mockImplementation((locator?: unknown) => {
      if (locator === tokenRows) {
        return {
          toHaveCount: vi.fn().mockRejectedValue(overrides.tokenRowsCountError),
          toBeVisible: vi.fn().mockResolvedValue(undefined),
          toHaveValue: vi.fn().mockResolvedValue(undefined),
          toHaveURL: vi.fn().mockResolvedValue(undefined),
          toBe: vi.fn(),
        }
      }

      return {
        toBeVisible: vi.fn().mockResolvedValue(undefined),
        toHaveCount: vi.fn().mockResolvedValue(undefined),
        toHaveValue: vi.fn().mockResolvedValue(undefined),
        toHaveURL: vi.fn().mockResolvedValue(undefined),
        toBe: vi.fn(),
      }
    })
  }

  return {
    url: vi.fn(
      () =>
        "chrome-extension://extension-id/options.html?accountId=account-1#keys",
    ),
    getByRole: vi.fn(() => ({
      toString: () => "created key heading",
    })),
    getByText: vi.fn(() => ({
      toString: () => "keys page text",
    })),
    locator: vi.fn(() => tokenRows),
    ...Object.fromEntries(
      Object.entries(overrides).filter(
        ([key]) => key !== "tokenRowsCountError" && key !== "tokenRowGetByText",
      ),
    ),
  } as any
}
