import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import toast from "react-hot-toast"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import ManagedSiteChannels from "~/features/ManagedSiteChannels/ManagedSiteChannels"

const mocks = vi.hoisted(() => ({
  getManagedSiteService: vi.fn(),
  listChannels: vi.fn(),
  deleteChannel: vi.fn(),
  getConfig: vi.fn(),
  userContext: {
    preferences: {
      managedSiteType: "new-api",
      newApi: {
        baseUrl: "https://managed.example.invalid",
        adminToken: "admin-token-placeholder",
        userId: "1",
      },
    },
    managedSiteType: "new-api",
    newApiBaseUrl: "https://managed.example.invalid",
    newApiUserId: "1",
    newApiUsername: "",
    newApiPassword: "",
    newApiTotpSecret: "",
    markGatewayGuidanceOnboardingCompleted: vi.fn(),
    updateManagedSiteType: vi.fn(),
  },
}))

vi.mock("~/components/dialogs/ChannelDialog", () => ({
  useChannelDialog: () => ({ openWithCustom: vi.fn() }),
}))

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: () => mocks.userContext,
}))

vi.mock("~/contexts/FeatureGuidanceContext", () => ({
  useFeatureGuidanceContext: () => ({
    markGatewayGuidanceOnboardingCompleted:
      mocks.userContext.markGatewayGuidanceOnboardingCompleted,
  }),
}))

vi.mock("~/services/managedSites/managedSiteService", () => ({
  getManagedSiteService: mocks.getManagedSiteService,
  hasValidManagedSiteConfig: () => true,
}))

vi.mock("~/services/managedSites/managedUpstreamResourceMigration", () => ({
  isManagedSiteFeatureResourceSliceEnabled: () => false,
  MANAGED_UPSTREAM_RESOURCE_FEATURES: {
    ChannelFilters: "channelFilters",
    ChannelMigration: "channelMigration",
  },
}))

vi.mock("~/services/managedSites/managedUpstreamResourceService", () => ({
  resolveManagedUpstreamResourceCapabilities: () => ({ supported: false }),
}))

vi.mock("~/services/accounts/accountStorage/accountQueries", () => ({
  accountQueries: { getAllAccounts: vi.fn().mockResolvedValue([]) },
}))
vi.mock("~/services/accounts/accountStorage/accountPresentation", () => ({
  accountPresentation: { convertToDisplayData: vi.fn(() => []) },
}))

vi.mock(
  "~/services/apiCredentialProfiles/apiCredentialProfilesStorage",
  () => ({
    apiCredentialProfilesStorage: {
      listProfiles: vi.fn().mockResolvedValue([]),
    },
  }),
)

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: () => ({ complete: vi.fn() }),
  trackProductAnalyticsActionCompleted: vi.fn(),
  trackProductAnalyticsActionStarted: vi.fn(),
}))

vi.mock(
  "~/features/ManagedSiteVerification/useNewApiManagedVerification",
  () => ({
    useNewApiManagedVerification: () => ({
      dialogState: {
        isOpen: false,
        step: "idle",
        request: null,
        code: "",
        errorMessage: "",
        isBusy: false,
        busyMessage: "",
      },
      setCode: vi.fn(),
      closeDialog: vi.fn(),
      submitCode: vi.fn(),
      retryVerification: vi.fn(),
      openBaseUrl: vi.fn(),
      patchRequestConfig: vi.fn(),
    }),
  }),
)

