import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  RuntimeActionIds,
  RuntimeMessageTypes,
} from "~/constants/runtimeActions"
import KeyManagement from "~/entrypoints/options/pages/KeyManagement"
import {
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_STATUS_KINDS,
} from "~/services/productAnalytics/events"
import type { AccountKeyRepairProgress } from "~/types/accountKeyAutoProvisioning"
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "~~/tests/test-utils/render"

const { sendRuntimeActionMessageMock, runtimeMessageState } = vi.hoisted(
  () => ({
    sendRuntimeActionMessageMock: vi.fn(),
    runtimeMessageState: {
      listener: undefined as ((message: any) => void) | undefined,
    },
  }),
)
const { mockOpenSub2ApiTokenCreationDialog } = vi.hoisted(() => ({
  mockOpenSub2ApiTokenCreationDialog: vi.fn(),
}))
const {
  mockTrackProductAnalyticsActionCompleted,
  mockTrackProductAnalyticsActionStarted,
} = vi.hoisted(() => ({
  mockTrackProductAnalyticsActionCompleted: vi.fn(),
  mockTrackProductAnalyticsActionStarted: vi.fn(),
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    sendRuntimeActionMessage: sendRuntimeActionMessageMock,
    onRuntimeMessage: vi.fn((listener: (message: any) => void) => {
      runtimeMessageState.listener = listener
      return () => {
        if (runtimeMessageState.listener === listener) {
          runtimeMessageState.listener = undefined
        }
      }
    }),
  }
})

vi.mock("~/components/dialogs/ChannelDialog", () => ({
  ChannelDialogProvider: ({ children }: { children: ReactNode }) => children,
  useChannelDialog: () => ({
    openSub2ApiTokenCreationDialog: mockOpenSub2ApiTokenCreationDialog,
  }),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  trackProductAnalyticsActionStarted: mockTrackProductAnalyticsActionStarted,
  trackProductAnalyticsActionCompleted:
    mockTrackProductAnalyticsActionCompleted,
}))

vi.mock("~/features/KeyManagement/hooks/useKeyManagement", () => ({
  useKeyManagement: vi.fn(() => ({
    displayData: [
      {
        id: "account-enabled",
        name: "Enabled Site",
        disabled: false,
        siteType: "unknown",
        baseUrl: "https://enabled.example.com",
        token: "token",
        userId: 1,
        authType: "access_token",
      },
      {
        id: "account-disabled",
        name: "Disabled Site",
        disabled: true,
        siteType: "unknown",
        baseUrl: "https://disabled.example.com",
        token: "token",
        userId: 1,
        authType: "access_token",
      },
      {
        id: "account-enabled-2",
        name: "Another Site",
        disabled: false,
        siteType: "sub2api",
        baseUrl: "https://another.example.com",
        token: "jwt-token",
        userId: 1,
        authType: "access_token",
      },
    ],
    selectedAccount: "",
    setSelectedAccount: vi.fn(),
    searchTerm: "",
    setSearchTerm: vi.fn(),
    tokens: [],
    isLoading: false,
    visibleKeys: new Set(),
    isAddTokenOpen: false,
    editingToken: null,
    tokenLoadProgress: null,
    failedAccounts: [],
    accountSummaryItems: [],
    isManagedSiteChannelStatusSupported: true,
    allAccountsFilterAccountIds: [],
    setAllAccountsFilterAccountIds: vi.fn(),
    loadTokens: vi.fn(),
    filteredTokens: [],
    copyKey: vi.fn(),
    toggleKeyVisibility: vi.fn(),
    retryFailedAccounts: vi.fn(),
    handleAddToken: vi.fn(),
    handleCloseAddToken: vi.fn(),
    handleEditToken: vi.fn(),
    handleDeleteToken: vi.fn(),
  })),
}))

vi.mock("~/features/KeyManagement/components/AccountSelectorPanel", () => ({
  AccountSelectorPanel: () => <div data-testid="controls" />,
}))

