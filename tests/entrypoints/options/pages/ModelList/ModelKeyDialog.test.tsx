import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import ModelKeyDialog from "~/features/ModelList/components/ModelKeyDialog"
import { useModelKeyDialog } from "~/features/ModelList/components/ModelKeyDialog/hooks/useModelKeyDialog"
import { TOKEN_PROVISIONING_TEST_IDS } from "~/features/TokenProvisioning/testIds"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { AuthTypeEnum } from "~/types"
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "~~/tests/test-utils/render"

const {
  fetchAccountTokensMock,
  adapterCreateTokenMock,
  toastSuccessMock,
  toastErrorMock,
  resolveDisplayAccountRuntimeKeySecretMock,
  openKeysPageMock,
  startProductAnalyticsActionMock,
  completeProductAnalyticsActionMock,
  trackProductAnalyticsActionStartedMock,
  createApiCredentialProfileMock,
} = vi.hoisted(() => ({
  fetchAccountTokensMock: vi.fn(),
  adapterCreateTokenMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  resolveDisplayAccountRuntimeKeySecretMock: vi.fn(),
  openKeysPageMock: vi.fn(),
  startProductAnalyticsActionMock: vi.fn(),
  completeProductAnalyticsActionMock: vi.fn(),
  trackProductAnalyticsActionStartedMock: vi.fn(),
  createApiCredentialProfileMock: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}))

vi.mock(
  "~/services/accounts/utils/apiServiceRequest",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("~/services/accounts/utils/apiServiceRequest")
      >()
    return {
      ...original,
      resolveDisplayAccountTokenForSecret: () => {
        throw new Error(
          "resolveDisplayAccountTokenForSecret should not be used by model key dialog",
        )
      },
      resolveDisplayAccountRuntimeKeySecret: (...args: any[]) =>
        resolveDisplayAccountRuntimeKeySecretMock(...args),
    }
  },
)

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: (siteType: string) => {
    if (siteType === SITE_TYPES.SHAREDCHAT) {
      return {
        account: {
          serviceCredential: {
            fetch: (...args: any[]) => fetchAccountTokensMock(...args),
            rotate: vi.fn(),
          },
        },
      }
    }

    return {
      account: {
        keyManagement: {
          fetchTokens: (...args: any[]) => fetchAccountTokensMock(...args),
          createToken: (...args: any[]) => adapterCreateTokenMock(...args),
          resolveTokenKey: async ({ token }: { token: { key: string } }) =>
            token.key,
        },
      },
    }
  },
}))