vi.mock(
  "~/features/ManagedSiteChannels/presentation/ManagedSiteChannelsView",
  () => ({
    ManagedSiteChannelsView: ({ state, callbacks }: any) => (
      <div>
        <div data-testid="delete-results">
          {state.deleteState.results
            .map((result: { status: string }) => result.status)
            .join(",")}
        </div>
        <div data-testid="delete-requires-refresh">
          {String(state.deleteState.requiresRefresh)}
        </div>
        {state.rows[0] ? (
          <button
            type="button"
            onClick={() => callbacks.onDelete(state.rows[0].rowKey)}
          >
            delete-row
          </button>
        ) : null}
        {state.rows.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() =>
                callbacks.onSelectedRowKeysChange(
                  Object.fromEntries(
                    state.rows.map((row: { rowKey: string }) => [
                      row.rowKey,
                      true,
                    ]),
                  ),
                )
              }
            >
              select-all-rows
            </button>
            <button type="button" onClick={callbacks.onDeleteSelected}>
              delete-selected
            </button>
          </>
        ) : null}
        {state.deleteState.isOpen ? (
          <button type="button" onClick={callbacks.onDeleteConfirm}>
            confirm-delete
          </button>
        ) : null}
      </div>
    ),
  }),
)

vi.mock(
  "~/features/ManagedSiteChannels/components/ManagedSiteChannelMigrationDialog",
  () => ({ ManagedSiteChannelMigrationDialog: () => null }),
)
vi.mock(
  "~/features/ManagedSiteChannels/components/ChannelFilterDialog",
  () => ({ default: () => null }),
)
vi.mock(
  "~/features/ManagedSiteVerification/NewApiManagedVerificationDialog",
  () => ({ NewApiManagedVerificationDialog: () => null }),
)

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

