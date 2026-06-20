import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeMessageTypes } from "~/constants/runtimeActions"
import KeyManagement from "~/entrypoints/options/pages/KeyManagement"
import { AccountKeyRepairMessageTypes } from "~/services/accounts/accountKeyAutoProvisioning/messaging"
import {
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_STATUS_KINDS,
} from "~/services/productAnalytics/events"
import {
  ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS,
  ACCOUNT_KEY_REPAIR_JOB_STATES,
  ACCOUNT_KEY_REPAIR_OUTCOMES,
  ACCOUNT_KEY_REPAIR_SKIP_REASONS,
  type AccountKeyRepairProgress,
} from "~/types/accountKeyAutoProvisioning"
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

vi.mock(
  "~/services/accounts/accountKeyAutoProvisioning/messaging",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/accounts/accountKeyAutoProvisioning/messaging")
      >()

    return {
      ...actual,
      sendAccountKeyRepairMessage: (type: string, data?: unknown) =>
        sendRuntimeActionMessageMock(type, data),
    }
  },
)

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
        userId: "1",
        authType: "access_token",
      },
      {
        id: "account-disabled",
        name: "Disabled Site",
        disabled: true,
        siteType: "unknown",
        baseUrl: "https://disabled.example.com",
        token: "token",
        userId: "1",
        authType: "access_token",
      },
      {
        id: "account-enabled-2",
        name: "Another Site",
        disabled: false,
        siteType: "sub2api",
        baseUrl: "https://another.example.com",
        token: "jwt-token",
        userId: "1",
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
  state: ACCOUNT_KEY_REPAIR_JOB_STATES.Idle,
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
  state: ACCOUNT_KEY_REPAIR_JOB_STATES.Running,
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
      outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped,
      skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.NoneAuth,
      finishedAt: 1,
    },
    {
      accountId: "account-enabled",
      accountName: "Enabled Site",
      siteType: "unknown",
      siteUrlOrigin: "https://enabled.example.com",
      outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Created,
      finishedAt: 1,
    },
  ],
}

const completedProgress: AccountKeyRepairProgress = {
  ...startProgress,
  jobId: "job-1",
  state: ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
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
      outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Created,
      finishedAt: 1,
    },
    {
      accountId: "account-enabled-2",
      accountName: "Another Site",
      siteType: "unknown",
      siteUrlOrigin: "https://another.example.com",
      outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Created,
      finishedAt: 2,
    },
  ],
}

const multiOutcomeProgress: AccountKeyRepairProgress = {
  jobId: "job-2",
  state: ACCOUNT_KEY_REPAIR_JOB_STATES.Running,
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
      outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Created,
      finishedAt: 1,
    },
    {
      accountId: "account-enabled-2",
      accountName: "Another Site",
      siteType: "unknown",
      siteUrlOrigin: "https://another.example.com",
      outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Failed,
      errorMessage: "boom",
      finishedAt: 2,
    },
  ],
}

const failedProgress: AccountKeyRepairProgress = {
  ...multiOutcomeProgress,
  jobId: "job-1",
  state: ACCOUNT_KEY_REPAIR_JOB_STATES.Failed,
  finishedAt: 2,
  lastError: "raw backend detail",
}

const inflatedProgress: AccountKeyRepairProgress = {
  jobId: "job-3",
  state: ACCOUNT_KEY_REPAIR_JOB_STATES.Running,
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
      outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped,
      skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.NoneAuth,
      finishedAt: 1,
    },
    {
      accountId: "account-enabled",
      accountName: "Enabled Site",
      siteType: "unknown",
      siteUrlOrigin: "https://enabled.example.com",
      outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Created,
      finishedAt: 1,
    },
    {
      accountId: "account-enabled-2",
      accountName: "Another Site",
      siteType: "unknown",
      siteUrlOrigin: "https://another.example.com",
      outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.AlreadyHad,
      finishedAt: 2,
    },
    {
      accountId: "account-disabled-2",
      accountName: "Another Disabled Site",
      siteType: "unknown",
      siteUrlOrigin: "https://disabled-2.example.com",
      outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped,
      skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.Sub2Api,
      finishedAt: 2,
    },
    {
      accountId: "account-enabled-3",
      accountName: "Third Site",
      siteType: "unknown",
      siteUrlOrigin: "https://third.example.com",
      outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Created,
      finishedAt: 3,
    },
  ],
}

