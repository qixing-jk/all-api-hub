import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import CopyKeyDialog from "~/features/AccountManagement/components/CopyKeyDialog"
import { TOKEN_PROVISIONING_TEST_IDS } from "~/features/TokenProvisioning/testIds"
import { generateDefaultTokenRequest } from "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken"
import * as accountOperations from "~/services/accounts/accountOperations"
import { TOKEN_QUICK_CREATE_RESOLUTION_KINDS } from "~/services/accounts/tokenQuickCreateResolution"
import {
  CREATED_TOKEN_SECRET_DECISION_KINDS,
  DEFAULT_TOKEN_CREATION_DECISION_KINDS,
  TOKEN_CREATION_SECRET_RECOVERY,
  TOKEN_PROVISIONING_BLOCK_REASONS,
  TOKEN_PROVISIONING_REPAIR_POLICY_KINDS,
  TOKEN_PROVISIONING_WORKFLOWS,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
import { API_ERROR_CODES, ApiError } from "~/services/apiService/common/errors"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { AuthTypeEnum } from "~/types"
import { ACCOUNT_KEY_REPAIR_SKIP_REASONS } from "~/types/accountKeyAutoProvisioning"
import { act, render, screen, waitFor } from "~~/tests/test-utils/render"

const {
  fetchAccountTokensMock,
  createApiTokenMock,
  fetchAccountAvailableModelsMock,
  fetchUserGroupsMock,
  resolveApiTokenKeyMock,
  openInCherryStudioMock,
  openWithAccountMock,
  startProductAnalyticsActionMock,
  completeProductAnalyticsActionMock,
  toastSuccessMock,
  toastErrorMock,
  createApiCredentialProfileMock,
} = vi.hoisted(() => ({
  fetchAccountTokensMock: vi.fn(),
  createApiTokenMock: vi.fn(),
  fetchAccountAvailableModelsMock: vi.fn(),
  fetchUserGroupsMock: vi.fn(),
  resolveApiTokenKeyMock: vi.fn(),
  openInCherryStudioMock: vi.fn(),
  openWithAccountMock: vi.fn(),
  startProductAnalyticsActionMock: vi.fn(),
  completeProductAnalyticsActionMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  createApiCredentialProfileMock: vi.fn(),
}))

const normalizeGroupNames = (groups: Record<string, unknown>): string[] =>
  Array.from(
    new Set(
      Object.keys(groups)
        .map((group) => group.trim())
        .filter(Boolean),
    ),
  )

const createSub2ApiTokenProvisioningMock = () => ({
  isInventoryTokenUsable: vi.fn(() => true),
  resolveDefaultTokenCreation: vi.fn((request: any) => {
    const explicitGroup =
      typeof request.explicitGroup === "string"
        ? request.explicitGroup.trim()
        : ""

    if (explicitGroup) {
      return {
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
        tokenData: { ...request.defaultTokenData, group: explicitGroup },
        oneTimeSecret: false,
        recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.InventoryRefetch,
      }
    }

    if (
      request.workflow !== TOKEN_PROVISIONING_WORKFLOWS.QuickCreateSelection &&
      request.workflow !== TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation
    ) {
      return {
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Blocked,
        reason: TOKEN_PROVISIONING_BLOCK_REASONS.GroupRequired,
      }
    }

    if (!request.userGroups) {
      return { kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.NeedsUserGroups }
    }

    const allowedGroups = normalizeGroupNames(request.userGroups)

    if (allowedGroups.length === 0) {
      return {
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Blocked,
        reason: TOKEN_PROVISIONING_BLOCK_REASONS.AvailableGroupRequired,
      }
    }

    if (allowedGroups.length === 1) {
      return {
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
        tokenData: { ...request.defaultTokenData, group: allowedGroups[0] },
        oneTimeSecret: false,
        recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.InventoryRefetch,
      }
    }

    return {
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.SelectionRequired,
      allowedGroups,
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.GroupSelectionRequired,
    }
  }),
  classifyCreatedToken: vi.fn(({ result }: any) =>
    result
      ? { kind: CREATED_TOKEN_SECRET_DECISION_KINDS.NeedsInventoryRefetch }
      : {
          kind: CREATED_TOKEN_SECRET_DECISION_KINDS.Failed,
          reason: TOKEN_PROVISIONING_BLOCK_REASONS.CreateFailed,
        },
  ),
  getRepairPolicy: vi.fn(() => ({
    kind: TOKEN_PROVISIONING_REPAIR_POLICY_KINDS.Skipped,
    skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.Sub2Api,
  })),
})

vi.mock("react-hot-toast", () => ({
  default: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}))

vi.mock("~/services/apiService", () => ({
  getApiService: () => ({
    fetchAccountAvailableModels: (...args: any[]) =>
      fetchAccountAvailableModelsMock(...args),
    fetchUserGroups: (...args: any[]) => fetchUserGroupsMock(...args),
  }),
}))

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteAdapter: () => ({
    keyManagement: {
      fetchTokens: (...args: any[]) => fetchAccountTokensMock(...args),
      createToken: (...args: any[]) => createApiTokenMock(...args),
      resolveTokenKey: (...args: any[]) => resolveApiTokenKeyMock(...args),
      deleteToken: vi.fn(),
      fetchAvailableModels: (...args: any[]) =>
        fetchAccountAvailableModelsMock(...args),
      userGroups: {
        fetch: (...args: any[]) => fetchUserGroupsMock(...args),
      },
    },
    tokenProvisioning: createSub2ApiTokenProvisioningMock(),
  }),
}))

