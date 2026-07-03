import type { TFunction } from "i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  AIHUBMIX_API_ORIGIN,
  AIHUBMIX_WEB_ORIGIN,
  SITE_TYPES,
} from "~/constants/siteType"
import { TOKEN_PROVISIONING_TEST_IDS } from "~/features/TokenProvisioning/testIds"
import {
  buildOneTimeApiKeyProfileSaveAction,
  saveAccountRuntimeKeysToApiCredentialProfiles,
} from "~/features/TokenProvisioning/utils/apiCredentialProfileSaveAction"
import {
  buildAccountTokenRuntimeKey,
  buildServiceCredentialRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { AuthTypeEnum } from "~/types"
import {
  createAccount,
  createToken,
} from "~~/tests/utils/keyManagementFactories"

const {
  createApiCredentialProfileMock,
  openApiCredentialProfilesPageMock,
  toastDismissMock,
  toastErrorMock,
  toastSuccessMock,
} = vi.hoisted(() => ({
  createApiCredentialProfileMock: vi.fn(),
  openApiCredentialProfilesPageMock: vi.fn(),
  toastDismissMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    dismiss: toastDismissMock,
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}))

vi.mock("~/utils/navigation", () => ({
  openApiCredentialProfilesPage: (...args: unknown[]) =>
    openApiCredentialProfilesPageMock(...args),
}))

vi.mock(
  "~/services/apiCredentialProfiles/apiCredentialProfilesStorage",
  () => ({
    apiCredentialProfilesStorage: {
      createProfile: (...args: unknown[]) =>
        createApiCredentialProfileMock(...args),
    },
  }),
)

describe("buildOneTimeApiKeyProfileSaveAction", () => {
  beforeEach(() => {
    createApiCredentialProfileMock.mockReset()
    openApiCredentialProfilesPageMock.mockReset()
    toastDismissMock.mockReset()
    toastErrorMock.mockReset()
    toastSuccessMock.mockReset()
  })

  it("uses the AIHubMix API origin when the source account was saved from the web console", async () => {
    createApiCredentialProfileMock.mockResolvedValueOnce({
      id: "profile-1",
      name: "AIHubMix - Default API Key",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: AIHUBMIX_API_ORIGIN,
      apiKey: "sk-one-time-full",
      tagIds: [],
      notes: "",
      createdAt: 1,
      updatedAt: 1,
    })
    const t = vi.fn((key: string) => key) as unknown as TFunction
    const logger = { error: vi.fn() }

    const saveAction = buildOneTimeApiKeyProfileSaveAction({
      accountName: "AIHubMix",
      baseUrl: AIHUBMIX_WEB_ORIGIN,
      siteType: SITE_TYPES.AIHUBMIX,
      token: {
        key: "sk-one-time-full",
        name: "Default API Key",
      },
      t,
      logger,
      source: "AddTokenDialog",
    })

    await saveAction.onSave()

    expect(createApiCredentialProfileMock).toHaveBeenCalledWith({
      name: "AIHubMix - Default API Key",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: AIHUBMIX_API_ORIGIN,
      apiKey: "sk-one-time-full",
      tagIds: [],
    })
  })

  it("keeps non-AIHubMix account base URLs unchanged", async () => {
    createApiCredentialProfileMock.mockResolvedValueOnce({
      id: "profile-1",
      name: "Example - Default API Key",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://api.example.com",
      apiKey: "sk-one-time-full",
      tagIds: [],
      notes: "",
      createdAt: 1,
      updatedAt: 1,
    })
    const t = vi.fn((key: string) => key) as unknown as TFunction
    const logger = { error: vi.fn() }

    const saveAction = buildOneTimeApiKeyProfileSaveAction({
      accountName: "Example",
      baseUrl: "https://api.example.com",
      siteType: SITE_TYPES.NEW_API,
      token: {
        key: "sk-one-time-full",
        name: "Default API Key",
      },
      t,
      logger,
      source: "AddTokenDialog",
    })

    await saveAction.onSave()

    expect(createApiCredentialProfileMock).toHaveBeenCalledWith({
      name: "Example - Default API Key",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://api.example.com",
      apiKey: "sk-one-time-full",
      tagIds: [],
    })
  })

  it("normalizes profile names by trimming, skipping empty parts, and deduplicating labels", async () => {
    createApiCredentialProfileMock.mockResolvedValueOnce({
      id: "profile-1",
      name: "Example - Default API Key",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://api.example.com",
      apiKey: "sk-one-time-full",
      tagIds: [],
      notes: "",
      createdAt: 1,
      updatedAt: 1,
    })
    const t = vi.fn((key: string) => key) as unknown as TFunction
    const logger = { error: vi.fn() }

    const saveAction = buildOneTimeApiKeyProfileSaveAction({
      accountName: "  Example  ",
      fallbackAccountName: "Example",
      baseUrl: "https://api.example.com",
      siteType: SITE_TYPES.NEW_API,
      token: {
        key: "sk-one-time-full",
        name: "  Default API Key  ",
      },
      t,
      logger,
      source: "AddTokenDialog",
    })

    await saveAction.onSave()

    expect(createApiCredentialProfileMock).toHaveBeenCalledWith({
      name: "Example - Default API Key",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://api.example.com",
      apiKey: "sk-one-time-full",
      tagIds: [],
    })
  })

  it("logs, reports, and rethrows profile creation failures", async () => {
    const error = new Error("storage failed")
    createApiCredentialProfileMock.mockRejectedValueOnce(error)
    const t = vi.fn((key: string) => key) as unknown as TFunction
    const logger = { error: vi.fn() }

    const saveAction = buildOneTimeApiKeyProfileSaveAction({
      accountName: "Example",
      baseUrl: "https://api.example.com",
      siteType: SITE_TYPES.NEW_API,
      token: {
        key: "sk-one-time-full",
        name: "Default API Key",
      },
      t,
      logger,
      source: "AddTokenDialog",
    })

    await expect(saveAction.onSave()).rejects.toThrow(error)

    expect(logger.error).toHaveBeenCalledWith(
      "Failed to save one-time key to API profiles from AddTokenDialog",
      {
        message: "storage failed",
      },
    )
    expect(toastErrorMock).toHaveBeenCalledWith(
      "keyManagement:messages.saveToApiProfilesFailed",
    )
    expect(toastSuccessMock).not.toHaveBeenCalled()
  })
})

describe("saveAccountRuntimeKeysToApiCredentialProfiles", () => {
  beforeEach(() => {
    createApiCredentialProfileMock.mockReset()
    toastErrorMock.mockReset()
    toastSuccessMock.mockReset()
  })

  it("saves every selected token and shows a quick-open toast action", async () => {
    createApiCredentialProfileMock
      .mockResolvedValueOnce({ id: "profile-1", name: "Example - First" })
      .mockResolvedValueOnce({ id: "profile-2", name: "AIHubMix - Second" })
    const t = vi.fn((key: string) => key) as unknown as TFunction
    const logger = { error: vi.fn() }

    const account1 = createAccount({
      id: "account-1",
      name: "Example",
      baseUrl: "https://api.example.invalid/v1",
      siteType: SITE_TYPES.NEW_API,
      tagIds: ["tag-a"],
      authType: AuthTypeEnum.AccessToken,
      token: "account-token",
      userId: "1",
    })
    const token1 = createToken({
      id: 1,
      accountId: "account-1",
      key: "sk-first",
      name: "First",
      accountName: "Example",
    })
    const account2 = createAccount({
      id: "account-2",
      name: "AIHubMix",
      baseUrl: AIHUBMIX_WEB_ORIGIN,
      siteType: SITE_TYPES.AIHUBMIX,
      tagIds: ["tag-b"],
      authType: AuthTypeEnum.AccessToken,
      token: "account-token",
      userId: "2",
    })
    const token2 = createToken({
      id: 2,
      accountId: "account-2",
      key: "sk-second",
      name: "Second",
      accountName: "AIHubMix",
    })

    const result = await saveAccountRuntimeKeysToApiCredentialProfiles({
      items: [
        {
          runtimeKey: buildAccountTokenRuntimeKey(account1, token1),
        },
        {
          runtimeKey: buildAccountTokenRuntimeKey(account2, token2),
        },
      ],
      t,
      logger,
      source: "TokenListBatchAction",
      resolveRuntimeKeySecret: async (_account, runtimeKey) => runtimeKey,
    })

    expect(result).toEqual({ savedCount: 2 })
    expect(createApiCredentialProfileMock).toHaveBeenNthCalledWith(1, {
      name: "Example - First",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://api.example.invalid/v1",
      apiKey: "sk-first",
      tagIds: ["tag-a"],
    })
    expect(createApiCredentialProfileMock).toHaveBeenNthCalledWith(2, {
      name: "AIHubMix - Second",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: AIHUBMIX_API_ORIGIN,
      apiKey: "sk-second",
      tagIds: ["tag-b"],
    })
    expect(toastSuccessMock).toHaveBeenCalledWith(expect.any(Function), {
      duration: 8000,
    })

    const toastMessageRenderer = toastSuccessMock.mock.calls[0]?.[0]
    const toastMessage = toastMessageRenderer({ id: "toast-1" })
    const openButton = toastMessage.props.children[1]
    expect(openButton.props["data-testid"]).toBe(
      TOKEN_PROVISIONING_TEST_IDS.openApiProfilesToastButton,
    )
    expect(openButton.props.children).toBe(
      "keyManagement:actions.openApiProfiles",
    )

    openButton.props.onClick()

    expect(openApiCredentialProfilesPageMock).toHaveBeenCalledTimes(1)
    expect(toastDismissMock).toHaveBeenCalledWith("toast-1")
  })

  it("reports partial batch save failures after earlier profiles were created", async () => {
    const error = new Error("storage failed for sk-second")
    createApiCredentialProfileMock
      .mockResolvedValueOnce({ id: "profile-1", name: "Example - First" })
      .mockRejectedValueOnce(error)
    const t = vi.fn((key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    ) as unknown as TFunction
    const logger = { error: vi.fn() }
    const account1 = createAccount({
      id: "account-1",
      name: "Example",
      baseUrl: "https://api.example.invalid/v1",
      siteType: SITE_TYPES.NEW_API,
      tagIds: ["tag-a"],
      authType: AuthTypeEnum.AccessToken,
      token: "account-token",
      userId: "1",
    })
    const token1 = createToken({
      id: 1,
      accountId: "account-1",
      key: "sk-first",
      name: "First",
      accountName: "Example",
    })
    const account2 = createAccount({
      id: "account-2",
      name: "Other",
      baseUrl: "https://other.example.invalid/v1",
      siteType: SITE_TYPES.NEW_API,
      authType: AuthTypeEnum.AccessToken,
      token: "other-account-token",
      userId: "2",
    })
    const token2 = createToken({
      id: 2,
      accountId: "account-2",
      key: "sk-second",
      name: "Second",
      accountName: "Other",
    })

    await expect(
      saveAccountRuntimeKeysToApiCredentialProfiles({
        items: [
          {
            runtimeKey: buildAccountTokenRuntimeKey(account1, token1),
          },
          {
            runtimeKey: buildAccountTokenRuntimeKey(account2, token2),
          },
        ],
        t,
        logger,
        source: "TokenListBatchAction",
        resolveRuntimeKeySecret: async (_account, runtimeKey) => runtimeKey,
      }),
    ).rejects.toThrow(error)

    expect(createApiCredentialProfileMock).toHaveBeenCalledTimes(2)
    expect(logger.error).toHaveBeenCalledWith(
      "Partially saved selected keys to API profiles from TokenListBatchAction",
      {
        failedCount: 1,
        message: "storage failed for [REDACTED]",
        savedCount: 1,
        totalCount: 2,
      },
    )
    expect(t).toHaveBeenCalledWith(
      "keyManagement:messages.batchSaveToApiProfilesPartialFailed",
      {
        failedCount: 1,
        savedCount: 1,
        totalCount: 2,
      },
    )
    expect(toastErrorMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "keyManagement:messages.batchSaveToApiProfilesPartialFailed",
      ),
    )
    expect(toastSuccessMock).not.toHaveBeenCalled()
  })

  it("saves loaded service credentials without resolving them as account tokens", async () => {
    createApiCredentialProfileMock.mockResolvedValueOnce({
      id: "profile-1",
      name: "SharedChat - Codex API Key",
    })
    const t = vi.fn((key: string) => key) as unknown as TFunction
    const logger = { error: vi.fn() }
    const account = createAccount({
      id: "account-1",
      name: "Example Account",
      baseUrl: "https://example.invalid",
      siteType: SITE_TYPES.SHAREDCHAT,
      authType: AuthTypeEnum.Cookie,
      token: "",
      userId: "user-1",
      tagIds: ["tag-a"],
    })
    const serviceCredentialRuntimeKey = buildServiceCredentialRuntimeKey(
      account,
      {
        kind: "singleton_service_key",
        service: "codex",
        label: "Codex",
        key: "service-secret",
        isAuthenticated: true,
        baseUrl: "https://runtime.example.invalid",
      },
    )
    const resolveRuntimeKeySecret = vi.fn()

    const result = await saveAccountRuntimeKeysToApiCredentialProfiles({
      items: [
        {
          runtimeKey: serviceCredentialRuntimeKey,
        },
      ],
      t,
      logger,
      source: "TokenListBatchAction",
      resolveRuntimeKeySecret,
    })

    expect(result).toEqual({ savedCount: 1 })
    expect(resolveRuntimeKeySecret).not.toHaveBeenCalled()
    expect(createApiCredentialProfileMock).toHaveBeenCalledWith({
      name: "Example Account - Codex",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://runtime.example.invalid",
      apiKey: "service-secret",
      tagIds: ["tag-a"],
    })
  })
})