vi.mock("~/features/KeyManagement/components/TokenList", () => ({
  TokenList: () => <div data-testid="token-list" />,
}))

vi.mock("~/features/KeyManagement/components/Footer", () => ({
  Footer: () => <div data-testid="footer" />,
}))

vi.mock("~/features/KeyManagement/components/AddTokenDialog", () => ({
  default: () => null,
}))

const idleProgress: AccountKeyRepairProgress = {
  jobId: "idle",
  state: "idle",
  totals: {
    enabledAccounts: 2,
    eligibleAccounts: 2,
    processedAccounts: 0,
  },
  summary: {
    created: 0,
    alreadyHad: 0,
    skipped: 0,
    failed: 0,
  },
  results: [],
}

const startProgress: AccountKeyRepairProgress = {
  jobId: "job-1",
  state: "running",
  startedAt: 1,
  updatedAt: 1,
  totals: {
    enabledAccounts: 2,
    eligibleAccounts: 2,
    processedAccounts: 2,
  },
  summary: {
    created: 1,
    alreadyHad: 0,
    skipped: 1,
    failed: 0,
  },
  results: [
    {
      accountId: "account-disabled",
      accountName: "Disabled Site",
      siteType: "unknown",
      siteUrlOrigin: "https://disabled.example.com",
      outcome: "skipped",
      skipReason: "noneAuth",
      finishedAt: 1,
    },
    {
      accountId: "account-enabled",
      accountName: "Enabled Site",
      siteType: "unknown",
      siteUrlOrigin: "https://enabled.example.com",
      outcome: "created",
      finishedAt: 1,
    },
  ],
}

const completedProgress: AccountKeyRepairProgress = {
  ...startProgress,
  jobId: "job-1",
  state: "completed",
  finishedAt: 2,
  totals: {
    enabledAccounts: 2,
    eligibleAccounts: 2,
    processedAccounts: 2,
    processedEligibleAccounts: 2,
  },
  summary: {
    created: 2,
    alreadyHad: 0,
    skipped: 0,
    failed: 0,
  },
  results: [
    {
      accountId: "account-enabled",
      accountName: "Enabled Site",
      siteType: "unknown",
      siteUrlOrigin: "https://enabled.example.com",
      outcome: "created",
      finishedAt: 1,
    },
    {
      accountId: "account-enabled-2",
      accountName: "Another Site",
      siteType: "unknown",
      siteUrlOrigin: "https://another.example.com",
      outcome: "created",
      finishedAt: 2,
    },
  ],
}

const multiOutcomeProgress: AccountKeyRepairProgress = {
  jobId: "job-2",
  state: "running",
  startedAt: 1,
  updatedAt: 1,
  totals: {
    enabledAccounts: 2,
    eligibleAccounts: 2,
    processedAccounts: 2,
  },
  summary: {
    created: 1,
    alreadyHad: 0,
    skipped: 0,
    failed: 1,
  },
  results: [
    {
      accountId: "account-enabled",
      accountName: "Enabled Site",
      siteType: "unknown",
      siteUrlOrigin: "https://enabled.example.com",
      outcome: "created",
      finishedAt: 1,
    },
    {
      accountId: "account-enabled-2",
      accountName: "Another Site",
      siteType: "unknown",
      siteUrlOrigin: "https://another.example.com",
      outcome: "failed",
      errorMessage: "boom",
      finishedAt: 2,
    },
  ],
}

const failedProgress: AccountKeyRepairProgress = {
  ...multiOutcomeProgress,
  jobId: "job-1",
  state: "failed",
  finishedAt: 2,
  lastError: "raw backend detail",
}