vi.mock("~/utils/navigation", () => ({
  openKeysPage: (...args: any[]) => openKeysPageMock(...args),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: (...args: any[]) =>
    startProductAnalyticsActionMock(...args),
  trackProductAnalyticsActionStarted: (...args: any[]) =>
    trackProductAnalyticsActionStartedMock(...args),
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

const ACCOUNT = {
  id: "acc-1",
  name: "Example",
  username: "tester",
  siteType: "new-api",
  baseUrl: "https://example.com",
  token: "token",
  userId: "1",
  authType: AuthTypeEnum.AccessToken,
  checkIn: { enableDetection: false },
  tagIds: ["tag-a"],
} as any

const AIHUBMIX_ACCOUNT = {
  ...ACCOUNT,
  id: "aihubmix-1",
  name: "AIHubMix",
  siteType: SITE_TYPES.AIHUBMIX,
  baseUrl: "https://aihubmix.com",
}

const TOKEN = {
  id: 1,
  user_id: 1,
  key: "sk-test",
  status: 1,
  name: "default",
  created_time: 0,
  accessed_time: 0,
  expired_time: -1,
  remain_quota: 0,
  unlimited_quota: true,
  used_quota: 0,
  allow_ips: "",
  model_limits_enabled: false,
  model_limits: "",
  group: "",
} as any

function mockTimeoutsAsMicrotasks() {
  const originalSetTimeout = globalThis.setTimeout

  return vi
    .spyOn(globalThis, "setTimeout")
    .mockImplementation((callback, delay) => {
      if (delay === 1_000) {
        queueMicrotask(() => callback(undefined))
        return originalSetTimeout(() => undefined, 0)
      }

      return originalSetTimeout(callback, delay)
    })
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return { promise, resolve, reject }
}

describe("ModelKeyDialog", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    fetchAccountTokensMock.mockReset()
    adapterCreateTokenMock.mockReset()
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
    resolveDisplayAccountRuntimeKeySecretMock.mockReset()
    openKeysPageMock.mockReset()
    startProductAnalyticsActionMock.mockReset()
    completeProductAnalyticsActionMock.mockReset()
    trackProductAnalyticsActionStartedMock.mockReset()
    createApiCredentialProfileMock.mockReset()
    startProductAnalyticsActionMock.mockReturnValue({
      complete: completeProductAnalyticsActionMock,
    })
    resolveDisplayAccountRuntimeKeySecretMock.mockImplementation(
      async (_account, runtimeKey) => runtimeKey,
    )
  })

  it("opens the current account in key management", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])

    const user = userEvent.setup()

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "modelList:keyDialog.openKeyManagement",
      }),
    )

    expect(openKeysPageMock).toHaveBeenCalledWith("acc-1")
    expect(trackProductAnalyticsActionStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenAccountKeyManagementFromModel,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListKeyDialog,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("copies selected key when exactly one compatible runtime key exists", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    await user.click(
      await screen.findByRole("button", { name: "common:actions.copyKey" }),
    )

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("sk-test")
    })
    expect(trackProductAnalyticsActionStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopySelectedModelKey,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListKeyDialog,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("shows the resolver error message when copying the selected key fails", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])
    resolveDisplayAccountRuntimeKeySecretMock.mockRejectedValueOnce(
      new Error("resolver failed"),
    )

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    await user.click(
      await screen.findByRole("button", { name: "common:actions.copyKey" }),
    )

    await waitFor(() => {
      expect(writeText).not.toHaveBeenCalled()
      expect(toastErrorMock).toHaveBeenCalledWith("resolver failed")
    })
  })

  it("shows token groups when choosing an existing compatible key", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([
      { ...TOKEN, id: 1, name: "shared key", group: "default" },
      { ...TOKEN, id: 2, name: "shared key", group: "vip" },
    ])

    const user = userEvent.setup()

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default", "vip"]}
      />,
    )

    await user.click(
      await screen.findByRole("combobox", {
        name: "modelList:keyDialog.selectLabel",
      }),
    )

    expect(screen.getByText("shared key · default")).toBeInTheDocument()
    expect(screen.getByText("shared key · vip")).toBeInTheDocument()
  })

  it("copies the runtime key selected from multiple compatible options", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([
      { ...TOKEN, id: 1, key: "sk-default", name: "shared key", group: null },
      { ...TOKEN, id: 2, key: "sk-vip", name: "shared key", group: "vip" },
    ])

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default", "vip"]}
      />,
    )

    await user.click(
      await screen.findByRole("combobox", {
        name: "modelList:keyDialog.selectLabel",
      }),
    )
    expect(screen.getByText("shared key · default")).toBeInTheDocument()

    await user.click(
      await screen.findByRole("option", { name: "shared key · vip" }),
    )
    await user.click(
      screen.getByRole("button", { name: "common:actions.copyKey" }),
    )

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("sk-vip")
    })
  })

  it("shows empty state and explicit create actions when no compatible runtime keys exist", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    expect(
      await screen.findByText("modelList:keyDialog.noCompatibleTitle"),
    ).toBeInTheDocument()

    expect(
      screen.getByRole("button", { name: "modelList:keyDialog.createKey" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "modelList:keyDialog.createCustomKey",
      }),
    ).toBeInTheDocument()
  })

  it("shows a read-only auto-selected group when only one create group is available", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["vip"]}
      />,
    )

    expect(
      await screen.findByText("modelList:keyDialog.noCompatibleTitle"),
    ).toBeInTheDocument()

    expect(screen.getByText("vip")).toBeInTheDocument()
    expect(
      screen.getByText("modelList:keyDialog.createGroupAutoSelectedHint"),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("combobox", {
        name: "modelList:keyDialog.createGroupLabel",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "modelList:keyDialog.createKey" }),
    ).toBeInTheDocument()
  })

  it("shows a one-time key dialog when AIHubMix default create returns a full token", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])
    adapterCreateTokenMock.mockResolvedValueOnce({
      ...TOKEN,
      id: 8,
      key: "sk-created-full-secret",
      name: "model-key",
    })

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={AIHUBMIX_ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "modelList:keyDialog.createKey",
      }),
    )

    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CreateCompatibleModelKey,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListKeyDialog,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(trackProductAnalyticsActionStartedMock).not.toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CreateCompatibleModelKey,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListKeyDialog,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(
      await screen.findByText("keyManagement:oneTimeKey.title"),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText("keyManagement:oneTimeKey.keyLabel"),
    ).toHaveValue("sk-created-full-secret")

    await waitFor(() => {
      expect(adapterCreateTokenMock).toHaveBeenCalledTimes(1)
      expect(adapterCreateTokenMock.mock.calls[0]?.[1]).toMatchObject({
        group: "default",
        model_limits_enabled: false,
        model_limits: "",
      })
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
      expect(writeText).toHaveBeenCalledWith("sk-created-full-secret")
    })
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )
  })

  it("saves an AIHubMix default-created one-time key to an API credential profile without closing the dialog", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])
    adapterCreateTokenMock.mockResolvedValueOnce({
      ...TOKEN,
      id: 8,
      key: "sk-created-full-secret",
      name: "model-key",
    })
    createApiCredentialProfileMock.mockResolvedValueOnce({
      id: "profile-1",
      name: "AIHubMix - model-key",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: AIHUBMIX_ACCOUNT.baseUrl,
      apiKey: "sk-created-full-secret",
      tagIds: AIHUBMIX_ACCOUNT.tagIds,
      notes: "",
      createdAt: 1,
      updatedAt: 1,
    })
    const onClose = vi.fn()

    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined)

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={onClose}
        account={AIHUBMIX_ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "modelList:keyDialog.createKey",
      }),
    )
    await user.click(
      await screen.findByTestId(
        TOKEN_PROVISIONING_TEST_IDS.oneTimeKeySaveButton,
      ),
    )

    await waitFor(() => {
      expect(adapterCreateTokenMock).toHaveBeenCalledTimes(1)
      expect(createApiCredentialProfileMock).toHaveBeenCalledWith({
        name: "AIHubMix - model-key",
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: AIHUBMIX_ACCOUNT.baseUrl,
        apiKey: "sk-created-full-secret",
        tagIds: AIHUBMIX_ACCOUNT.tagIds,
      })
    })
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "keyManagement:messages.savedToApiProfiles",
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(
      screen.getByLabelText("keyManagement:oneTimeKey.keyLabel"),
    ).toHaveValue("sk-created-full-secret")
  })

  it("keeps AIHubMix created keys unchanged before showing the one-time dialog", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])
    adapterCreateTokenMock.mockResolvedValueOnce({
      ...TOKEN,
      id: 8,
      key: "created-full-secret",
      name: "model-key",
    })

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={AIHUBMIX_ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "modelList:keyDialog.createKey",
      }),
    )

    expect(
      await screen.findByText("keyManagement:oneTimeKey.title"),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText("keyManagement:oneTimeKey.keyLabel"),
    ).toHaveValue("created-full-secret")

    await waitFor(() => {
      expect(adapterCreateTokenMock).toHaveBeenCalledTimes(1)
      expect(writeText).toHaveBeenCalledWith("created-full-secret")
    })
  })

  it("refreshes instead of showing a one-time key when AIHubMix create returns a masked key", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        ...TOKEN,
        id: 11,
        key: "sk-refreshed-compatible",
        name: "refreshed",
      },
    ])
    adapterCreateTokenMock.mockResolvedValueOnce({
      ...TOKEN,
      id: 8,
      key: "sk-created********masked",
      name: "masked-created-token",
    })

    const user = userEvent.setup()

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={AIHUBMIX_ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "modelList:keyDialog.createKey",
      }),
    )

    await waitFor(() => {
      expect(adapterCreateTokenMock).toHaveBeenCalledTimes(1)
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
    })

    expect(
      screen.queryByText("keyManagement:oneTimeKey.title"),
    ).not.toBeInTheDocument()
    expect(
      await screen.findByRole("button", { name: "common:actions.copyKey" }),
    ).toBeInTheDocument()
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )
  })

  it("shows a compatibility error when default create returns an incompatible full token", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])
    adapterCreateTokenMock.mockResolvedValueOnce({
      ...TOKEN,
      id: 8,
      key: "sk-created-full-secret",
      name: "wrong-group-key",
      group: "vip",
    })

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={AIHUBMIX_ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "modelList:keyDialog.createKey",
      }),
    )

    expect(
      await screen.findByText(
        "modelList:keyDialog.noCompatibleFoundAfterCreate",
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("keyManagement:oneTimeKey.title"),
    ).not.toBeInTheDocument()
    expect(writeText).not.toHaveBeenCalled()
    expect(adapterCreateTokenMock).toHaveBeenCalledTimes(1)
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
    )
  })

  it("refreshes runtime keys when default create returns a token-shaped object with an invalid secret", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        ...TOKEN,
        id: 11,
        key: "sk-refreshed-compatible",
        name: "refreshed",
      },
    ])
    adapterCreateTokenMock.mockResolvedValueOnce({
      ...TOKEN,
      id: 8,
      key: null,
      name: "invalid-created-token",
    })

    const user = userEvent.setup()

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={AIHUBMIX_ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "modelList:keyDialog.createKey",
      }),
    )

    await waitFor(() => {
      expect(adapterCreateTokenMock).toHaveBeenCalledTimes(1)
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
    })

    expect(
      screen.queryByText("keyManagement:oneTimeKey.title"),
    ).not.toBeInTheDocument()
    expect(
      await screen.findByRole("button", { name: "common:actions.copyKey" }),
    ).toBeInTheDocument()
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )
  })

  it("waits for a compatible key to appear after create returns without a token payload", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          ...TOKEN,
          id: 11,
          key: "sk-refreshed-compatible",
          name: "refreshed",
        },
      ])
    adapterCreateTokenMock.mockResolvedValueOnce(true)

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    const createButton = await screen.findByRole("button", {
      name: "modelList:keyDialog.createKey",
    })
    const setTimeoutSpy = mockTimeoutsAsMicrotasks()
    const user = userEvent.setup()

    await user.click(createButton)

    await waitFor(() => {
      expect(adapterCreateTokenMock).toHaveBeenCalledTimes(1)
      expect(adapterCreateTokenMock.mock.calls[0]?.[1]).toMatchObject({
        group: "default",
        model_limits_enabled: false,
        model_limits: "",
      })
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(3)
    })
    setTimeoutSpy.mockRestore()

    expect(
      await screen.findByRole("button", { name: "common:actions.copyKey" }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("modelList:keyDialog.noCompatibleFoundAfterCreate"),
    ).not.toBeInTheDocument()
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )
  })

  it("shows a create error when refreshed inventory has no compatible runtime key", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ ...TOKEN, id: 11, group: "vip" }])
    adapterCreateTokenMock.mockResolvedValueOnce(true)

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    const createButton = await screen.findByRole("button", {
      name: "modelList:keyDialog.createKey",
    })
    const setTimeoutSpy = mockTimeoutsAsMicrotasks()
    const user = userEvent.setup()

    await user.click(createButton)

    await waitFor(() => {
      expect(adapterCreateTokenMock).toHaveBeenCalledTimes(1)
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(6)
    })
    setTimeoutSpy.mockRestore()

    expect(
      await screen.findByText(
        "modelList:keyDialog.noCompatibleFoundAfterCreate",
      ),
    ).toBeInTheDocument()
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
    )
  })

  it("shows a create error when post-create runtime-key refresh fails", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("inventory offline"))
    adapterCreateTokenMock.mockResolvedValueOnce(true)

    const user = userEvent.setup()

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "modelList:keyDialog.createKey",
      }),
    )

    expect(
      await screen.findByText("modelList:keyDialog.createFailed"),
    ).toBeInTheDocument()
    expect(adapterCreateTokenMock).toHaveBeenCalledTimes(1)
    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
    )
  })

  it("shows a create error when the default create request fails", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])
    adapterCreateTokenMock.mockRejectedValueOnce(new Error("create failed"))

    const user = userEvent.setup()

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "modelList:keyDialog.createKey",
      }),
    )

    expect(
      await screen.findByText("modelList:keyDialog.createFailed"),
    ).toBeInTheDocument()
    expect(adapterCreateTokenMock).toHaveBeenCalledTimes(1)
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CreateCompatibleModelKey,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListKeyDialog,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
    )
  })

  it("treats group mismatch as incompatible and shows empty state", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([{ ...TOKEN, group: "vip" }])

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    expect(
      await screen.findByText("modelList:keyDialog.noCompatibleTitle"),
    ).toBeInTheDocument()
  })

  it("disables create actions and explains when the account is ineligible", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={{ ...ACCOUNT, disabled: true }}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    expect(
      await screen.findByText("modelList:keyDialog.ineligible.accountDisabled"),
    ).toBeInTheDocument()

    expect(
      screen.getByRole("button", { name: "modelList:keyDialog.createKey" }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", {
        name: "modelList:keyDialog.createCustomKey",
      }),
    ).toBeDisabled()
  })

  it("explains missing auth when an account has no auth mode", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={{ ...ACCOUNT, authType: AuthTypeEnum.None, token: "" }}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    expect(
      await screen.findByText("modelList:keyDialog.ineligible.missingAuth"),
    ).toBeInTheDocument()
    expect(fetchAccountTokensMock).not.toHaveBeenCalled()
  })

  it("explains missing credentials when token management credentials are incomplete", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={{ ...ACCOUNT, token: "", cookieAuthSessionCookie: "" }}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    expect(
      await screen.findByText(
        "modelList:keyDialog.ineligible.missingCredentials",
      ),
    ).toBeInTheDocument()
    expect(fetchAccountTokensMock).not.toHaveBeenCalled()
  })

  it("explains service-credential accounts as read-only instead of missing credentials", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce({
      key: "sk-sharedchat",
      updatedAt: "2026-07-02T00:00:00.000Z",
    })

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={{ ...ACCOUNT, siteType: SITE_TYPES.SHAREDCHAT }}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    expect(
      await screen.findByText(
        "modelList:keyDialog.ineligible.readOnlyRuntimeKeys",
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("modelList:keyDialog.ineligible.missingCredentials"),
    ).not.toBeInTheDocument()
  })

  it("clears loaded runtime-key state when the selected account becomes ineligible", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])

    const { rerender } = render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    expect(
      await screen.findByRole("button", { name: "common:actions.copyKey" }),
    ).toBeInTheDocument()

    rerender(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={{ ...ACCOUNT, authType: AuthTypeEnum.None, token: "" }}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    expect(
      await screen.findByText("modelList:keyDialog.ineligible.missingAuth"),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "common:actions.copyKey" }),
    ).not.toBeInTheDocument()
    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
  })

  it("clears runtime-key hook state when the dialog closes", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])

    const { result, rerender } = renderHook(
      ({ isOpen }: { isOpen: boolean }) =>
        useModelKeyDialog({
          isOpen,
          account: ACCOUNT,
          modelId: "gpt-4",
          modelEnableGroups: ["default"],
        }),
      {
        initialProps: { isOpen: true },
      },
    )

    await waitFor(() => expect(result.current.runtimeKeys).toHaveLength(1))

    rerender({ isOpen: false })

    await waitFor(() => {
      expect(result.current.runtimeKeys).toEqual([])
      expect(result.current.selectedRuntimeKeyId).toBeNull()
      expect(result.current.isLoading).toBe(false)
    })
  })

  it("ignores stale runtime-key fetch completions after the selected account becomes ineligible", async () => {
    const pendingTokens = createDeferred<(typeof TOKEN)[]>()
    fetchAccountTokensMock.mockReturnValueOnce(pendingTokens.promise)

    const { rerender } = render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    await screen.findByText("modelList:keyDialog.loading")

    rerender(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={{ ...ACCOUNT, authType: AuthTypeEnum.None, token: "" }}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    expect(
      await screen.findByText("modelList:keyDialog.ineligible.missingAuth"),
    ).toBeInTheDocument()

    await act(async () => {
      pendingTokens.resolve([TOKEN])
      await pendingTokens.promise
    })

    expect(
      screen.queryByRole("button", { name: "common:actions.copyKey" }),
    ).not.toBeInTheDocument()
    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
  })

  it("uses the unknown fallback when runtime-key inventory payload is invalid", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce(null)

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    expect(
      await screen.findByText("modelList:keyDialog.loadFailed"),
    ).toBeInTheDocument()
  })

  it("shows a create error when the default create request returns false", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])
    adapterCreateTokenMock.mockResolvedValueOnce(false)

    const user = userEvent.setup()

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "modelList:keyDialog.createKey",
      }),
    )

    expect(
      await screen.findByText("modelList:keyDialog.createFailed"),
    ).toBeInTheDocument()
    expect(adapterCreateTokenMock).toHaveBeenCalledTimes(1)
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
    )
  })

  it("supports retry when runtime-key loading fails", async () => {
    fetchAccountTokensMock
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce([TOKEN])

    const user = userEvent.setup()

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    expect(
      await screen.findByText("modelList:keyDialog.loadFailed"),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "common:actions.retry" }),
    )

    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshModelKeyCandidates,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListKeyDialog,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(trackProductAnalyticsActionStartedMock).not.toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshModelKeyCandidates,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListKeyDialog,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    await waitFor(() => {
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
    })
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )

    expect(
      await screen.findByRole("button", { name: "common:actions.copyKey" }),
    ).toBeInTheDocument()
  })

  it("tracks retry completion when runtime-key loading fails again", async () => {
    fetchAccountTokensMock
      .mockRejectedValueOnce(new Error("first boom"))
      .mockRejectedValueOnce(new Error("retry boom"))

    const user = userEvent.setup()

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    expect(
      await screen.findByText("modelList:keyDialog.loadFailed"),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "common:actions.retry" }),
    )

    await waitFor(() => {
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
    })
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshModelKeyCandidates,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListKeyDialog,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
    )
  })

  it("tracks opening the custom key creation flow from both key states", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([TOKEN])

    const user = userEvent.setup()

    const { unmount } = render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "modelList:keyDialog.createCustomKey",
      }),
    )

    expect(trackProductAnalyticsActionStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CreateCustomModelKey,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListKeyDialog,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })

    unmount()
    trackProductAnalyticsActionStartedMock.mockReset()

    render(
      <ModelKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={ACCOUNT}
        modelId="gpt-4"
        modelEnableGroups={["default"]}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "modelList:keyDialog.createAnotherKey",
      }),
    )

    expect(trackProductAnalyticsActionStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CreateCustomModelKey,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListKeyDialog,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })
})