const sub2apiSkippedProgress: AccountKeyRepairProgress = {
  jobId: "job-4",
  state: ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
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
      outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped,
      skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.Sub2Api,
      finishedAt: 1,
    },
  ],
}

const aihubmixSkippedProgress: AccountKeyRepairProgress = {
  jobId: "job-5",
  state: ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
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
      outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped,
      skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.AihubmixOneTimeKey,
      finishedAt: 1,
    },
  ],
}

const coverageProgress: AccountKeyRepairProgress = {
  jobId: "job-coverage",
  state: ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
  startedAt: 1,
  updatedAt: 2,
  finishedAt: 2,
  totals: {
    enabledAccounts: 1,
    eligibleAccounts: 1,
    processedAccounts: 1,
    processedEligibleAccounts: 1,
  },
  summary: {
    created: 1,
    alreadyHad: 0,
    skipped: 0,
    failed: 0,
    availableGroups: 2,
    coveredGroups: 2,
    createdKeys: 1,
    invalidKeys: 1,
  },
  results: [
    {
      accountId: "account-enabled",
      accountName: "Enabled Site",
      siteType: "new-api",
      siteUrlOrigin: "https://enabled.example.com",
      outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Created,
      availableGroups: ["default", "vip"],
      coveredGroups: ["default", "vip"],
      createdGroups: ["vip"],
      missingGroups: [],
      invalidTokens: [
        {
          accountId: "account-enabled",
          accountName: "Enabled Site",
          siteType: "new-api",
          siteUrlOrigin: "https://enabled.example.com",
          tokenId: 9,
          tokenName: "old group key",
          group: "old",
          reason: ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS.GroupUnavailable,
        },
      ],
      finishedAt: 2,
    },
  ],
}

const multiInvalidKeysProgress: AccountKeyRepairProgress = {
  ...coverageProgress,
  jobId: "job-many-invalid",
  summary: {
    ...coverageProgress.summary,
    invalidKeys: 6,
  },
  results: [
    {
      ...coverageProgress.results[0],
      invalidTokens: Array.from({ length: 6 }, (_, index) => ({
        accountId: "account-enabled",
        accountName: "Enabled Site",
        siteType: "new-api",
        siteUrlOrigin: "https://enabled.example.com",
        tokenId: index + 1,
        tokenName: `old group key ${index + 1}`,
        group: `old-${index + 1}`,
        reason: ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS.GroupUnavailable,
      })),
      missingGroups: ["legacy"],
    },
  ],
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return { promise, resolve, reject }
}