const inflatedProgress: AccountKeyRepairProgress = {
  jobId: "job-3",
  state: "running",
  startedAt: 1,
  updatedAt: 1,
  totals: {
    enabledAccounts: 5,
    eligibleAccounts: 3,
    processedAccounts: 5,
    processedEligibleAccounts: 3,
  },
  summary: {
    created: 2,
    alreadyHad: 1,
    skipped: 2,
    failed: 0,
  },
  results: [
    {
      accountId: "account-disabled",
      accountName: "Disabled Site",
      siteType: "unknown",
      siteUrlOrigin: "https://disabled.example.com",
      outcome: "skipped",
      skipReason: "noneAuth",
      finishedAt: 1,
    },
    {
      accountId: "account-enabled",
      accountName: "Enabled Site",
      siteType: "unknown",
      siteUrlOrigin: "https://enabled.example.com",
      outcome: "created",
      finishedAt: 1,
    },
    {
      accountId: "account-enabled-2",
      accountName: "Another Site",
      siteType: "unknown",
      siteUrlOrigin: "https://another.example.com",
      outcome: "alreadyHad",
      finishedAt: 2,
    },
    {
      accountId: "account-disabled-2",
      accountName: "Another Disabled Site",
      siteType: "unknown",
      siteUrlOrigin: "https://disabled-2.example.com",
      outcome: "skipped",
      skipReason: "sub2api",
      finishedAt: 2,
    },
    {
      accountId: "account-enabled-3",
      accountName: "Third Site",
      siteType: "unknown",
      siteUrlOrigin: "https://third.example.com",
      outcome: "created",
      finishedAt: 3,
    },
  ],
}

const sub2apiSkippedProgress: AccountKeyRepairProgress = {
  jobId: "job-4",
  state: "completed",
  startedAt: 1,
  updatedAt: 1,
  finishedAt: 1,
  totals: {
    enabledAccounts: 2,
    eligibleAccounts: 1,
    processedAccounts: 2,
    processedEligibleAccounts: 1,
  },
  summary: {
    created: 0,
    alreadyHad: 0,
    skipped: 1,
    failed: 0,
  },
  results: [
    {
      accountId: "account-enabled-2",
      accountName: "Another Site",
      siteType: "sub2api",
      siteUrlOrigin: "https://another.example.com",
      outcome: "skipped",
      skipReason: "sub2api",
      finishedAt: 1,
    },
  ],
}

const aihubmixSkippedProgress: AccountKeyRepairProgress = {
  jobId: "job-5",
  state: "completed",
  startedAt: 1,
  updatedAt: 1,
  finishedAt: 1,
  totals: {
    enabledAccounts: 2,
    eligibleAccounts: 1,
    processedAccounts: 1,
    processedEligibleAccounts: 1,
  },
  summary: {
    created: 0,
    alreadyHad: 0,
    skipped: 1,
    failed: 0,
  },
  results: [
    {
      accountId: "account-aihubmix",
      accountName: "AIHubMix",
      siteType: "AIHubMix",
      siteUrlOrigin: "https://aihubmix.com",
      outcome: "skipped",
      skipReason: "aihubmixOneTimeKey",
      finishedAt: 1,
    },
  ],
}

