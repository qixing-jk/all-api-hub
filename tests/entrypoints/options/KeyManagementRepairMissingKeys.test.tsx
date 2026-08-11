import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeMessageTypes } from "~/constants/runtimeActions"
import KeyManagement from "~/entrypoints/options/pages/KeyManagement"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import { AccountKeyRepairMessageTypes } from "~/services/accounts/accountKeyAutoProvisioning/messaging"
import { ACCOUNT_KEY_RECONCILIATION_OUTCOMES } from "~/services/accounts/accountKeyInventoryReconciliation"
import { ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS } from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_STATUS_KINDS,
} from "~/services/productAnalytics/contracts"
import {
  ACCOUNT_KEY_REPAIR_JOB_STATES,
  ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES,
  ACCOUNT_KEY_REPAIR_OUTCOMES,
  ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION,
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
const { mockOpenDefaultTokenQuickCreateDialogForAccount } = vi.hoisted(() => ({
  mockOpenDefaultTokenQuickCreateDialogForAccount: vi.fn(),
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
    openDefaultTokenQuickCreateDialogForAccount:
      mockOpenDefaultTokenQuickCreateDialogForAccount,
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

vi.mock("~/features/TokenProvisioning/components/AddTokenDialog", () => ({
  default: () => null,
}))

const emptySummary = (): AccountKeyRepairProgress["summary"] => ({
  complete: 0,
  partial: 0,
  blocked: 0,
  skipped: 0,
  failed: 0,
  requirements: 0,
  coveredRequirements: 0,
  createdRequirements: 0,
  blockedRequirements: 0,
  rejectedRequirements: 0,
  uncertainRequirements: 0,
  invalidResources: 0,
  renameApplied: 0,
  renameRejected: 0,
  renameUncertain: 0,
  deleteApplied: 0,
  deleteRejected: 0,
  deleteUncertain: 0,
})

const buildAccountResult = (
  overrides: Partial<AccountKeyRepairProgress["results"][number]> = {},
): AccountKeyRepairProgress["results"][number] => ({
  accountId: "account-enabled",
  accountName: "Enabled Site",
  siteType: "unknown",
  siteUrlOrigin: "https://enabled.example.com",
  outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Covered,
  requirementResults: [],
  createdRefs: [],
  invalidResources: [],
  renameResults: [],
  finishedAt: 1,
  ...overrides,
})

const buildRequirement = (
  requirementKey: string,
  displayName: string,
  outcome: (typeof ACCOUNT_KEY_RECONCILIATION_OUTCOMES)[keyof typeof ACCOUNT_KEY_RECONCILIATION_OUTCOMES],
  resourceId?: string,
): AccountKeyRepairProgress["results"][number]["requirementResults"][number] => {
  const base = {
    requirement: {
      requirementKey,
      displayName,
      provisioning: {
        kind: ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS.Automatic,
      },
    },
    outcome,
  }
  return outcome === ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Created
    ? {
        ...base,
        outcome,
        created: {
          ref: {
            accountId: "account-enabled",
            siteType: "unknown",
            scopeKey: "account",
            resourceId: resourceId ?? requirementKey,
          },
        },
      }
    : (base as AccountKeyRepairProgress["results"][number]["requirementResults"][number])
}

const idleProgress: AccountKeyRepairProgress = {
  schemaVersion: ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION,
  jobId: "idle",
  state: ACCOUNT_KEY_REPAIR_JOB_STATES.Idle,
  totals: { enabledAccounts: 2, eligibleAccounts: 2, processedAccounts: 0 },
  summary: emptySummary(),
  results: [],
}

const startProgress: AccountKeyRepairProgress = {
  schemaVersion: ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION,
  jobId: "job-1",
  state: ACCOUNT_KEY_REPAIR_JOB_STATES.Running,
  startedAt: 1,
  updatedAt: 1,
  totals: { enabledAccounts: 2, eligibleAccounts: 2, processedAccounts: 2 },
  summary: {
    ...emptySummary(),
    complete: 1,
    skipped: 1,
    requirements: 1,
    createdRequirements: 1,
  },
  results: [
    buildAccountResult({
      accountId: "account-disabled",
      accountName: "Disabled Site",
      siteUrlOrigin: "https://disabled.example.com",
      outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped,
      skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.NoneAuth,
    }),
    buildAccountResult({
      requirementResults: [
        buildRequirement(
          "default",
          "Default",
          ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Created,
          "101",
        ),
      ],
      createdRefs: [
        {
          accountId: "account-enabled",
          siteType: "unknown",
          scopeKey: "account",
          resourceId: "101",
        },
      ],
    }),
  ],
}

const completedProgress: AccountKeyRepairProgress = {
  ...startProgress,
  state: ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
  finishedAt: 2,
  summary: { ...emptySummary(), complete: 2 },
  results: [
    buildAccountResult(),
    buildAccountResult({
      accountId: "account-enabled-2",
      accountName: "Another Site",
      siteUrlOrigin: "https://another.example.com",
      finishedAt: 2,
    }),
  ],
}

const multiOutcomeProgress: AccountKeyRepairProgress = {
  schemaVersion: ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION,
  jobId: "job-2",
  state: ACCOUNT_KEY_REPAIR_JOB_STATES.Running,
  startedAt: 1,
  updatedAt: 1,
  totals: { enabledAccounts: 2, eligibleAccounts: 2, processedAccounts: 2 },
  summary: { ...emptySummary(), complete: 1, failed: 1 },
  results: [
    buildAccountResult(),
    buildAccountResult({
      accountId: "account-enabled-2",
      accountName: "Another Site",
      siteUrlOrigin: "https://another.example.com",
      outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Failed,
      errorMessage: "boom",
      finishedAt: 2,
    }),
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
  schemaVersion: ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION,
  jobId: "job-3",
  state: ACCOUNT_KEY_REPAIR_JOB_STATES.Running,
  startedAt: 1,
  updatedAt: 1,
  totals: {
    enabledAccounts: 5,
    eligibleAccounts: 3,
    processedAccounts: 3,
  },
  summary: {
    ...emptySummary(),
    complete: 2,
    skipped: 2,
  },
  results: [
    buildAccountResult({
      accountId: "account-disabled",
      accountName: "Disabled Site",
      siteUrlOrigin: "https://disabled.example.com",
      outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped,
      skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.NoneAuth,
    }),
    buildAccountResult(),
    buildAccountResult({
      accountId: "account-enabled-2",
      accountName: "Another Site",
      siteUrlOrigin: "https://another.example.com",
      finishedAt: 2,
    }),
    buildAccountResult({
      accountId: "account-disabled-2",
      accountName: "Another Disabled Site",
      siteUrlOrigin: "https://disabled-2.example.com",
      outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped,
      skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.ProvisioningUnavailable,
      finishedAt: 2,
    }),
    buildAccountResult({
      accountId: "account-enabled-3",
      accountName: "Third Site",
      siteUrlOrigin: "https://third.example.com",
      finishedAt: 3,
    }),
  ],
}

const provisioningUnavailableProgress: AccountKeyRepairProgress = {
  schemaVersion: ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION,
  jobId: "job-4",
  state: ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
  startedAt: 1,
  updatedAt: 1,
  finishedAt: 1,
  totals: {
    enabledAccounts: 2,
    eligibleAccounts: 1,
    processedAccounts: 1,
  },
  summary: { ...emptySummary(), skipped: 1 },
  results: [
    buildAccountResult({
      accountId: "account-enabled-2",
      accountName: "Another Site",
      siteType: "sub2api",
      siteUrlOrigin: "https://another.example.com",
      outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped,
      skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.ProvisioningUnavailable,
    }),
  ],
}

const aihubmixSkippedProgress: AccountKeyRepairProgress = {
  schemaVersion: ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION,
  jobId: "job-5",
  state: ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
  startedAt: 1,
  updatedAt: 1,
  finishedAt: 1,
  totals: {
    enabledAccounts: 2,
    eligibleAccounts: 1,
    processedAccounts: 1,
  },
  summary: { ...emptySummary(), skipped: 1 },
  results: [
    buildAccountResult({
      accountId: "account-aihubmix",
      accountName: "AIHubMix",
      siteType: "AIHubMix",
      siteUrlOrigin: "https://aihubmix.com",
      outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped,
      skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.AihubmixOneTimeKey,
    }),
  ],
}

const coverageProgress: AccountKeyRepairProgress = {
  schemaVersion: ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION,
  jobId: "job-coverage",
  state: ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
  startedAt: 1,
  updatedAt: 2,
  finishedAt: 2,
  totals: {
    enabledAccounts: 1,
    eligibleAccounts: 1,
    processedAccounts: 1,
  },
  summary: {
    ...emptySummary(),
    complete: 1,
    requirements: 2,
    coveredRequirements: 1,
    createdRequirements: 1,
    invalidResources: 1,
  },
  results: [
    buildAccountResult({
      siteType: "new-api",
      requirementResults: [
        buildRequirement(
          "group:default",
          "default",
          ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Covered,
        ),
        buildRequirement(
          "group:vip",
          "vip",
          ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Created,
          "10",
        ),
      ],
      createdRefs: [
        {
          accountId: "account-enabled",
          siteType: "new-api",
          scopeKey: "account",
          resourceId: "10",
        },
      ],
      invalidResources: [
        {
          accountId: "account-enabled",
          accountName: "Enabled Site",
          siteType: "new-api",
          siteUrlOrigin: "https://enabled.example.com",
          ref: {
            accountId: "account-enabled",
            siteType: "new-api",
            scopeKey: "account",
            resourceId: "9",
          },
          displayLabel: "old group key",
          reason: "orphaned-placement",
        },
      ],
      finishedAt: 2,
    }),
  ],
}

const multiInvalidKeysProgress: AccountKeyRepairProgress = {
  ...coverageProgress,
  jobId: "job-many-invalid",
  summary: {
    ...coverageProgress.summary,
    invalidResources: 6,
  },
  results: [
    {
      ...coverageProgress.results[0],
      invalidResources: Array.from({ length: 6 }, (_, index) => ({
        accountId: "account-enabled",
        accountName: "Enabled Site",
        siteType: "new-api",
        siteUrlOrigin: "https://enabled.example.com",
        ref: {
          accountId: "account-enabled",
          siteType: "new-api" as const,
          scopeKey: "account",
          resourceId: String(index + 1),
        },
        displayLabel: `old group key ${index + 1}`,
        reason: "orphaned-placement",
      })),
      requirementResults: [
        ...coverageProgress.results[0].requirementResults,
        buildRequirement(
          "group:legacy",
          "legacy",
          ACCOUNT_KEY_RECONCILIATION_OUTCOMES.BlockedIncompleteInventory,
        ),
      ],
    },
  ],
}

const runningCoverageProgress: AccountKeyRepairProgress = {
  ...coverageProgress,
  jobId: "job-coverage-running",
  state: ACCOUNT_KEY_REPAIR_JOB_STATES.Running,
}

const runningMultiInvalidKeysProgress: AccountKeyRepairProgress = {
  ...multiInvalidKeysProgress,
  jobId: "job-many-invalid-running",
  state: ACCOUNT_KEY_REPAIR_JOB_STATES.Running,
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
    mockOpenDefaultTokenQuickCreateDialogForAccount.mockReset()
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
        { renameAutoTemplateTokens: true },
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
        { renameAutoTemplateTokens: true },
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
        { renameAutoTemplateTokens: true },
      )
    })

    fireEvent.click(
      screen.getByRole("button", {
        name: "common:actions.close",
      }),
    )

    fireEvent.click(repairButton)
    const pendingStartButton = screen.getByRole("button", {
      name: "common:status.starting",
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

    expect(
      await screen.findByText(
        "keyManagement:repairMissingKeys.previousResult.title",
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "keyManagement:repairMissingKeys.actions.rerun",
      }),
    ).not.toBeInTheDocument()
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
        { renameAutoTemplateTokens: true },
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
      summary: { ...startProgress.summary, complete: 2 },
      results: [
        ...startProgress.results,
        buildAccountResult({
          accountId: "account-enabled-2",
          accountName: "Another Site",
          siteUrlOrigin: "https://another.example.com",
          finishedAt: 2,
        }),
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

  it("shows repair-created import only after completed progress has exact references", async () => {
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
      expect(sendRuntimeActionMessageMock).toHaveBeenCalledWith(
        AccountKeyRepairMessageTypes.Start,
        { renameAutoTemplateTokens: true },
      )
    })
    expect(
      screen.queryByTestId(
        KEY_MANAGEMENT_TEST_IDS.repairCreatedManagedSiteImportButton,
      ),
    ).not.toBeInTheDocument()

    const completedWithReferences: AccountKeyRepairProgress = {
      ...startProgress,
      state: ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
      finishedAt: 2,
      results: startProgress.results.map((result) =>
        result.accountId === "account-enabled"
          ? {
              ...result,
              createdRefs: [
                {
                  accountId: result.accountId,
                  siteType: result.siteType,
                  scopeKey: "account",
                  resourceId: "101",
                },
              ],
            }
          : result,
      ),
    }

    await act(async () => {
      runtimeMessageState.listener?.({
        type: RuntimeMessageTypes.AccountKeyRepairProgress,
        payload: completedWithReferences,
      })
    })

    expect(
      await screen.findByTestId(
        KEY_MANAGEMENT_TEST_IDS.repairCreatedManagedSiteImportButton,
      ),
    ).toBeVisible()
  })

  it("shows history copy instead of running copy for terminal repair progress", async () => {
    sendRuntimeActionMessageMock.mockImplementation(async (message: any) => {
      if (message === AccountKeyRepairMessageTypes.GetProgress) {
        return { success: true, data: completedProgress }
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
      await screen.findByText(
        "keyManagement:repairMissingKeys.previousResult.title",
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("keyManagement:repairMissingKeys.runningNote"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("keyManagement:repairMissingKeys.historyNote"),
    ).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.previousResult.view",
      }),
    )

    expect(
      await screen.findByRole("button", {
        name: "keyManagement:repairMissingKeys.previousResult.backToSetup",
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("keyManagement:repairMissingKeys.historyNote"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "keyManagement:repairMissingKeys.actions.rerun",
      }),
    ).not.toBeInTheDocument()
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
        { renameAutoTemplateTokens: true },
      )
    })

    expect(screen.getByText("3 / 3")).toBeInTheDocument()
    expect(screen.queryByText(/5\/3/)).not.toBeInTheDocument()

    const progressBar = screen.getByRole("progressbar", {
      name: "keyManagement:repairMissingKeys.progressLabel",
    })
    expect(progressBar).toHaveAttribute("aria-valuetext", "3/3 (100%)")
    expect(progressBar).toHaveAttribute("aria-valuemax", "3")
    expect(progressBar).toHaveAttribute("aria-valuenow", "3")
  })

  it("shows the none-auth skip reason for skipped accounts", async () => {
    const visibleNoneAuthProgress: AccountKeyRepairProgress = {
      ...startProgress,
      results: [
        {
          ...startProgress.results[0],
          accountId: "account-enabled",
          accountName: "Enabled Site",
        },
      ],
    }

    sendRuntimeActionMessageMock.mockImplementation(async (message: any) => {
      if (message === AccountKeyRepairMessageTypes.GetProgress) {
        return { success: true, data: idleProgress }
      }
      if (message === AccountKeyRepairMessageTypes.Start) {
        return { success: true, data: visibleNoneAuthProgress }
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

    expect(await screen.findByText("Enabled Site")).toBeInTheDocument()
    expect(
      screen.getByText("keyManagement:repairMissingKeys.skipReasons.noneAuth"),
    ).toBeInTheDocument()
  })

  it("wires result search and outcome filtering in the dialog", async () => {
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
        { renameAutoTemplateTokens: true },
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
  })

  it("shows provisioning-unavailable guidance without a provider-specific action", async () => {
    sendRuntimeActionMessageMock.mockImplementation(async (message: any) => {
      if (message === AccountKeyRepairMessageTypes.GetProgress) {
        return { success: true, data: idleProgress }
      }
      if (message === AccountKeyRepairMessageTypes.Start) {
        return { success: true, data: provisioningUnavailableProgress }
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

    expect(
      screen.getByText(
        "keyManagement:repairMissingKeys.skipReasons.provisioningUnavailable",
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "keyManagement:dialog.createToken",
      }),
    ).not.toBeInTheDocument()
    expect(
      mockOpenDefaultTokenQuickCreateDialogForAccount,
    ).not.toHaveBeenCalled()
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
    expect(
      mockOpenDefaultTokenQuickCreateDialogForAccount,
    ).not.toHaveBeenCalled()
  })

  it("switches between account coverage and invalid key views", async () => {
    sendRuntimeActionMessageMock.mockImplementation(async (message: any) => {
      if (message === AccountKeyRepairMessageTypes.GetProgress) {
        return { success: true, data: runningCoverageProgress }
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
    expect(accountCoverageButton).toHaveAttribute("aria-pressed", "true")
    expect(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.views.invalidKeys",
      }),
    ).toHaveAttribute("aria-pressed", "false")
    expect(screen.queryByText("vip")).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.detailsFor",
      }),
    )
    expect(screen.getByText("vip")).toBeInTheDocument()
    expect(screen.queryByText("old group key")).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.views.invalidKeys",
      }),
    )

    expect(screen.getByText("old group key")).toBeInTheDocument()
    expect(
      screen.getByText(
        "keyManagement:repairMissingKeys.invalidKeys.reasons.orphanedPlacement",
      ),
    ).toBeInTheDocument()
  })

  it("shows missing groups and bulk-selects invalid keys", async () => {
    sendRuntimeActionMessageMock.mockImplementation(async (message: any) => {
      if (message === AccountKeyRepairMessageTypes.GetProgress) {
        return { success: true, data: runningMultiInvalidKeysProgress }
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
    expect(screen.queryByText("legacy")).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole("button", {
        name: "keyManagement:actions.detailsFor",
      }),
    )
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
        return { success: true, data: runningCoverageProgress }
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
          return { success: true, data: runningCoverageProgress }
        }
        if (message === AccountKeyRepairMessageTypes.DeleteInvalidResources) {
          return {
            success: true,
            data: {
              results: [
                {
                  resource: data.resources[0],
                  outcome: ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Applied,
                  finishedAt: 123,
                },
              ],
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
        AccountKeyRepairMessageTypes.DeleteInvalidResources,
        {
          resources: [
            expect.objectContaining({
              displayLabel: "old group key",
              ref: expect.objectContaining({ resourceId: "9" }),
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
          return { success: true, data: runningCoverageProgress }
        }
        if (message === AccountKeyRepairMessageTypes.DeleteInvalidResources) {
          return {
            success: true,
            data: {
              results: [
                {
                  resource: data.resources[0],
                  outcome: ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Applied,
                  finishedAt: 123,
                },
                {
                  resource: {
                    ...data.resources[0],
                    ref: { ...data.resources[0].ref, resourceId: "99" },
                    displayLabel: "already removed",
                  },
                  outcome: ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Applied,
                  finishedAt: 124,
                },
              ],
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
        return { success: true, data: runningCoverageProgress }
      }
      if (message === AccountKeyRepairMessageTypes.DeleteInvalidResources) {
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
        return { success: true, data: runningCoverageProgress }
      }
      if (message === AccountKeyRepairMessageTypes.DeleteInvalidResources) {
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
        return { success: true, data: runningCoverageProgress }
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
          ...runningCoverageProgress,
          summary: {
            ...runningCoverageProgress.summary,
            invalidResources: 0,
          },
          results: runningCoverageProgress.results.map((result) => ({
            ...result,
            invalidResources: [],
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
          return { success: true, data: runningCoverageProgress }
        }
        if (message === AccountKeyRepairMessageTypes.DeleteInvalidResources) {
          return {
            success: true,
            data: {
              results: [
                {
                  resource: data.resources[0],
                  outcome: ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Rejected,
                  failure: { code: "unexpected", message: "delete failed" },
                  finishedAt: 123,
                },
              ],
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
        "keyManagement:repairMissingKeys.invalidKeys.deleteNeedsAttention",
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
        "keyManagement:repairMissingKeys.invalidKeys.deleteNeedsAttention",
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