describe("KeyManagement repair missing keys entry point", () => {
  beforeEach(() => {
    mockOpenSub2ApiTokenCreationDialog.mockReset()
    mockTrackProductAnalyticsActionCompleted.mockReset()
    mockTrackProductAnalyticsActionStarted.mockReset()
  })

  it("opens the key check dialog without starting until the user confirms", async () => {
    sendRuntimeActionMessageMock.mockImplementation(async (message: any) => {
      if (message === AccountKeyRepairMessageTypes.GetProgress) {
        return { success: true, data: idleProgress }
      }
      if (message === AccountKeyRepairMessageTypes.Start) {
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

    expect(
      screen.getByText("keyManagement:repairMissingKeys.initialNotice"),
    ).toBeInTheDocument()
    expect(sendRuntimeActionMessageMock).toHaveBeenCalledWith(
      AccountKeyRepairMessageTypes.GetProgress,
      undefined,
    )
    expect(sendRuntimeActionMessageMock).not.toHaveBeenCalledWith(
      AccountKeyRepairMessageTypes.Start,
      undefined,
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.actions.start",
      }),
    )

    await waitFor(() => {
      expect(sendRuntimeActionMessageMock).toHaveBeenCalledWith(
        AccountKeyRepairMessageTypes.Start,
        undefined,
      )
    })
  })

  it("ignores repeated start clicks while the first start request is pending", async () => {
    const startRequest = createDeferred<{
      success: true
      data: AccountKeyRepairProgress
    }>()

    sendRuntimeActionMessageMock.mockImplementation(async (message: any) => {
      if (message === AccountKeyRepairMessageTypes.GetProgress) {
        return { success: true, data: idleProgress }
      }
      if (message === AccountKeyRepairMessageTypes.Start) {
        return startRequest.promise
      }
      return { success: false }
    })

    render(<KeyManagement />)

    fireEvent.click(
      await screen.findByRole("button", {
        name: "keyManagement:repairMissingKeys.action",
      }),
    )

    const startButton = screen.getByRole("button", {
      name: "keyManagement:repairMissingKeys.actions.start",
    })

    fireEvent.click(startButton)
    fireEvent.click(startButton)

    await waitFor(() => {
      expect(sendRuntimeActionMessageMock).toHaveBeenCalledWith(
        AccountKeyRepairMessageTypes.Start,
        undefined,
      )
    })
    expect(
      sendRuntimeActionMessageMock.mock.calls.filter(
        ([message]) => message === AccountKeyRepairMessageTypes.Start,
      ),
    ).toHaveLength(1)

    await act(async () => {
      startRequest.resolve({ success: true, data: startProgress })
      await startRequest.promise
    })
  })

  it("keeps the start guard when closing and reopening during a pending start", async () => {
    const startRequest = createDeferred<{
      success: true
      data: AccountKeyRepairProgress
    }>()

    sendRuntimeActionMessageMock.mockImplementation(async (message: any) => {
      if (message === AccountKeyRepairMessageTypes.GetProgress) {
        return { success: true, data: idleProgress }
      }
      if (message === AccountKeyRepairMessageTypes.Start) {
        return startRequest.promise
      }
      return { success: false }
    })

    render(<KeyManagement />)

    const repairButton = await screen.findByRole("button", {
      name: "keyManagement:repairMissingKeys.action",
    })

    fireEvent.click(repairButton)
    fireEvent.click(
      screen.getByRole("button", {
        name: /keyManagement:repairMissingKeys\.actions\.start/,
      }),
    )

    await waitFor(() => {
      expect(sendRuntimeActionMessageMock).toHaveBeenCalledWith(
        AccountKeyRepairMessageTypes.Start,
        undefined,
      )
    })

    fireEvent.click(
      screen.getByRole("button", {
        name: "common:actions.close",
      }),
    )

    fireEvent.click(repairButton)
    const pendingStartButton = screen.getByRole("button", {
      name: /keyManagement:repairMissingKeys\.actions\.start/,
    })
    expect(pendingStartButton).toBeDisabled()
    fireEvent.click(pendingStartButton)

    expect(
      sendRuntimeActionMessageMock.mock.calls.filter(
        ([message]) => message === AccountKeyRepairMessageTypes.Start,
      ),
    ).toHaveLength(1)

    await act(async () => {
      startRequest.resolve({ success: true, data: completedProgress })
      await startRequest.promise
    })

    const rerunButton = screen.getByRole("button", {
      name: "keyManagement:repairMissingKeys.actions.rerun",
    })
    const progressHeader = screen.getByTestId(
      "repair-missing-keys-progress-header",
    )
    const progressActions = screen.getByTestId(
      "repair-missing-keys-progress-actions",
    )
    expect(progressHeader).toHaveClass(
      "flex",
      "flex-wrap",
      "items-center",
      "justify-between",
    )
    expect(progressHeader).not.toHaveClass("flex-col", "sm:flex-row")
    expect(progressActions).toHaveClass(
      "flex-wrap",
      "items-center",
      "justify-end",
    )
    expect(progressActions).toHaveTextContent("2/2 (100%)")
    expect(progressActions).toContainElement(rerunButton)

    const enabledAccountsLabel = screen.getByText(
      "keyManagement:repairMissingKeys.totalsLabels.enabledAccounts",
    )
    expect(
      rerunButton.compareDocumentPosition(enabledAccountsLabel) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    fireEvent.click(rerunButton)

    await waitFor(() => {
      expect(
        sendRuntimeActionMessageMock.mock.calls.filter(
          ([message]) => message === AccountKeyRepairMessageTypes.Start,
        ),
      ).toHaveLength(2)
    })
  })

  it("opens dialog, subscribes to progress, and hides disabled accounts", async () => {
    sendRuntimeActionMessageMock.mockImplementation(async (message: any) => {
      if (message === AccountKeyRepairMessageTypes.GetProgress) {
        return { success: true, data: idleProgress }
      }
      if (message === AccountKeyRepairMessageTypes.Start) {
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

    fireEvent.click(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.actions.start",
      }),
    )

    await waitFor(() => {
      expect(sendRuntimeActionMessageMock).toHaveBeenCalledWith(
        AccountKeyRepairMessageTypes.Start,
        undefined,
      )
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
          outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.AlreadyHad,
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
      if (message === AccountKeyRepairMessageTypes.GetProgress) {
        return { success: true, data: idleProgress }
      }
      if (message === AccountKeyRepairMessageTypes.Start) {
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

    fireEvent.click(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.actions.start",
      }),
    )

    await waitFor(() => {
      expect(sendRuntimeActionMessageMock).toHaveBeenCalledWith(
        AccountKeyRepairMessageTypes.Start,
        undefined,
      )
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
      if (message === AccountKeyRepairMessageTypes.GetProgress) {
        return { success: true, data: idleProgress }
      }
      if (message === AccountKeyRepairMessageTypes.Start) {
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

    fireEvent.click(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.actions.start",
      }),
    )

    await waitFor(() => {
      expect(sendRuntimeActionMessageMock).toHaveBeenCalledWith(
        AccountKeyRepairMessageTypes.Start,
        undefined,
      )
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
      if (message === AccountKeyRepairMessageTypes.GetProgress) {
        return { success: true, data: idleProgress }
      }
      if (message === AccountKeyRepairMessageTypes.Start) {
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

    fireEvent.click(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.actions.start",
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
      if (message === AccountKeyRepairMessageTypes.GetProgress) {
        return { success: true, data: idleProgress }
      }
      if (message === AccountKeyRepairMessageTypes.Start) {
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

    fireEvent.click(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.actions.start",
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

  it("switches between account coverage and invalid key views", async () => {
    sendRuntimeActionMessageMock.mockImplementation(async (message: any) => {
      if (message === AccountKeyRepairMessageTypes.GetProgress) {
        return { success: true, data: coverageProgress }
      }
      return { success: false }
    })

    render(<KeyManagement />)

    fireEvent.click(
      await screen.findByRole("button", {
        name: "keyManagement:repairMissingKeys.action",
      }),
    )

    const viewSwitch = await screen.findByRole("group", {
      name: "keyManagement:repairMissingKeys.views.label",
    })
    expect(viewSwitch).toHaveClass("w-full", "rounded-lg", "p-1")
    expect(
      screen.getByTestId("repair-missing-keys-account-coverage-view-icon"),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId("repair-missing-keys-invalid-keys-view-icon"),
    ).toBeInTheDocument()
    const resultCount = screen.getByTestId("repair-missing-keys-result-count")
    expect(
      screen.getByTestId("repair-missing-keys-results-header"),
    ).toHaveClass("space-y-0")
    expect(
      screen.getByTestId("repair-missing-keys-result-heading-row"),
    ).toHaveClass("h-9", "items-center")
    expect(
      screen.getByTestId("repair-missing-keys-result-heading"),
    ).toHaveClass("items-baseline")
    expect(resultCount).toHaveTextContent("1/1")
    expect(resultCount).toHaveClass("leading-none", "tabular-nums")
    expect(resultCount).not.toHaveClass("rounded-full")
    const accountCoverageButton = screen.getByRole("button", {
      name: "keyManagement:repairMissingKeys.views.accountCoverage",
    })
    expect(accountCoverageButton).toHaveClass("scale-100")
    expect(accountCoverageButton).not.toHaveClass("scale-105")
    expect(accountCoverageButton).toHaveAttribute("aria-pressed", "true")
    expect(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.views.invalidKeys",
      }),
    ).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByText("vip")).toBeInTheDocument()
    expect(screen.queryByText("old group key")).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.views.invalidKeys",
      }),
    )

    expect(screen.getByText("old group key")).toBeInTheDocument()
    expect(screen.getByText("old")).toBeInTheDocument()
  })

  it("shows missing groups and bulk-selects invalid keys", async () => {
    sendRuntimeActionMessageMock.mockImplementation(async (message: any) => {
      if (message === AccountKeyRepairMessageTypes.GetProgress) {
        return { success: true, data: multiInvalidKeysProgress }
      }
      return { success: false }
    })

    render(<KeyManagement />)

    fireEvent.click(
      await screen.findByRole("button", {
        name: "keyManagement:repairMissingKeys.action",
      }),
    )

    expect(await screen.findByText("Enabled Site")).toBeInTheDocument()
    expect(screen.getByText("legacy")).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.views.invalidKeys",
      }),
    )

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "keyManagement:repairMissingKeys.invalidKeys.selectAll",
      }),
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.invalidKeys.deleteSelected",
      }),
    )

    expect(
      screen.getByText("keyManagement:repairMissingKeys.deleteConfirm.more"),
    ).toBeInTheDocument()
  })

  it("shows a search no-match state when invalid keys are filtered out", async () => {
    sendRuntimeActionMessageMock.mockImplementation(async (message: any) => {
      if (message === AccountKeyRepairMessageTypes.GetProgress) {
        return { success: true, data: coverageProgress }
      }
      return { success: false }
    })

    render(<KeyManagement />)

    fireEvent.click(
      await screen.findByRole("button", {
        name: "keyManagement:repairMissingKeys.action",
      }),
    )

    fireEvent.click(
      await screen.findByRole("button", {
        name: "keyManagement:repairMissingKeys.views.invalidKeys",
      }),
    )

    fireEvent.change(
      screen.getByPlaceholderText(
        "keyManagement:repairMissingKeys.searchPlaceholder",
      ),
      { target: { value: "does-not-match-invalid-keys" } },
    )

    expect(
      screen.getByText("keyManagement:repairMissingKeys.noMatchingResults"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(
        "keyManagement:repairMissingKeys.invalidKeys.emptyTitle",
      ),
    ).not.toBeInTheDocument()
  })

  it("deletes selected invalid keys after destructive confirmation", async () => {
    sendRuntimeActionMessageMock.mockImplementation(
      async (message: any, data: any) => {
        if (message === AccountKeyRepairMessageTypes.GetProgress) {
          return { success: true, data: coverageProgress }
        }
        if (message === AccountKeyRepairMessageTypes.DeleteInvalidTokens) {
          return {
            success: true,
            data: {
              deleted: [{ ...data.tokens[0], deletedAt: 123 }],
              failed: [],
            },
          }
        }
        return { success: false }
      },
    )

    render(<KeyManagement />)

    fireEvent.click(
      await screen.findByRole("button", {
        name: "keyManagement:repairMissingKeys.action",
      }),
    )
    fireEvent.click(
      await screen.findByRole("button", {
        name: "keyManagement:repairMissingKeys.views.invalidKeys",
      }),
    )
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "old group key",
      }),
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.invalidKeys.deleteSelected",
      }),
    )

    expect(
      screen.getByText(
        "keyManagement:repairMissingKeys.deleteConfirm.description",
      ),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByTestId("repair-invalid-keys-confirm-delete"))

    await waitFor(() => {
      expect(sendRuntimeActionMessageMock).toHaveBeenCalledWith(
        AccountKeyRepairMessageTypes.DeleteInvalidTokens,
        {
          tokens: [
            expect.objectContaining({
              tokenId: 9,
              tokenName: "old group key",
            }),
          ],
        },
      )
    })

    expect(
      await screen.findByText(
        "keyManagement:repairMissingKeys.invalidKeys.deleteSuccess",
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "keyManagement:repairMissingKeys.invalidKeys.emptyTitle",
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText("old group key")).not.toBeInTheDocument()
    await waitFor(() => {
      expect(
        screen.queryByText(
          "keyManagement:repairMissingKeys.deleteConfirm.description",
        ),
      ).not.toBeInTheDocument()
    })
    await waitFor(() => {
      expect(mockTrackProductAnalyticsActionStarted).toHaveBeenCalledWith({
        featureId: "key_management",
        actionId: "delete_invalid_account_tokens",
        surfaceId: "options_key_management_repair_dialog",
        entrypoint: "options",
      })
    })
    await waitFor(() => {
      expect(mockTrackProductAnalyticsActionCompleted).toHaveBeenCalledWith(
        expect.objectContaining({
          actionId: "delete_invalid_account_tokens",
          result: PRODUCT_ANALYTICS_RESULTS.Success,
          insights: expect.objectContaining({
            itemCount: 1,
            selectedCount: 1,
            successCount: 1,
            failureCount: 0,
          }),
        }),
      )
    })
  })

  it("keeps the invalid key summary aligned with actually visible deleted keys", async () => {
    sendRuntimeActionMessageMock.mockImplementation(
      async (message: any, data: any) => {
        if (message === AccountKeyRepairMessageTypes.GetProgress) {
          return { success: true, data: coverageProgress }
        }
        if (message === AccountKeyRepairMessageTypes.DeleteInvalidTokens) {
          return {
            success: true,
            data: {
              deleted: [
                { ...data.tokens[0], deletedAt: 123 },
                {
                  ...data.tokens[0],
                  tokenId: 99,
                  tokenName: "already removed",
                  deletedAt: 124,
                },
              ],
              failed: [],
            },
          }
        }
        return { success: false }
      },
    )

    render(<KeyManagement />)

    fireEvent.click(
      await screen.findByRole("button", {
        name: "keyManagement:repairMissingKeys.action",
      }),
    )
    fireEvent.click(
      await screen.findByRole("button", {
        name: "keyManagement:repairMissingKeys.views.invalidKeys",
      }),
    )
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "old group key",
      }),
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.invalidKeys.deleteSelected",
      }),
    )
    fireEvent.click(screen.getByTestId("repair-invalid-keys-confirm-delete"))

    expect(
      await screen.findByText(
        "keyManagement:repairMissingKeys.invalidKeys.deleteSuccess",
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId("repair-missing-keys-result-count"),
    ).toHaveTextContent("0/0")
  })

  it("closes confirmation and shows delete failure feedback when invalid key deletion fails", async () => {
    sendRuntimeActionMessageMock.mockImplementation(async (message: any) => {
      if (message === AccountKeyRepairMessageTypes.GetProgress) {
        return { success: true, data: coverageProgress }
      }
      if (message === AccountKeyRepairMessageTypes.DeleteInvalidTokens) {
        return { success: false }
      }
      return { success: false }
    })

    render(<KeyManagement />)

    fireEvent.click(
      await screen.findByRole("button", {
        name: "keyManagement:repairMissingKeys.action",
      }),
    )
    fireEvent.click(
      await screen.findByRole("button", {
        name: "keyManagement:repairMissingKeys.views.invalidKeys",
      }),
    )
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "old group key",
      }),
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.invalidKeys.deleteSelected",
      }),
    )
    fireEvent.click(screen.getByTestId("repair-invalid-keys-confirm-delete"))

    expect(
      await screen.findByText(
        "keyManagement:repairMissingKeys.invalidKeys.deleteFailed",
      ),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(
        screen.queryByText(
          "keyManagement:repairMissingKeys.deleteConfirm.description",
        ),
      ).not.toBeInTheDocument()
    })
    expect(screen.getByText("old group key")).toBeInTheDocument()
  })

  it("closes confirmation and shows delete failure feedback when the delete request throws", async () => {
    sendRuntimeActionMessageMock.mockImplementation(async (message: any) => {
      if (message === AccountKeyRepairMessageTypes.GetProgress) {
        return { success: true, data: coverageProgress }
      }
      if (message === AccountKeyRepairMessageTypes.DeleteInvalidTokens) {
        throw new Error("delete request failed")
      }
      return { success: false }
    })

    render(<KeyManagement />)

    fireEvent.click(
      await screen.findByRole("button", {
        name: "keyManagement:repairMissingKeys.action",
      }),
    )
    fireEvent.click(
      await screen.findByRole("button", {
        name: "keyManagement:repairMissingKeys.views.invalidKeys",
      }),
    )
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "old group key",
      }),
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.invalidKeys.deleteSelected",
      }),
    )
    fireEvent.click(screen.getByTestId("repair-invalid-keys-confirm-delete"))

    expect(
      await screen.findByText(
        "keyManagement:repairMissingKeys.invalidKeys.deleteFailed",
      ),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(
        screen.queryByText(
          "keyManagement:repairMissingKeys.deleteConfirm.description",
        ),
      ).not.toBeInTheDocument()
    })
    expect(mockTrackProductAnalyticsActionCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: "delete_invalid_account_tokens",
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      }),
    )
  })

  it("closes delete confirmation when selected invalid keys are pruned", async () => {
    sendRuntimeActionMessageMock.mockImplementation(async (message: any) => {
      if (message === AccountKeyRepairMessageTypes.GetProgress) {
        return { success: true, data: coverageProgress }
      }
      return { success: false }
    })

    render(<KeyManagement />)

    fireEvent.click(
      await screen.findByRole("button", {
        name: "keyManagement:repairMissingKeys.action",
      }),
    )
    fireEvent.click(
      await screen.findByRole("button", {
        name: "keyManagement:repairMissingKeys.views.invalidKeys",
      }),
    )
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "old group key",
      }),
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.invalidKeys.deleteSelected",
      }),
    )

    expect(
      screen.getByText(
        "keyManagement:repairMissingKeys.deleteConfirm.description",
      ),
    ).toBeInTheDocument()

    await act(async () => {
      runtimeMessageState.listener?.({
        type: RuntimeMessageTypes.AccountKeyRepairProgress,
        payload: {
          ...coverageProgress,
          summary: {
            ...coverageProgress.summary,
            invalidKeys: 0,
          },
          results: coverageProgress.results.map((result) => ({
            ...result,
            invalidTokens: [],
          })),
        },
      })
    })

    await waitFor(() => {
      expect(
        screen.queryByText(
          "keyManagement:repairMissingKeys.deleteConfirm.description",
        ),
      ).not.toBeInTheDocument()
    })
  })

  it("keeps invalid key delete feedback visible when search has no matches", async () => {
    sendRuntimeActionMessageMock.mockImplementation(
      async (message: any, data: any) => {
        if (message === AccountKeyRepairMessageTypes.GetProgress) {
          return { success: true, data: coverageProgress }
        }
        if (message === AccountKeyRepairMessageTypes.DeleteInvalidTokens) {
          return {
            success: true,
            data: {
              deleted: [],
              failed: [{ ...data.tokens[0], errorMessage: "delete failed" }],
            },
          }
        }
        return { success: false }
      },
    )

    render(<KeyManagement />)

    fireEvent.click(
      await screen.findByRole("button", {
        name: "keyManagement:repairMissingKeys.action",
      }),
    )
    fireEvent.click(
      await screen.findByRole("button", {
        name: "keyManagement:repairMissingKeys.views.invalidKeys",
      }),
    )
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "old group key",
      }),
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.invalidKeys.deleteSelected",
      }),
    )
    fireEvent.click(screen.getByTestId("repair-invalid-keys-confirm-delete"))

    expect(
      await screen.findByText(
        "keyManagement:repairMissingKeys.invalidKeys.deletePartial",
      ),
    ).toBeInTheDocument()

    fireEvent.change(
      screen.getByPlaceholderText(
        "keyManagement:repairMissingKeys.searchPlaceholder",
      ),
      { target: { value: "does-not-match-invalid-keys" } },
    )

    expect(
      screen.getByText(
        "keyManagement:repairMissingKeys.invalidKeys.deletePartial",
      ),
    ).toBeInTheDocument()
  })

  it("tracks started and successful completion analytics for manual repair start", async () => {
    sendRuntimeActionMessageMock.mockImplementation(async (message: any) => {
      if (message === AccountKeyRepairMessageTypes.GetProgress) {
        return { success: true, data: idleProgress }
      }
      if (message === AccountKeyRepairMessageTypes.Start) {
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

    fireEvent.click(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.actions.start",
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
      if (message === AccountKeyRepairMessageTypes.GetProgress) {
        return { success: true, data: idleProgress }
      }
      if (message === AccountKeyRepairMessageTypes.Start) {
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

    fireEvent.click(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.actions.start",
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

  it("tracks thrown start failures without raw error details", async () => {
    sendRuntimeActionMessageMock.mockImplementation(async (message: any) => {
      if (message === AccountKeyRepairMessageTypes.GetProgress) {
        return { success: true, data: idleProgress }
      }
      if (message === AccountKeyRepairMessageTypes.Start) {
        throw new Error("raw backend detail")
      }
      return { success: false }
    })

    render(<KeyManagement />)

    fireEvent.click(
      await screen.findByRole("button", {
        name: "keyManagement:repairMissingKeys.action",
      }),
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.actions.start",
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
    expect(
      screen.getByText("keyManagement:repairMissingKeys.messages.startFailed"),
    ).toBeInTheDocument()
    expect(
      mockTrackProductAnalyticsActionCompleted.mock.calls[0]?.[0],
    ).not.toHaveProperty("error")
  })

  it("tracks failed progress completion once without raw progress errors", async () => {
    sendRuntimeActionMessageMock.mockImplementation(async (message: any) => {
      if (message === AccountKeyRepairMessageTypes.GetProgress) {
        return { success: true, data: idleProgress }
      }
      if (message === AccountKeyRepairMessageTypes.Start) {
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

    fireEvent.click(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.actions.start",
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