describe("KeyManagement repair missing keys entry point", () => {
  beforeEach(() => {
    mockOpenSub2ApiTokenCreationDialog.mockReset()
    mockTrackProductAnalyticsActionCompleted.mockReset()
    mockTrackProductAnalyticsActionStarted.mockReset()
  })

  it("opens dialog, subscribes to progress, and hides disabled accounts", async () => {
    sendRuntimeActionMessageMock.mockImplementation(async (message: any) => {
      if (message?.action === RuntimeActionIds.AccountKeyRepairGetProgress) {
        return { success: true, data: idleProgress }
      }
      if (message?.action === RuntimeActionIds.AccountKeyRepairStart) {
        return { success: true, data: startProgress }
      }
      return { success: false }
    })

    render(<KeyManagement />)

    const repairButton = await screen.findByRole("button", {
      name: "keyManagement:repairMissingKeys.action",
    })
    fireEvent.click(repairButton)

    expect(
      screen.getByText("keyManagement:repairMissingKeys.description"),
    ).toBeInTheDocument()

    await waitFor(() => {
      expect(sendRuntimeActionMessageMock).toHaveBeenCalledWith({
        action: RuntimeActionIds.AccountKeyRepairStart,
      })
    })

    expect(runtimeMessageState.listener).toBeTypeOf("function")

    // Disabled accounts must not be shown in the dialog/results.
    expect(await screen.findByText("Enabled Site")).toBeInTheDocument()
    expect(screen.queryByText("Disabled Site")).not.toBeInTheDocument()

    // Progress subscription updates the UI.
    const updated: AccountKeyRepairProgress = {
      ...startProgress,
      totals: { ...startProgress.totals, processedAccounts: 3 },
      summary: { ...startProgress.summary, alreadyHad: 1 },
      results: [
        ...startProgress.results,
        {
          accountId: "account-enabled-2",
          accountName: "Another Site",
          siteType: "unknown",
          siteUrlOrigin: "https://another.example.com",
          outcome: "alreadyHad",
          finishedAt: 2,
        },
      ],
    }

    await act(async () => {
      runtimeMessageState.listener?.({
        type: RuntimeMessageTypes.AccountKeyRepairProgress,
        payload: updated,
      })
    })

    expect(screen.getByText("Another Site")).toBeInTheDocument()
  })

  it("uses processed eligible totals for progress UI", async () => {
    sendRuntimeActionMessageMock.mockImplementation(async (message: any) => {
      if (message?.action === RuntimeActionIds.AccountKeyRepairGetProgress) {
        return { success: true, data: idleProgress }
      }
      if (message?.action === RuntimeActionIds.AccountKeyRepairStart) {
        return { success: true, data: inflatedProgress }
      }
      return { success: false }
    })

    render(<KeyManagement />)

    fireEvent.click(
      await screen.findByRole("button", {
        name: "keyManagement:repairMissingKeys.action",
      }),
    )

    await waitFor(() => {
      expect(sendRuntimeActionMessageMock).toHaveBeenCalledWith({
        action: RuntimeActionIds.AccountKeyRepairStart,
      })
    })

    expect(screen.getByText("3/3 (100%)")).toBeInTheDocument()
    expect(screen.queryByText(/5\/3/)).not.toBeInTheDocument()

    const progressBar = screen.getByRole("progressbar", {
      name: "keyManagement:repairMissingKeys.progressLabel",
    })
    expect(progressBar).toHaveAttribute("aria-valuetext", "3/3 (100%)")
    expect(progressBar).toHaveAttribute("aria-valuemax", "3")
    expect(progressBar).toHaveAttribute("aria-valuenow", "3")
  })

  it("supports search and outcome filtering in the dialog", async () => {
    sendRuntimeActionMessageMock.mockImplementation(async (message: any) => {
      if (message?.action === RuntimeActionIds.AccountKeyRepairGetProgress) {
        return { success: true, data: idleProgress }
      }
      if (message?.action === RuntimeActionIds.AccountKeyRepairStart) {
        return { success: true, data: multiOutcomeProgress }
      }
      return { success: false }
    })

    render(<KeyManagement />)

    fireEvent.click(
      await screen.findByRole("button", {
        name: "keyManagement:repairMissingKeys.action",
      }),
    )

    await waitFor(() => {
      expect(sendRuntimeActionMessageMock).toHaveBeenCalledWith({
        action: RuntimeActionIds.AccountKeyRepairStart,
      })
    })

    expect(await screen.findByText("Enabled Site")).toBeInTheDocument()
    expect(await screen.findByText("Another Site")).toBeInTheDocument()

    const searchInput = screen.getByPlaceholderText(
      "keyManagement:repairMissingKeys.searchPlaceholder",
    )

    fireEvent.change(searchInput, { target: { value: "Another" } })

    await waitFor(() => {
      expect(screen.queryByText("Enabled Site")).not.toBeInTheDocument()
      expect(screen.getByText("Another Site")).toBeInTheDocument()
    })

    fireEvent.click(
      await screen.findByRole("button", { name: "common:actions.clear" }),
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: /keyManagement:repairMissingKeys\.outcomes\.failed/,
      }),
    )

    await waitFor(() => {
      expect(screen.queryByText("Enabled Site")).not.toBeInTheDocument()
      expect(screen.getByText("Another Site")).toBeInTheDocument()
    })

    fireEvent.click(
      screen.getByRole("button", {
        name: /keyManagement:repairMissingKeys\.outcomes\.created/,
      }),
    )

    await waitFor(() => {
      expect(screen.getByText("Enabled Site")).toBeInTheDocument()
      expect(screen.queryByText("Another Site")).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: /common:total/ }))

    await waitFor(() => {
      expect(screen.getByText("Enabled Site")).toBeInTheDocument()
      expect(screen.getByText("Another Site")).toBeInTheDocument()
    })
  })

  it("offers a create-key action for skipped Sub2API accounts", async () => {
    sendRuntimeActionMessageMock.mockImplementation(async (message: any) => {
      if (message?.action === RuntimeActionIds.AccountKeyRepairGetProgress) {
        return { success: true, data: idleProgress }
      }
      if (message?.action === RuntimeActionIds.AccountKeyRepairStart) {
        return { success: true, data: sub2apiSkippedProgress }
      }
      return { success: false }
    })

    render(<KeyManagement />)

    fireEvent.click(
      await screen.findByRole("button", {
        name: "keyManagement:repairMissingKeys.action",
      }),
    )

    await waitFor(() => {
      expect(screen.getByText("Another Site")).toBeInTheDocument()
    })

    fireEvent.click(
      screen.getByRole("button", {
        name: "keyManagement:dialog.createToken",
      }),
    )

    await waitFor(() => {
      expect(mockOpenSub2ApiTokenCreationDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "account-enabled-2",
          siteType: "sub2api",
          baseUrl: "https://another.example.com",
        }),
      )
    })
  })

  it("shows the AIHubMix one-time-key skip reason without a direct create action", async () => {
    sendRuntimeActionMessageMock.mockImplementation(async (message: any) => {
      if (message?.action === RuntimeActionIds.AccountKeyRepairGetProgress) {
        return { success: true, data: idleProgress }
      }
      if (message?.action === RuntimeActionIds.AccountKeyRepairStart) {
        return { success: true, data: aihubmixSkippedProgress }
      }
      return { success: false }
    })

    render(<KeyManagement />)

    fireEvent.click(
      await screen.findByRole("button", {
        name: "keyManagement:repairMissingKeys.action",
      }),
    )

    expect((await screen.findAllByText("AIHubMix"))[0]).toBeInTheDocument()
    expect(
      screen.getByText(
        "keyManagement:repairMissingKeys.skipReasons.aihubmixOneTimeKey",
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "keyManagement:dialog.createToken",
      }),
    ).not.toBeInTheDocument()
    expect(mockOpenSub2ApiTokenCreationDialog).not.toHaveBeenCalled()
  })

  it("tracks started and successful completion analytics for start-on-open repair", async () => {
    sendRuntimeActionMessageMock.mockImplementation(async (message: any) => {
      if (message?.action === RuntimeActionIds.AccountKeyRepairGetProgress) {
        return { success: true, data: idleProgress }
      }
      if (message?.action === RuntimeActionIds.AccountKeyRepairStart) {
        return { success: true, data: startProgress }
      }
      return { success: false }
    })

    render(<KeyManagement />)

    fireEvent.click(
      await screen.findByRole("button", {
        name: "keyManagement:repairMissingKeys.action",
      }),
    )

    await waitFor(() => {
      expect(mockTrackProductAnalyticsActionStarted).toHaveBeenCalledWith({
        featureId: "key_management",
        actionId: "repair_missing_account_keys",
        surfaceId: "options_key_management_repair_dialog",
        entrypoint: "options",
      })
    })

    await act(async () => {
      runtimeMessageState.listener?.({
        type: RuntimeMessageTypes.AccountKeyRepairProgress,
        payload: completedProgress,
      })
      runtimeMessageState.listener?.({
        type: RuntimeMessageTypes.AccountKeyRepairProgress,
        payload: completedProgress,
      })
    })

    await waitFor(() => {
      expect(mockTrackProductAnalyticsActionCompleted).toHaveBeenCalledTimes(1)
    })
    expect(mockTrackProductAnalyticsActionCompleted).toHaveBeenCalledWith({
      featureId: "key_management",
      actionId: "repair_missing_account_keys",
      surfaceId: "options_key_management_repair_dialog",
      entrypoint: "options",
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      insights: {
        itemCount: 2,
        selectedCount: 2,
        successCount: 2,
        failureCount: 0,
        statusKind: PRODUCT_ANALYTICS_STATUS_KINDS.Healthy,
      },
    })
  })

  it("tracks immediate start failure without raw error details", async () => {
    sendRuntimeActionMessageMock.mockImplementation(async (message: any) => {
      if (message?.action === RuntimeActionIds.AccountKeyRepairGetProgress) {
        return { success: true, data: idleProgress }
      }
      if (message?.action === RuntimeActionIds.AccountKeyRepairStart) {
        return { success: false, error: "raw backend detail" }
      }
      return { success: false }
    })

    render(<KeyManagement />)

    fireEvent.click(
      await screen.findByRole("button", {
        name: "keyManagement:repairMissingKeys.action",
      }),
    )

    await waitFor(() => {
      expect(mockTrackProductAnalyticsActionCompleted).toHaveBeenCalledWith({
        featureId: "key_management",
        actionId: "repair_missing_account_keys",
        surfaceId: "options_key_management_repair_dialog",
        entrypoint: "options",
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: {
          itemCount: 2,
          selectedCount: 0,
          successCount: 0,
          failureCount: 0,
          statusKind: PRODUCT_ANALYTICS_STATUS_KINDS.Error,
        },
      })
    })
    expect(mockTrackProductAnalyticsActionStarted).not.toHaveBeenCalled()
    expect(
      mockTrackProductAnalyticsActionCompleted.mock.calls[0]?.[0],
    ).not.toHaveProperty("error")
  })

  it("tracks failed progress completion once without raw progress errors", async () => {
    sendRuntimeActionMessageMock.mockImplementation(async (message: any) => {
      if (message?.action === RuntimeActionIds.AccountKeyRepairGetProgress) {
        return { success: true, data: idleProgress }
      }
      if (message?.action === RuntimeActionIds.AccountKeyRepairStart) {
        return { success: true, data: startProgress }
      }
      return { success: false }
    })

    render(<KeyManagement />)

    fireEvent.click(
      await screen.findByRole("button", {
        name: "keyManagement:repairMissingKeys.action",
      }),
    )

    await waitFor(() => {
      expect(mockTrackProductAnalyticsActionStarted).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      runtimeMessageState.listener?.({
        type: RuntimeMessageTypes.AccountKeyRepairProgress,
        payload: failedProgress,
      })
      runtimeMessageState.listener?.({
        type: RuntimeMessageTypes.AccountKeyRepairProgress,
        payload: failedProgress,
      })
    })

    await waitFor(() => {
      expect(mockTrackProductAnalyticsActionCompleted).toHaveBeenCalledTimes(1)
    })
    expect(mockTrackProductAnalyticsActionCompleted).toHaveBeenCalledWith({
      featureId: "key_management",
      actionId: "repair_missing_account_keys",
      surfaceId: "options_key_management_repair_dialog",
      entrypoint: "options",
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      insights: {
        itemCount: 2,
        selectedCount: 2,
        successCount: 1,
        failureCount: 1,
        statusKind: PRODUCT_ANALYTICS_STATUS_KINDS.Error,
      },
    })
    expect(
      mockTrackProductAnalyticsActionCompleted.mock.calls[0]?.[0],
    ).not.toHaveProperty("lastError")
  })
})