const channel = {
  id: 7,
  name: "Example channel",
  type: 1,
  key: "sk-********",
  base_url: "https://upstream.example.invalid",
  models: "model-example",
  group: "default",
  priority: 0,
  weight: 0,
  status: 1,
}

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe("ManagedSiteChannels ordinary delete outcomes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getConfig.mockResolvedValue({
      baseUrl: "https://managed.example.invalid",
      adminToken: "admin-token-placeholder",
      userId: "1",
    })
    mocks.listChannels.mockResolvedValue({
      items: [channel],
      total: 1,
      type_counts: {},
    })
    mocks.getManagedSiteService.mockResolvedValue({
      siteType: SITE_TYPES.NEW_API,
      messagesKey: "newapi",
      getConfig: mocks.getConfig,
      listChannels: mocks.listChannels,
      deleteChannel: mocks.deleteChannel,
    })
  })

  it("accepts delete not_found only after a fresh read confirms absence", async () => {
    mocks.deleteChannel.mockResolvedValue({
      outcome: "rejected",
      diagnostic: {
        code: "not_found",
        message: "Provider reports the channel is missing",
      },
    })
    mocks.listChannels
      .mockResolvedValueOnce({
        items: [channel],
        total: 1,
        type_counts: {},
      })
      .mockResolvedValue({ items: [], total: 0, type_counts: {} })

    render(<ManagedSiteChannels siteType={SITE_TYPES.NEW_API} />)
    await screen.findByRole("button", { name: "delete-row" })
    fireEvent.click(screen.getByRole("button", { name: "delete-row" }))
    fireEvent.click(
      await screen.findByRole("button", { name: "confirm-delete" }),
    )

    await waitFor(() => {
      expect(screen.getByTestId("delete-results")).toHaveTextContent("success")
    })
    expect(mocks.deleteChannel).toHaveBeenCalledOnce()
    expect(mocks.listChannels.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it("confirms each concurrent not_found result with its own later fresh read", async () => {
    const secondChannel = { ...channel, id: 8, name: "Second channel" }
    const firstDelete = createDeferred<unknown>()
    const secondDelete = createDeferred<unknown>()
    mocks.listChannels
      .mockResolvedValueOnce({
        items: [channel, secondChannel],
        total: 2,
        type_counts: {},
      })
      .mockResolvedValueOnce({ items: [], total: 0, type_counts: {} })
      .mockResolvedValueOnce({
        items: [secondChannel],
        total: 1,
        type_counts: {},
      })
      .mockResolvedValue({
        items: [secondChannel],
        total: 1,
        type_counts: {},
      })
    mocks.deleteChannel.mockImplementation((_config, channelId) =>
      channelId === channel.id ? firstDelete.promise : secondDelete.promise,
    )

    render(<ManagedSiteChannels siteType={SITE_TYPES.NEW_API} />)
    await screen.findByRole("button", { name: "select-all-rows" })
    fireEvent.click(screen.getByRole("button", { name: "select-all-rows" }))
    fireEvent.click(screen.getByRole("button", { name: "delete-selected" }))
    fireEvent.click(
      await screen.findByRole("button", { name: "confirm-delete" }),
    )

    await waitFor(() => expect(mocks.deleteChannel).toHaveBeenCalledTimes(2))
    firstDelete.resolve({
      outcome: "rejected",
      diagnostic: { code: "not_found", message: "First is absent" },
    })
    await waitFor(() => expect(mocks.listChannels).toHaveBeenCalledTimes(2))

    secondDelete.resolve({
      outcome: "rejected",
      diagnostic: { code: "not_found", message: "Second is absent" },
    })

    await waitFor(() => {
      expect(screen.getByTestId("delete-results")).toHaveTextContent(
        "success,failed",
      )
    })
    expect(mocks.deleteChannel).toHaveBeenCalledTimes(2)
    expect(mocks.listChannels).toHaveBeenCalledTimes(4)
  })

  it("does not infer delete success from a generic provider diagnostic", async () => {
    mocks.deleteChannel.mockResolvedValue({
      outcome: "rejected",
      diagnostic: { message: "Provider says not found" },
    })

    render(<ManagedSiteChannels siteType={SITE_TYPES.NEW_API} />)
    await screen.findByRole("button", { name: "delete-row" })
    fireEvent.click(screen.getByRole("button", { name: "delete-row" }))
    fireEvent.click(
      await screen.findByRole("button", { name: "confirm-delete" }),
    )

    await waitFor(() => {
      expect(screen.getByTestId("delete-results")).toHaveTextContent("failed")
    })
    expect(mocks.deleteChannel).toHaveBeenCalledOnce()
    expect(vi.mocked(toast.error)).toHaveBeenCalled()
  })

  it("redacts snapshotted config secrets from ordinary delete feedback", async () => {
    const adminToken = "delete-admin-token-placeholder"
    const password = "delete-password-placeholder"
    const totpSecret = "delete-totp-secret-placeholder"
    const config = {
      baseUrl: "https://managed.example.invalid",
      adminToken,
      password,
      totpSecret,
      userId: "1",
    }
    mocks.getConfig.mockResolvedValue(config)
    mocks.deleteChannel.mockImplementation(async () => {
      config.adminToken = "mutated-admin-token"
      config.password = "mutated-password"
      config.totpSecret = "mutated-totp-secret"
      return {
        outcome: "rejected",
        diagnostic: {
          message: `Provider refused ${adminToken} ${password} ${totpSecret}`,
        },
      }
    })

    render(<ManagedSiteChannels siteType={SITE_TYPES.NEW_API} />)
    await screen.findByRole("button", { name: "delete-row" })
    fireEvent.click(screen.getByRole("button", { name: "delete-row" }))
    fireEvent.click(
      await screen.findByRole("button", { name: "confirm-delete" }),
    )

    await waitFor(() => {
      expect(screen.getByTestId("delete-results")).toHaveTextContent("failed")
    })
    const toastCalls = JSON.stringify(vi.mocked(toast.error).mock.calls)
    expect(toastCalls).toContain("Provider refused")
    expect(toastCalls).not.toContain(adminToken)
    expect(toastCalls).not.toContain(password)
    expect(toastCalls).not.toContain(totpSecret)
  })

  it("suppresses ordinary delete diagnostics when config inspection is incomplete", async () => {
    const hiddenSecret = "delete-incomplete-totp-placeholder"
    const providerText = `Provider private diagnostic ${hiddenSecret}`
    mocks.getConfig.mockResolvedValue(
      new Proxy(
        {
          baseUrl: "https://managed.example.invalid",
          adminToken: "admin-token-placeholder",
          password: "password-placeholder",
          totpSecret: hiddenSecret,
          userId: "1",
        },
        {
          ownKeys() {
            throw new Error("config inspection unavailable")
          },
        },
      ),
    )
    mocks.deleteChannel.mockResolvedValue({
      outcome: "rejected",
      diagnostic: { message: providerText },
    })

    render(<ManagedSiteChannels siteType={SITE_TYPES.NEW_API} />)
    await screen.findByRole("button", { name: "delete-row" })
    fireEvent.click(screen.getByRole("button", { name: "delete-row" }))
    fireEvent.click(
      await screen.findByRole("button", { name: "confirm-delete" }),
    )

    await waitFor(() => {
      expect(screen.getByTestId("delete-results")).toHaveTextContent("failed")
    })
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Delete failed")
    expect(JSON.stringify(vi.mocked(toast.error).mock.calls)).not.toContain(
      providerText,
    )
  })

  it("surfaces a failed delete reconciliation without fabricating a result", async () => {
    mocks.deleteChannel.mockResolvedValue(undefined)
    mocks.listChannels
      .mockResolvedValueOnce({ items: [channel], total: 1, type_counts: {} })
      .mockRejectedValueOnce(new Error("authoritative refresh unavailable"))

    render(<ManagedSiteChannels siteType={SITE_TYPES.NEW_API} />)
    await screen.findByRole("button", { name: "delete-row" })
    fireEvent.click(screen.getByRole("button", { name: "delete-row" }))
    fireEvent.click(
      await screen.findByRole("button", { name: "confirm-delete" }),
    )

    await waitFor(() => {
      expect(screen.getByTestId("delete-requires-refresh")).toHaveTextContent(
        "true",
      )
    })
    expect(screen.getByTestId("delete-results")).toBeEmptyDOMElement()
    expect(mocks.deleteChannel).toHaveBeenCalledOnce()
    expect(mocks.listChannels).toHaveBeenCalledTimes(2)
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Delete failed")
  })

  it("sanitizes a thrown post-invocation delete without fabricating a result", async () => {
    const adminToken = "delete-thrown-admin-placeholder"
    const password = "delete-thrown-password-placeholder"
    const totpSecret = "delete-thrown-totp-placeholder"
    const providerText = "Provider delete transport failed"
    const config = {
      baseUrl: "https://managed.example.invalid",
      adminToken,
      password,
      totpSecret,
      userId: "1",
    }
    mocks.getConfig.mockResolvedValue(config)
    mocks.deleteChannel.mockImplementation(async () => {
      config.adminToken = "mutated-admin-token"
      config.password = "mutated-password"
      config.totpSecret = "mutated-totp"
      throw new Error(
        `${providerText} ${adminToken} ${password} ${totpSecret}`,
        { cause: new Error(`cause ${totpSecret}`) },
      )
    })

    render(<ManagedSiteChannels siteType={SITE_TYPES.NEW_API} />)
    await screen.findByRole("button", { name: "delete-row" })
    fireEvent.click(screen.getByRole("button", { name: "delete-row" }))
    fireEvent.click(
      await screen.findByRole("button", { name: "confirm-delete" }),
    )

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalled()
    })
    expect(screen.getByTestId("delete-results")).toBeEmptyDOMElement()
    expect(screen.getByTestId("delete-requires-refresh")).toHaveTextContent(
      "false",
    )
    expect(mocks.deleteChannel).toHaveBeenCalledOnce()
    expect(mocks.listChannels).toHaveBeenCalledTimes(2)
    const toastCalls = JSON.stringify(vi.mocked(toast.error).mock.calls)
    expect(toastCalls).toContain(providerText)
    expect(toastCalls).not.toContain(adminToken)
    expect(toastCalls).not.toContain(password)
    expect(toastCalls).not.toContain(totpSecret)
  })

  it("uses fallback-only delete feedback when thrown-error inspection is incomplete", async () => {
    const hiddenSecret = "delete-thrown-hidden-secret-placeholder"
    const providerText = `Provider private delete throw ${hiddenSecret}`
    mocks.getConfig.mockResolvedValue(
      new Proxy(
        {
          baseUrl: "https://managed.example.invalid",
          adminToken: "admin-token-placeholder",
          totpSecret: hiddenSecret,
          userId: "1",
        },
        {
          ownKeys() {
            throw new Error("config inspection unavailable")
          },
        },
      ),
    )
    mocks.deleteChannel.mockRejectedValue(new Error(providerText))

    render(<ManagedSiteChannels siteType={SITE_TYPES.NEW_API} />)
    await screen.findByRole("button", { name: "delete-row" })
    fireEvent.click(screen.getByRole("button", { name: "delete-row" }))
    fireEvent.click(
      await screen.findByRole("button", { name: "confirm-delete" }),
    )

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalled()
    })
    expect(screen.getByTestId("delete-results")).toBeEmptyDOMElement()
    expect(screen.getByTestId("delete-requires-refresh")).toHaveTextContent(
      "false",
    )
    expect(mocks.deleteChannel).toHaveBeenCalledOnce()
    expect(mocks.listChannels).toHaveBeenCalledTimes(2)
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Delete failed")
    const toastCalls = JSON.stringify(vi.mocked(toast.error).mock.calls)
    expect(toastCalls).not.toContain(providerText)
    expect(toastCalls).not.toContain(hiddenSecret)
  })

  it("uses one authoritative refresh for multiple ambiguous deletes", async () => {
    const secondChannel = { ...channel, id: 8, name: "Second channel" }
    mocks.listChannels.mockResolvedValue({
      items: [channel, secondChannel],
      total: 2,
      type_counts: {},
    })
    mocks.deleteChannel.mockResolvedValue({
      outcome: "uncertain",
      diagnostic: { message: "Delete state is ambiguous" },
    })

    render(<ManagedSiteChannels siteType={SITE_TYPES.NEW_API} />)
    await screen.findByRole("button", { name: "select-all-rows" })
    fireEvent.click(screen.getByRole("button", { name: "select-all-rows" }))
    fireEvent.click(screen.getByRole("button", { name: "delete-selected" }))
    fireEvent.click(
      await screen.findByRole("button", { name: "confirm-delete" }),
    )

    await waitFor(() => {
      expect(screen.getByTestId("delete-results")).toHaveTextContent(
        "uncertain,uncertain",
      )
    })
    expect(mocks.deleteChannel).toHaveBeenCalledTimes(2)
    expect(mocks.listChannels).toHaveBeenCalledTimes(2)
  })

  it.each(["partial", "uncertain"] as const)(
    "blocks immediate delete replay after a %s outcome until refresh succeeds",
    async (outcome) => {
      mocks.deleteChannel.mockResolvedValue(
        outcome === "partial"
          ? {
              outcome,
              confirmedEffects: [
                {
                  kind: "resource-deleted",
                  resourceKind: "channel",
                  resourceId: 7,
                },
              ],
              completion: "uncertain",
              diagnostic: { message: "Delete state is ambiguous" },
            }
          : {
              outcome,
              diagnostic: { message: "Delete state is ambiguous" },
            },
      )
      mocks.listChannels
        .mockResolvedValueOnce({
          items: [channel],
          total: 1,
          type_counts: {},
        })
        .mockRejectedValue(new Error("Fresh read unavailable"))

      render(<ManagedSiteChannels siteType={SITE_TYPES.NEW_API} />)
      await screen.findByRole("button", { name: "delete-row" })
      fireEvent.click(screen.getByRole("button", { name: "delete-row" }))
      fireEvent.click(
        await screen.findByRole("button", { name: "confirm-delete" }),
      )

      await waitFor(() => {
        expect(screen.getByTestId("delete-results")).toHaveTextContent(
          "uncertain",
        )
        expect(screen.getByTestId("delete-requires-refresh")).toHaveTextContent(
          "true",
        )
      })
      expect(mocks.deleteChannel).toHaveBeenCalledOnce()
    },
  )
})