vi.mock("~/components/dialogs/ChannelDialog", () => ({
  ChannelDialogProvider: ({ children }: { children: ReactNode }) => children,
  useChannelDialog: () => ({ openWithAccount: openWithAccountMock }),
}))

vi.mock("~/services/integrations/cherryStudio", () => ({
  OpenInCherryStudio: (...args: unknown[]) => openInCherryStudioMock(...args),
}))

vi.mock("~/services/productAnalytics/actions", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/productAnalytics/actions")>()

  return {
    ...actual,
    startProductAnalyticsAction: (...args: unknown[]) =>
      startProductAnalyticsActionMock(...args),
  }
})

vi.mock(
  "~/services/apiCredentialProfiles/apiCredentialProfilesStorage",
  () => ({
    apiCredentialProfilesStorage: {
      createProfile: (...args: unknown[]) =>
        createApiCredentialProfileMock(...args),
    },
  }),
)

const actualResolveDefaultTokenQuickCreateResolution =
  accountOperations.resolveDefaultTokenQuickCreateResolution

const resolveDefaultTokenQuickCreateResolutionSpy = vi.spyOn(
  accountOperations,
  "resolveDefaultTokenQuickCreateResolution",
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

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return { promise, resolve, reject }
}

describe("CopyKeyDialog", () => {
  beforeEach(() => {
    fetchAccountTokensMock.mockReset()
    createApiTokenMock.mockReset()
    fetchAccountAvailableModelsMock.mockReset()
    fetchUserGroupsMock.mockReset()
    resolveApiTokenKeyMock.mockReset()
    openInCherryStudioMock.mockReset()
    openWithAccountMock.mockReset()
    startProductAnalyticsActionMock.mockReset()
    completeProductAnalyticsActionMock.mockReset()
    createApiCredentialProfileMock.mockReset()
    startProductAnalyticsActionMock.mockReturnValue({
      complete: completeProductAnalyticsActionMock,
    })
    completeProductAnalyticsActionMock.mockResolvedValue(undefined)
    resolveApiTokenKeyMock.mockImplementation(
      async ({ token }: { token: { key: string } }) => token.key,
    )
    resolveDefaultTokenQuickCreateResolutionSpy.mockReset()
    resolveDefaultTokenQuickCreateResolutionSpy.mockImplementation(
      async (account, options) => {
        if (account.siteType === SITE_TYPES.SUB2API) {
          return actualResolveDefaultTokenQuickCreateResolution(
            account,
            options,
          )
        }

        return {
          kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Ready,
          tokenData: generateDefaultTokenRequest(),
        }
      },
    )
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
  })

  it("creates token then refreshes and auto-copies when exactly one token exists", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([TOKEN])
    createApiTokenMock.mockResolvedValueOnce(true)

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    const createButton = await screen.findByRole("button", {
      name: "ui:dialog.copyKey.createKey",
    })
    await user.click(createButton)

    await waitFor(() => {
      expect(createApiTokenMock).toHaveBeenCalledTimes(1)
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
      expect(writeText).toHaveBeenCalledWith("sk-test")
    })
  })

  it("shows a create failure when default key creation returns false", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])
    createApiTokenMock.mockResolvedValueOnce(false)

    const user = userEvent.setup()

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )

    expect(
      await screen.findByText("ui:dialog.copyKey.createFailed"),
    ).toBeInTheDocument()
  })

  it("shows a one-time key dialog when AIHubMix create returns a full token", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])
    createApiTokenMock.mockResolvedValueOnce({
      ...TOKEN,
      id: 9,
      key: "sk-created-full-secret",
      name: "aihubmix-default",
    })

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(
      <CopyKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={AIHUBMIX_ACCOUNT}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )

    expect(
      await screen.findByText("keyManagement:oneTimeKey.title"),
    ).toBeInTheDocument()
    expect(screen.getByText("aihubmix-default")).toBeInTheDocument()
    expect(
      screen.getByLabelText("keyManagement:oneTimeKey.keyLabel"),
    ).toHaveValue("sk-created-full-secret")

    await waitFor(() => {
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
      expect(writeText).toHaveBeenCalledWith("sk-created-full-secret")
    })
  })

  it("refreshes instead of showing a one-time key when AIHubMix create returns a masked key", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([TOKEN])
    createApiTokenMock.mockResolvedValueOnce({
      ...TOKEN,
      id: 9,
      key: "sk-created********masked",
      name: "aihubmix-masked",
    })

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(
      <CopyKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={AIHUBMIX_ACCOUNT}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )

    await waitFor(() => {
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
      expect(writeText).toHaveBeenCalledWith("sk-test")
    })
    expect(
      screen.queryByText("keyManagement:oneTimeKey.title"),
    ).not.toBeInTheDocument()
  })

  it("refreshes instead of showing a one-time key when create returns a token-shaped object with an invalid secret", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([TOKEN])
    createApiTokenMock.mockResolvedValueOnce({
      ...TOKEN,
      id: 9,
      key: null,
      name: "invalid-created-token",
    })

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(
      <CopyKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={AIHUBMIX_ACCOUNT}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )

    await waitFor(() => {
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
      expect(writeText).toHaveBeenCalledWith("sk-test")
    })

    expect(
      screen.queryByText("keyManagement:oneTimeKey.title"),
    ).not.toBeInTheDocument()
  })

  it("shows a create error when refreshed inventory is not an array", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([]).mockResolvedValueOnce(null)
    createApiTokenMock.mockResolvedValueOnce(true)

    const user = userEvent.setup()

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )

    expect(
      await screen.findByText("ui:dialog.copyKey.createFailed"),
    ).toBeInTheDocument()
    expect(screen.queryByText("invalid_token_payload")).not.toBeInTheDocument()
  })

  it("shows a load error when the initial token inventory request fails", async () => {
    fetchAccountTokensMock.mockRejectedValueOnce(new Error("load failed"))

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    expect(
      await screen.findByText("ui:dialog.copyKey.loadFailed"),
    ).toBeInTheDocument()
  })

  it("shows a load error when the initial token inventory is malformed", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce(null)

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    expect(
      await screen.findByText("ui:dialog.copyKey.loadFailed"),
    ).toBeInTheDocument()
    expect(screen.queryByText("invalid_token_payload")).not.toBeInTheDocument()
    expect(screen.queryByText("default")).not.toBeInTheDocument()
  })

  it("keeps the dialog actionable when create fails (retry works)", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([TOKEN])
    createApiTokenMock
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(true)

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    const createButton = await screen.findByRole("button", {
      name: "ui:dialog.copyKey.createKey",
    })
    await user.click(createButton)

    expect(
      await screen.findByText("ui:dialog.copyKey.createFailed"),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "ui:dialog.copyKey.createKey" }),
    )

    await waitFor(() => {
      expect(createApiTokenMock).toHaveBeenCalledTimes(2)
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
      expect(writeText).toHaveBeenCalledWith("sk-test")
    })
  })

  it("keeps the dialog actionable when refresh stays empty after create (retry works)", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([TOKEN])
    createApiTokenMock.mockResolvedValueOnce(true).mockResolvedValueOnce(true)

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    const createButton = await screen.findByRole("button", {
      name: "ui:dialog.copyKey.createKey",
    })
    await user.click(createButton)

    expect(
      await screen.findByText("ui:dialog.copyKey.noKeyFoundAfterCreate"),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "ui:dialog.copyKey.createKey" }),
    )

    await waitFor(() => {
      expect(createApiTokenMock).toHaveBeenCalledTimes(2)
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(3)
      expect(writeText).toHaveBeenCalledWith("sk-test")
    })
  })

  it("shows a success toast when refreshed inventory contains multiple tokens", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([]).mockResolvedValueOnce([
      TOKEN,
      {
        ...TOKEN,
        id: 2,
        key: "sk-second",
        name: "second",
      },
    ])
    createApiTokenMock.mockResolvedValueOnce(true)

    const user = userEvent.setup()

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "ui:dialog.copyKey.createSuccess",
      )
    })
    expect(await screen.findByText("default")).toBeInTheDocument()
    expect(screen.getByText("second")).toBeInTheDocument()
  })

  it("does not start token creation for accounts without manageable credentials", async () => {
    render(
      <CopyKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={{ ...ACCOUNT, token: "", cookieAuthSessionCookie: "" }}
      />,
    )

    expect(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    ).toBeDisabled()
    expect(fetchAccountTokensMock).not.toHaveBeenCalled()
    expect(createApiTokenMock).not.toHaveBeenCalled()
  })

  it("clears loaded tokens when the selected account loses manageable credentials", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])

    const { rerender } = render(
      <CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />,
    )

    expect(await screen.findByText("default")).toBeInTheDocument()

    rerender(
      <CopyKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={{ ...ACCOUNT, token: "", cookieAuthSessionCookie: "" }}
      />,
    )

    expect(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    ).toBeDisabled()
    expect(screen.queryByText("default")).not.toBeInTheDocument()
    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
  })

  it("ignores stale token fetch completions after the selected account loses manageable credentials", async () => {
    const pendingTokens = createDeferred<(typeof TOKEN)[]>()
    fetchAccountTokensMock.mockReturnValueOnce(pendingTokens.promise)

    const { rerender } = render(
      <CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />,
    )

    await screen.findByText("ui:dialog.copyKey.loading")

    rerender(
      <CopyKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={{ ...ACCOUNT, token: "", cookieAuthSessionCookie: "" }}
      />,
    )

    expect(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    ).toBeDisabled()

    await act(async () => {
      pendingTokens.resolve([TOKEN])
      await pendingTokens.promise
    })

    expect(screen.queryByText("default")).not.toBeInTheDocument()
    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
  })

  it("opens a generic constrained Add Token dialog when default token policy requires selection", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])
    resolveDefaultTokenQuickCreateResolutionSpy.mockResolvedValueOnce({
      kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.SelectionRequired,
      allowedGroups: ["default", "vip"],
    })

    const user = userEvent.setup()

    const { rerender } = render(
      <CopyKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={{
          ...ACCOUNT,
          siteType: SITE_TYPES.NEW_API,
        }}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )

    await screen.findByText(
      "messages:tokenProvisioning.createRequiresGroupSelection",
    )
    expect(resolveDefaultTokenQuickCreateResolutionSpy).toHaveBeenCalledWith(
      expect.objectContaining({ siteType: SITE_TYPES.NEW_API }),
    )
    expect(createApiTokenMock).not.toHaveBeenCalled()

    rerender(
      <CopyKeyDialog
        isOpen={false}
        onClose={() => {}}
        account={{
          ...ACCOUNT,
          siteType: SITE_TYPES.NEW_API,
        }}
      />,
    )
    await waitFor(() => {
      expect(
        screen.queryByText(
          "messages:tokenProvisioning.createRequiresGroupSelection",
        ),
      ).not.toBeInTheDocument()
    })
  })

  it("creates a default key with the full policy-resolved token payload", async () => {
    const policyTokenData = {
      name: "Policy Resolved Copy Key",
      remain_quota: 777,
      expired_time: -1,
      unlimited_quota: false,
      model_limits_enabled: false,
      model_limits: "",
      allow_ips: "",
      group: "vip",
    }

    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([TOKEN])
    resolveDefaultTokenQuickCreateResolutionSpy.mockResolvedValueOnce({
      kind: TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Ready,
      tokenData: policyTokenData,
    })
    createApiTokenMock.mockResolvedValueOnce(true)

    const user = userEvent.setup()

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )

    await waitFor(() => {
      expect(createApiTokenMock).toHaveBeenCalledWith(
        expect.any(Object),
        policyTokenData,
      )
    })
  })

  it("requires manual Sub2API group selection when quick create cannot pick one", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])
    fetchUserGroupsMock.mockResolvedValueOnce({
      vip: { desc: "VIP", ratio: 1 },
      pro: { desc: "Pro", ratio: 1 },
    })

    const user = userEvent.setup()

    render(
      <CopyKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={{
          ...ACCOUNT,
          siteType: "sub2api",
          sub2apiAuth: {
            jwtToken: "jwt",
            refreshToken: "refresh",
            user: {
              id: "sub-user",
              email: "sub@example.com",
              displayName: "Sub User",
              group: "vip",
              groups: ["vip", "pro"],
            },
          },
        }}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createKey",
      }),
    )

    await screen.findByText(
      "messages:tokenProvisioning.createRequiresGroupSelection",
    )
    expect(fetchUserGroupsMock).toHaveBeenCalled()
    expect(createApiTokenMock).not.toHaveBeenCalled()
  })

  it("copies the resolved full key when inventory is masked", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([
      {
        ...TOKEN,
        key: "sk-abcd************wxyz",
      },
    ])
    resolveApiTokenKeyMock.mockResolvedValueOnce("sk-full-secret")

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(await screen.findByText("default"))
    await user.click(
      await screen.findByRole("button", { name: "ui:dialog.copyKey.copy" }),
    )

    await waitFor(() => {
      expect(resolveApiTokenKeyMock).toHaveBeenCalled()
      expect(writeText).toHaveBeenCalledWith("sk-full-secret")
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopyApiKey,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
      )
    })
  })

  it("tracks Cherry Studio export for a copied account token", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])
    resolveApiTokenKeyMock.mockResolvedValueOnce("sk-full-secret")

    const user = userEvent.setup()

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(await screen.findByText("default"))
    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.useInCherry",
      }),
    )

    await waitFor(() => {
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.ExportAccountTokenToCherryStudio,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(openInCherryStudioMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: "acc-1" }),
        expect.objectContaining({ key: "sk-full-secret" }),
      )
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
      )
    })
  })

  it("tracks managed-site single token import when the copied token flow opens", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])
    openWithAccountMock.mockResolvedValueOnce({ opened: true })

    const user = userEvent.setup()

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(await screen.findByText("default"))
    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:actions.importToManagedSite",
      }),
    )

    await waitFor(() => {
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.ImportManagedSiteSingleToken,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(openWithAccountMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: "acc-1" }),
        expect.objectContaining({ id: 1 }),
        expect.any(Function),
      )
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
      )
    })
  })

  it("keeps masked-key copy failures localized to the action and shows the error message", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([
      {
        ...TOKEN,
        key: "sk-abcd************wxyz",
      },
    ])
    resolveApiTokenKeyMock.mockRejectedValueOnce(
      new Error("masked fetch failed"),
    )

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(await screen.findByText("default"))
    await user.click(
      await screen.findByRole("button", { name: "ui:dialog.copyKey.copy" }),
    )

    await waitFor(() => {
      expect(resolveApiTokenKeyMock).toHaveBeenCalled()
      expect(writeText).not.toHaveBeenCalled()
      expect(toastErrorMock).toHaveBeenCalledWith("masked fetch failed")
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        },
      )
    })
  })

  it("shows the resolver error message when a saved masked key cannot be copied", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([
      {
        ...TOKEN,
        key: "sk-abcd************wxyz",
      },
    ])
    resolveApiTokenKeyMock.mockRejectedValueOnce(
      new ApiError(
        "messages:errors.tokenSecretUnavailable",
        undefined,
        undefined,
        API_ERROR_CODES.TOKEN_SECRET_UNAVAILABLE,
      ),
    )

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    await user.click(await screen.findByText("default"))
    await user.click(
      await screen.findByRole("button", { name: "ui:dialog.copyKey.copy" }),
    )

    await waitFor(() => {
      expect(resolveApiTokenKeyMock).toHaveBeenCalled()
      expect(writeText).not.toHaveBeenCalled()
      expect(toastErrorMock).toHaveBeenCalledWith(
        "messages:errors.tokenSecretUnavailable",
      )
    })
  })

  it("creates a custom token via AddTokenDialog then refreshes and auto-copies when exactly one token exists", async () => {
    fetchAccountTokensMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([TOKEN])
    fetchAccountAvailableModelsMock.mockResolvedValueOnce([])
    fetchUserGroupsMock.mockResolvedValueOnce({
      default: { desc: "default", ratio: 1 },
    })
    createApiTokenMock.mockResolvedValueOnce(true)

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(<CopyKeyDialog isOpen={true} onClose={() => {}} account={ACCOUNT} />)

    const customCreateButton = await screen.findByRole("button", {
      name: "ui:dialog.copyKey.createCustomKey",
    })
    await user.click(customCreateButton)

    await user.type(
      await screen.findByLabelText(/keyManagement:dialog\.tokenName/),
      "My Key",
    )

    await user.click(
      screen.getByRole("button", { name: "keyManagement:dialog.createToken" }),
    )

    await waitFor(() => {
      expect(createApiTokenMock).toHaveBeenCalledTimes(1)
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
      expect(writeText).toHaveBeenCalledWith("sk-test")
    })

    expect(createApiTokenMock.mock.calls[0]?.[1]).toMatchObject({
      name: "My Key",
      remain_quota: -1,
      expired_time: -1,
      unlimited_quota: true,
      model_limits_enabled: false,
      model_limits: "",
      allow_ips: "",
      group: "default",
    })
  })

  it("shows one-time key dialog for custom AIHubMix AddTokenDialog create returns", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])
    fetchAccountAvailableModelsMock.mockResolvedValueOnce([])
    fetchUserGroupsMock.mockResolvedValueOnce({
      default: { desc: "default", ratio: 1 },
    })
    createApiTokenMock.mockResolvedValueOnce({
      ...TOKEN,
      id: 10,
      key: "sk-custom-full-secret",
      name: "My Key",
    })

    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined)

    render(
      <CopyKeyDialog
        isOpen={true}
        onClose={() => {}}
        account={AIHUBMIX_ACCOUNT}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createCustomKey",
      }),
    )
    await user.type(
      await screen.findByLabelText(/keyManagement:dialog\.tokenName/),
      "My Key",
    )
    await user.click(
      screen.getByRole("button", { name: "keyManagement:dialog.createToken" }),
    )

    expect(
      await screen.findByText("keyManagement:oneTimeKey.title"),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText("keyManagement:oneTimeKey.keyLabel"),
    ).toHaveValue("sk-custom-full-secret")

    await waitFor(() => {
      expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
      expect(writeText).toHaveBeenCalledWith("sk-custom-full-secret")
    })
  })

  it("saves a custom AIHubMix one-time key to an API credential profile without closing the dialog", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])
    fetchAccountAvailableModelsMock.mockResolvedValueOnce([])
    fetchUserGroupsMock.mockResolvedValueOnce({
      default: { desc: "default", ratio: 1 },
    })
    createApiTokenMock.mockResolvedValueOnce({
      ...TOKEN,
      id: 10,
      key: "sk-custom-full-secret",
      name: "My Key",
    })
    createApiCredentialProfileMock.mockResolvedValueOnce({
      id: "profile-1",
      name: "AIHubMix - My Key",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: AIHUBMIX_ACCOUNT.baseUrl,
      apiKey: "sk-custom-full-secret",
      tagIds: AIHUBMIX_ACCOUNT.tagIds,
      notes: "",
      createdAt: 1,
      updatedAt: 1,
    })
    const onClose = vi.fn()

    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined)

    render(
      <CopyKeyDialog
        isOpen={true}
        onClose={onClose}
        account={AIHUBMIX_ACCOUNT}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "ui:dialog.copyKey.createCustomKey",
      }),
    )
    await user.type(
      await screen.findByLabelText(/keyManagement:dialog\.tokenName/),
      "My Key",
    )
    await user.click(
      screen.getByRole("button", { name: "keyManagement:dialog.createToken" }),
    )
    await user.click(
      await screen.findByTestId(
        TOKEN_PROVISIONING_TEST_IDS.oneTimeKeySaveButton,
      ),
    )

    await waitFor(() => {
      expect(createApiCredentialProfileMock).toHaveBeenCalledWith({
        name: "AIHubMix - My Key",
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: AIHUBMIX_ACCOUNT.baseUrl,
        apiKey: "sk-custom-full-secret",
        tagIds: AIHUBMIX_ACCOUNT.tagIds,
      })
    })
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "keyManagement:messages.savedToApiProfiles",
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(
      screen.getByLabelText("keyManagement:oneTimeKey.keyLabel"),
    ).toHaveValue("sk-custom-full-secret")
  })
})
