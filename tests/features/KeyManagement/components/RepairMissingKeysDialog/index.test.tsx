import { renderHook } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { SITE_TYPES } from "~/constants/siteType"
import { RepairMissingKeysDialog } from "~/features/KeyManagement/components/RepairMissingKeysDialog"
import { useRepairCreatedKeyManagedSiteImport } from "~/features/KeyManagement/components/RepairMissingKeysDialog/useRepairCreatedKeyManagedSiteImport"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import { AccountKeyRepairMessageTypes } from "~/services/accounts/accountKeyAutoProvisioning/messaging"
import { ACCOUNT_KEY_RECONCILIATION_OUTCOMES } from "~/services/accounts/accountKeyInventoryReconciliation"
import { buildAccountKeyResourceRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import { ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS } from "~/services/apiAdapters/contracts/accountKeyResource"
import type { DisplaySiteData } from "~/types"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import {
  ACCOUNT_KEY_REPAIR_JOB_STATES,
  ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES,
  ACCOUNT_KEY_REPAIR_OUTCOMES,
  ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION,
  ACCOUNT_KEY_REPAIR_SKIP_REASONS,
  type AccountKeyRepairProgress,
} from "~/types/accountKeyAutoProvisioning"
import {
  MANAGED_SITE_TOKEN_BATCH_EXPORT_INPUT_KINDS,
  MANAGED_SITE_TOKEN_BATCH_IMPORT_SOURCES,
  MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS,
} from "~/types/managedSiteTokenBatchExport"
import { buildCompleteTodayStatsAvailability } from "~~/tests/test-utils/accountTodayStats"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"
import { testI18n } from "~~/tests/test-utils/i18n"
import {
  act,
  render,
  screen,
  waitFor,
  within,
} from "~~/tests/test-utils/render"

const {
  mockHandleCancelAudit,
  mockHandleStartAudit,
  mockUseRepairMissingKeysJob,
  mockSetProgress,
  mockResolveRepairCreatedKeyBatchImportCandidate,
  mockGetCurrentManagedSiteRuntimeConfig,
  mockCreateManagedSiteTokenBatchImportTarget,
  mockSendAccountKeyRepairMessage,
  mockManagedSiteTokenBatchExportDialog,
  mockOpenSettingsTabInNewTab,
} = vi.hoisted(() => ({
  mockHandleCancelAudit: vi.fn(),
  mockHandleStartAudit: vi.fn(),
  mockUseRepairMissingKeysJob: vi.fn(),
  mockSetProgress: vi.fn(),
  mockResolveRepairCreatedKeyBatchImportCandidate: vi.fn(),
  mockGetCurrentManagedSiteRuntimeConfig: vi.fn(),
  mockCreateManagedSiteTokenBatchImportTarget: vi.fn(),
  mockSendAccountKeyRepairMessage: vi.fn(),
  mockManagedSiteTokenBatchExportDialog: vi.fn(),
  mockOpenSettingsTabInNewTab: vi.fn(),
}))
let mockProgress: AccountKeyRepairProgress
let mockIsStarting = false

function buildRepairProgress(
  state: AccountKeyRepairProgress["state"] = ACCOUNT_KEY_REPAIR_JOB_STATES.Idle,
  overrides: Partial<AccountKeyRepairProgress> = {},
): AccountKeyRepairProgress {
  return {
    schemaVersion: ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION,
    jobId: state,
    state,
    totals: {
      enabledAccounts: 0,
      eligibleAccounts: 0,
      processedAccounts: 0,
    },
    summary: {
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
    },
    results: [],
    ...overrides,
  }
}

vi.mock(
  "~/features/KeyManagement/components/RepairMissingKeysDialog/useRepairMissingKeysJob",
  () => ({
    useRepairMissingKeysJob: (options: unknown) => {
      mockUseRepairMissingKeysJob(options)
      return {
        error: "",
        handleCancelAudit: mockHandleCancelAudit,
        handleStartAudit: mockHandleStartAudit,
        isCancelling: false,
        isStarting: mockIsStarting,
        progress: mockProgress,
        setProgress: mockSetProgress,
      }
    },
  }),
)

vi.mock("~/utils/navigation", async () => {
  const actual =
    await vi.importActual<typeof import("~/utils/navigation")>(
      "~/utils/navigation",
    )
  return {
    ...actual,
    openSettingsTabInNewTab: mockOpenSettingsTabInNewTab,
  }
})

vi.mock(
  "~/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog",
  () => ({
    ManagedSiteTokenBatchExportDialog: (props: {
      isOpen: boolean
      onClose: () => void
      onCompleted?: (
        result: {
          totalSelected: number
          attemptedCount: number
          createdCount: number
          failedCount: number
          uncertainCount: number
          skippedCount: number
          items: Array<{
            id: string
            accountName: string
            runtimeKeyName: string
            result: "created" | "failed" | "uncertain"
            success: boolean
            skipped: boolean
          }>
        },
        context: { alreadyPresentItemIds: string[] },
      ) => void
    }) => {
      mockManagedSiteTokenBatchExportDialog(props)
      if (!props.isOpen) return null

      return (
        <div data-testid="repair-created-batch-dialog">
          <button type="button" onClick={props.onClose}>
            Close repair import
          </button>
        </div>
      )
    },
  }),
)

vi.mock("~/services/managedSites/repairCreatedKeyBatchImport", async () => {
  const actual = await vi.importActual<
    typeof import("~/services/managedSites/repairCreatedKeyBatchImport")
  >("~/services/managedSites/repairCreatedKeyBatchImport")
  return {
    ...actual,
    resolveRepairCreatedKeyBatchImportCandidate:
      mockResolveRepairCreatedKeyBatchImportCandidate,
  }
})

vi.mock("~/services/managedSites/runtimeConfig", async () => {
  const actual = await vi.importActual<
    typeof import("~/services/managedSites/runtimeConfig")
  >("~/services/managedSites/runtimeConfig")
  return {
    ...actual,
    getCurrentManagedSiteRuntimeConfig: mockGetCurrentManagedSiteRuntimeConfig,
  }
})

vi.mock("~/services/managedSites/tokenBatchImportTarget", async () => {
  const actual = await vi.importActual<
    typeof import("~/services/managedSites/tokenBatchImportTarget")
  >("~/services/managedSites/tokenBatchImportTarget")
  return {
    ...actual,
    createManagedSiteTokenBatchImportTarget:
      mockCreateManagedSiteTokenBatchImportTarget,
  }
})

vi.mock(
  "~/services/accounts/accountKeyAutoProvisioning/messaging",
  async () => {
    const actual = await vi.importActual<
      typeof import("~/services/accounts/accountKeyAutoProvisioning/messaging")
    >("~/services/accounts/accountKeyAutoProvisioning/messaging")
    return {
      ...actual,
      sendAccountKeyRepairMessage: mockSendAccountKeyRepairMessage,
    }
  },
)

function buildAccount(): DisplaySiteData {
  return {
    id: "account-1",
    name: "Account 1",
    username: "user@example.invalid",
    balance: { USD: 0, CNY: 0 },
    todayConsumption: { USD: 0, CNY: 0 },
    todayIncome: { USD: 0, CNY: 0 },
    todayTokens: { upload: 0, download: 0 },
    todayStatsAvailability: buildCompleteTodayStatsAvailability(),
    health: { status: SiteHealthStatus.Healthy },
    siteType: SITE_TYPES.NEW_API,
    baseUrl: "https://one.example.invalid",
    token: "token",
    userId: "user-1",
    authType: AuthTypeEnum.AccessToken,
    disabled: false,
    checkIn: buildCheckInConfig(),
  }
}

function buildAccountResult(
  overrides: Partial<AccountKeyRepairProgress["results"][number]> = {},
): AccountKeyRepairProgress["results"][number] {
  return {
    accountId: "account-1",
    accountName: "Account 1",
    siteType: SITE_TYPES.NEW_API,
    siteUrlOrigin: "https://one.example.invalid",
    outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Covered,
    requirementResults: [],
    createdRefs: [],
    invalidResources: [],
    renameResults: [],
    finishedAt: 1,
    ...overrides,
  }
}

function buildInvalidResource(
  account: Pick<DisplaySiteData, "id" | "name" | "siteType" | "baseUrl">,
  resourceId = "12",
) {
  return {
    accountId: account.id,
    accountName: account.name,
    siteType: account.siteType,
    siteUrlOrigin: account.baseUrl,
    ref: {
      accountId: account.id,
      siteType: account.siteType,
      scopeKey: "account",
      resourceId,
    },
    displayLabel: "Invalid key",
    reason: "orphaned-placement",
  }
}

function buildCreatedProgress(
  account: DisplaySiteData,
  overrides: Partial<AccountKeyRepairProgress> = {},
): AccountKeyRepairProgress {
  const createdRef = {
    accountId: account.id,
    siteType: account.siteType,
    scopeKey: "account",
    resourceId: "11",
  } as const
  return buildRepairProgress(ACCOUNT_KEY_REPAIR_JOB_STATES.Completed, {
    jobId: "repair-job",
    totals: {
      enabledAccounts: 1,
      eligibleAccounts: 1,
      processedAccounts: 1,
    },
    summary: {
      ...buildRepairProgress().summary,
      complete: 1,
      requirements: 1,
      createdRequirements: 1,
    },
    results: [
      {
        accountId: account.id,
        accountName: account.name,
        siteType: account.siteType,
        siteUrlOrigin: account.baseUrl,
        outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Repaired,
        requirementResults: [
          {
            requirement: {
              requirementKey: "group:alpha",
              displayName: "alpha",
              provisioning: {
                kind: ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS.Automatic,
              },
            },
            outcome: ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Created,
            created: { ref: createdRef },
          },
        ],
        createdRefs: [createdRef],
        invalidResources: [],
        renameResults: [],
        finishedAt: 1,
      },
    ],
    ...overrides,
  })
}

function buildRepairImportCandidate(
  account: DisplaySiteData,
  verification:
    | typeof MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.TRUSTED_NEW
    | typeof MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.COMPLETE = MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.TRUSTED_NEW,
) {
  const ref = {
    accountId: account.id,
    siteType: account.siteType,
    scopeKey: "account",
    resourceId: "11",
  } as const

  return {
    items: [
      {
        kind: MANAGED_SITE_TOKEN_BATCH_EXPORT_INPUT_KINDS.RESOLVED,
        account,
        runtimeKey: buildAccountKeyResourceRuntimeKey(account, {
          ref,
          label: "Created alpha key",
          secret: "resolved-runtime-secret",
        }),
      },
    ],
    intent: {
      source: MANAGED_SITE_TOKEN_BATCH_IMPORT_SOURCES.REPAIR_CREATED,
      verification,
    },
  }
}

describe("RepairMissingKeysDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsStarting = false
    mockProgress = buildRepairProgress()
    mockGetCurrentManagedSiteRuntimeConfig.mockResolvedValue({
      siteType: SITE_TYPES.NEW_API,
      config: {
        baseUrl: "https://target.example.invalid",
        adminToken: "target-token",
        userId: "1",
      },
    })
    mockCreateManagedSiteTokenBatchImportTarget.mockResolvedValue({
      targetFingerprint: "a".repeat(64),
      targetSummary: {
        siteType: SITE_TYPES.NEW_API,
        baseUrl: "https://target.example.invalid",
        compatibleUserId: "1",
      },
    })
    mockResolveRepairCreatedKeyBatchImportCandidate.mockResolvedValue(null)
    mockSendAccountKeyRepairMessage.mockImplementation(async () => ({
      success: true,
      data: mockProgress,
    }))
  })

  it("ignores a stale import action before repair completion", async () => {
    const account = buildAccount()
    const progress = buildRepairProgress(ACCOUNT_KEY_REPAIR_JOB_STATES.Running)
    const { result } = renderHook(() =>
      useRepairCreatedKeyManagedSiteImport({
        accounts: [account],
        isOpen: true,
        isCurrentSessionResult: true,
        managedSiteType: SITE_TYPES.NEW_API,
        progress,
        setProgress: vi.fn(),
        t: testI18n.t,
      }),
    )

    await act(async () => {
      await result.current.openBatchImport()
    })

    expect(mockGetCurrentManagedSiteRuntimeConfig).not.toHaveBeenCalled()
    expect(result.current.isBatchImportOpen).toBe(false)
  })

  it("forwards cancellation from the running progress card", async () => {
    const user = userEvent.setup()
    mockProgress = buildRepairProgress(ACCOUNT_KEY_REPAIR_JOB_STATES.Running)

    render(
      <RepairMissingKeysDialog
        isOpen
        onClose={vi.fn()}
        accounts={[buildAccount()]}
        startOnOpen={false}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:repairMissingKeys.actions.cancel",
      }),
    )

    expect(mockHandleCancelAudit).toHaveBeenCalledOnce()
  })

  it("defaults to keeping auto-created key names aligned and explains the scope", async () => {
    const user = userEvent.setup()

    render(
      <RepairMissingKeysDialog
        isOpen
        onClose={vi.fn()}
        accounts={[buildAccount()]}
        startOnOpen={false}
      />,
    )

    const checkbox = await screen.findByRole("checkbox", {
      name: "keyManagement:repairMissingKeys.renameOption.label",
    })

    expect(checkbox).toBeChecked()
    expect(
      screen.getByText("keyManagement:repairMissingKeys.renameOption.helper"),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.renameOption.infoLabel",
      }),
    ).toBeInTheDocument()

    await user.click(checkbox)
    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.actions.start",
      }),
    )

    expect(mockHandleStartAudit).toHaveBeenCalledTimes(1)
    expect(mockUseRepairMissingKeysJob).toHaveBeenLastCalledWith(
      expect.objectContaining({
        renameAutoTemplateTokens: false,
      }),
    )
  })

  it("de-emphasizes a historical result behind the current check setup", async () => {
    const user = userEvent.setup()
    mockProgress = buildRepairProgress(
      ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
      {
        results: [
          buildAccountResult({
            siteType: SITE_TYPES.SUB2API,
            siteUrlOrigin: "https://sub2api.example.invalid",
            outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped,
            skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.ProvisioningUnavailable,
          }),
        ],
      },
    )

    render(
      <RepairMissingKeysDialog
        isOpen
        onClose={vi.fn()}
        accounts={[buildAccount()]}
        startOnOpen={false}
      />,
    )

    expect(
      await screen.findByText(
        "keyManagement:repairMissingKeys.previousResult.title",
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.previousResult.view",
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("progressbar", {
        name: "keyManagement:repairMissingKeys.progressLabel",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("keyManagement:repairMissingKeys.resultsTitle"),
    ).not.toBeInTheDocument()

    const checkbox = await screen.findByRole("checkbox", {
      name: "keyManagement:repairMissingKeys.renameOption.label",
    })
    expect(checkbox).toBeChecked()
    expect(
      screen.getByText("keyManagement:repairMissingKeys.renameOption.helper"),
    ).toBeInTheDocument()

    await user.click(checkbox)
    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.actions.start",
      }),
    )

    expect(mockHandleStartAudit).toHaveBeenCalledTimes(1)
    expect(mockUseRepairMissingKeysJob).toHaveBeenLastCalledWith(
      expect.objectContaining({
        renameAutoTemplateTokens: false,
      }),
    )
  })

  it("keeps the previous result collapsed while a new check is starting", async () => {
    const user = userEvent.setup()
    mockProgress = buildRepairProgress(ACCOUNT_KEY_REPAIR_JOB_STATES.Completed)
    mockHandleStartAudit.mockImplementation(() => {
      mockIsStarting = true
      return new Promise(() => {})
    })

    render(
      <RepairMissingKeysDialog
        isOpen
        onClose={vi.fn()}
        accounts={[buildAccount()]}
        startOnOpen={false}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:repairMissingKeys.actions.start",
      }),
    )

    expect(mockHandleStartAudit).toHaveBeenCalledTimes(1)
    expect(
      screen.getByText("keyManagement:repairMissingKeys.previousResult.title"),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("progressbar", {
        name: "keyManagement:repairMissingKeys.progressLabel",
      }),
    ).not.toBeInTheDocument()
  })

  it("keeps AIHubMix as an explicit one-time-key repair skip", async () => {
    const user = userEvent.setup()
    mockProgress = buildRepairProgress(
      ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
      {
        results: [
          buildAccountResult({
            accountId: "aihubmix-1",
            accountName: "AIHubMix",
            siteType: SITE_TYPES.AIHUBMIX,
            siteUrlOrigin: "https://aihubmix.example.invalid",
            outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped,
            skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.AihubmixOneTimeKey,
          }),
        ],
      },
    )

    render(
      <RepairMissingKeysDialog
        isOpen
        onClose={vi.fn()}
        accounts={[buildAccount()]}
        startOnOpen={false}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:repairMissingKeys.previousResult.view",
      }),
    )

    expect(screen.getAllByText("AIHubMix")).not.toHaveLength(0)
    expect(
      screen.getByText(
        "keyManagement:repairMissingKeys.skipReasons.aihubmixOneTimeKey",
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "keyManagement:repairMissingKeys.invalidKeys.deleteSelected",
      }),
    ).not.toBeInTheDocument()
  })

  it("shows historical result details as read-only and can return to check setup", async () => {
    const user = userEvent.setup()
    mockProgress = buildRepairProgress(
      ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
      {
        totals: {
          enabledAccounts: 1,
          eligibleAccounts: 1,
          processedAccounts: 1,
        },
        summary: {
          ...buildRepairProgress().summary,
          partial: 1,
          invalidResources: 1,
        },
        results: [
          buildAccountResult({
            accountId: "account-1",
            accountName: "Account 1",
            siteType: SITE_TYPES.SUB2API,
            siteUrlOrigin: "https://sub2api.example.invalid",
            outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Partial,
            invalidResources: [
              buildInvalidResource(
                {
                  id: "account-1",
                  name: "Account 1",
                  siteType: SITE_TYPES.SUB2API,
                  baseUrl: "https://sub2api.example.invalid",
                },
                "1",
              ),
            ],
          }),
        ],
      },
    )

    render(
      <RepairMissingKeysDialog
        isOpen
        onClose={vi.fn()}
        accounts={[buildAccount()]}
        startOnOpen={false}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:repairMissingKeys.previousResult.view",
      }),
    )

    expect(
      screen.queryByRole("progressbar", {
        name: "keyManagement:repairMissingKeys.progressLabel",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(
        "keyManagement:repairMissingKeys.summary.completedNeedsAttention",
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText("keyManagement:repairMissingKeys.resultsTitle"),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "keyManagement:repairMissingKeys.actions.rerun",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("checkbox", {
        name: "keyManagement:repairMissingKeys.renameOption.label",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "keyManagement:dialog.createToken",
      }),
    ).not.toBeInTheDocument()
    await user.click(
      screen.getByRole("button", {
        name: /keyManagement:repairMissingKeys\.views\.invalidKeys/,
      }),
    )

    expect(screen.getByText("Invalid key")).toBeInTheDocument()
    expect(
      screen.queryByRole("checkbox", {
        name: "keyManagement:repairMissingKeys.invalidKeys.selectAll",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "keyManagement:repairMissingKeys.invalidKeys.deleteSelected",
      }),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.previousResult.backToSetup",
      }),
    )

    expect(
      await screen.findByRole("button", {
        name: "keyManagement:repairMissingKeys.actions.start",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("checkbox", {
        name: "keyManagement:repairMissingKeys.renameOption.label",
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("progressbar", {
        name: "keyManagement:repairMissingKeys.progressLabel",
      }),
    ).not.toBeInTheDocument()
  })

  it("closes the invalid-key deletion confirmation without deleting", async () => {
    const user = userEvent.setup()
    const account = buildAccount()
    mockProgress = buildRepairProgress(ACCOUNT_KEY_REPAIR_JOB_STATES.Running, {
      jobId: "repair-job",
    })
    const view = render(
      <RepairMissingKeysDialog
        isOpen
        onClose={vi.fn()}
        accounts={[account]}
        startOnOpen={false}
      />,
    )
    await screen.findByRole("progressbar", {
      name: "keyManagement:repairMissingKeys.progressLabel",
    })

    mockProgress = buildCreatedProgress(account, {
      results: [
        buildAccountResult({
          accountId: account.id,
          accountName: account.name,
          siteType: account.siteType,
          siteUrlOrigin: account.baseUrl,
          outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Partial,
          invalidResources: [buildInvalidResource(account)],
        }),
      ],
    })
    view.rerender(
      <RepairMissingKeysDialog
        isOpen
        onClose={vi.fn()}
        accounts={[account]}
        startOnOpen={false}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: /keyManagement:repairMissingKeys\.views\.invalidKeys/,
      }),
    )
    await user.click(screen.getByRole("checkbox", { name: "Invalid key" }))
    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.invalidKeys.deleteSelected",
      }),
    )

    const confirmDialog = screen.getByRole("dialog", {
      name: /keyManagement:repairMissingKeys\.deleteConfirm\.title/,
    })
    await user.click(
      within(confirmDialog).getByRole("button", {
        name: "common:actions.cancel",
      }),
    )

    expect(
      screen.queryByRole("dialog", {
        name: /keyManagement:repairMissingKeys\.deleteConfirm\.title/,
      }),
    ).toBeNull()
    expect(mockSendAccountKeyRepairMessage).not.toHaveBeenCalledWith(
      AccountKeyRepairMessageTypes.DeleteInvalidResources,
      expect.anything(),
    )
  })

  it("resolves current-session created keys lazily and opens the shared trusted review", async () => {
    const user = userEvent.setup()
    const account = buildAccount()
    mockProgress = buildRepairProgress(ACCOUNT_KEY_REPAIR_JOB_STATES.Running, {
      jobId: "repair-job",
    })
    mockResolveRepairCreatedKeyBatchImportCandidate.mockResolvedValue(
      buildRepairImportCandidate(account),
    )

    const view = render(
      <RepairMissingKeysDialog
        isOpen
        onClose={vi.fn()}
        accounts={[account]}
        startOnOpen={false}
      />,
    )

    await screen.findByRole("progressbar", {
      name: "keyManagement:repairMissingKeys.progressLabel",
    })
    mockProgress = buildCreatedProgress(account)
    view.rerender(
      <RepairMissingKeysDialog
        isOpen
        onClose={vi.fn()}
        accounts={[account]}
        startOnOpen={false}
      />,
    )

    const openButton = await screen.findByTestId(
      KEY_MANAGEMENT_TEST_IDS.repairCreatedManagedSiteImportButton,
    )
    const importCard = screen.getByTestId(
      KEY_MANAGEMENT_TEST_IDS.repairCreatedManagedSiteImportCard,
    )
    expect(importCard).toBeVisible()
    expect(importCard).toHaveTextContent(
      "keyManagement:repairMissingKeys.managedSiteImport.target",
    )
    expect(
      screen.getByTestId(
        KEY_MANAGEMENT_TEST_IDS.repairCreatedManagedSiteImportTargetSwitcher,
      ),
    ).toHaveAttribute("role", "combobox")
    expect(
      mockResolveRepairCreatedKeyBatchImportCandidate,
    ).not.toHaveBeenCalled()

    await user.click(openButton)

    await waitFor(() => {
      expect(
        mockResolveRepairCreatedKeyBatchImportCandidate,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          progress: mockProgress,
          accounts: [account],
          targetFingerprint: "a".repeat(64),
          freshness: "current-session",
        }),
      )
    })
    expect(
      mockManagedSiteTokenBatchExportDialog.mock.calls.at(-1)?.[0],
    ).toEqual(
      expect.objectContaining({
        isOpen: true,
        intent: {
          source: MANAGED_SITE_TOKEN_BATCH_IMPORT_SOURCES.REPAIR_CREATED,
          verification:
            MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.TRUSTED_NEW,
        },
      }),
    )
    expect(screen.getByTestId("repair-created-batch-dialog")).toBeVisible()

    await user.click(
      screen.getByRole("button", { name: "Close repair import" }),
    )

    expect(
      await screen.findByTestId(
        KEY_MANAGEMENT_TEST_IDS.repairCreatedManagedSiteImportButton,
      ),
    ).toBeVisible()
    expect(mockUseRepairMissingKeysJob).toHaveBeenLastCalledWith(
      expect.objectContaining({ isOpen: true }),
    )
  })

  it("opens a stored current-version result with complete verification", async () => {
    const user = userEvent.setup()
    const account = buildAccount()
    mockProgress = buildCreatedProgress(account)
    mockResolveRepairCreatedKeyBatchImportCandidate.mockResolvedValue(
      buildRepairImportCandidate(
        account,
        MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.COMPLETE,
      ),
    )

    render(
      <RepairMissingKeysDialog
        isOpen
        onClose={vi.fn()}
        accounts={[account]}
        startOnOpen={false}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:repairMissingKeys.previousResult.view",
      }),
    )
    await user.click(
      screen.getByTestId(
        KEY_MANAGEMENT_TEST_IDS.repairCreatedManagedSiteImportButton,
      ),
    )

    await waitFor(() => {
      expect(
        mockResolveRepairCreatedKeyBatchImportCandidate,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ freshness: "historical" }),
      )
    })
    expect(
      mockManagedSiteTokenBatchExportDialog.mock.calls.at(-1)?.[0],
    ).toEqual(
      expect.objectContaining({
        intent: {
          source: MANAGED_SITE_TOKEN_BATCH_IMPORT_SOURCES.REPAIR_CREATED,
          verification: MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.COMPLETE,
        },
      }),
    )
  })

  it("does not offer managed-site import without created resource refs", async () => {
    const user = userEvent.setup()
    const account = buildAccount()
    mockProgress = buildCreatedProgress(account, {
      results: [
        buildAccountResult({
          accountId: account.id,
          accountName: account.name,
          siteType: account.siteType,
          siteUrlOrigin: account.baseUrl,
        }),
      ],
    })

    render(
      <RepairMissingKeysDialog
        isOpen
        onClose={vi.fn()}
        accounts={[account]}
        startOnOpen={false}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:repairMissingKeys.previousResult.view",
      }),
    )

    expect(
      screen.queryByTestId(
        KEY_MANAGEMENT_TEST_IDS.repairCreatedManagedSiteImportButton,
      ),
    ).not.toBeInTheDocument()
  })

  it("keeps repair results mounted and shows local feedback when resolution fails", async () => {
    const user = userEvent.setup()
    const account = buildAccount()
    mockProgress = buildRepairProgress(ACCOUNT_KEY_REPAIR_JOB_STATES.Running, {
      jobId: "repair-job",
    })
    mockResolveRepairCreatedKeyBatchImportCandidate.mockRejectedValue(
      new Error("inventory unavailable"),
    )

    const view = render(
      <RepairMissingKeysDialog
        isOpen
        onClose={vi.fn()}
        accounts={[account]}
        startOnOpen={false}
      />,
    )
    await screen.findByRole("progressbar", {
      name: "keyManagement:repairMissingKeys.progressLabel",
    })
    mockProgress = buildCreatedProgress(account)
    view.rerender(
      <RepairMissingKeysDialog
        isOpen
        onClose={vi.fn()}
        accounts={[account]}
        startOnOpen={false}
      />,
    )

    await user.click(
      await screen.findByTestId(
        KEY_MANAGEMENT_TEST_IDS.repairCreatedManagedSiteImportButton,
      ),
    )

    expect(
      await screen.findByText(
        "keyManagement:repairMissingKeys.managedSiteImport.failed",
      ),
    ).toBeVisible()
    expect(
      screen.getByTestId(
        KEY_MANAGEMENT_TEST_IDS.repairCreatedManagedSiteImportCard,
      ),
    ).toBeVisible()
    expect(screen.getByText("Account 1")).toBeInTheDocument()
    expect(
      mockManagedSiteTokenBatchExportDialog.mock.calls.at(-1)?.[0],
    ).toEqual(expect.objectContaining({ isOpen: false }))
  })

  it("shows a completed notice when the current target has no pending repaired keys", async () => {
    const user = userEvent.setup()
    const account = buildAccount()
    mockProgress = buildRepairProgress(ACCOUNT_KEY_REPAIR_JOB_STATES.Running, {
      jobId: "repair-job",
    })

    const view = render(
      <RepairMissingKeysDialog
        isOpen
        onClose={vi.fn()}
        accounts={[account]}
        startOnOpen={false}
      />,
    )
    await screen.findByRole("progressbar", {
      name: "keyManagement:repairMissingKeys.progressLabel",
    })

    mockProgress = buildCreatedProgress(account, {
      managedSiteImportReceipts: [
        {
          targetFingerprint: "a".repeat(64),
          resourceRef: {
            accountId: account.id,
            siteType: account.siteType,
            scopeKey: "account",
            resourceId: "11",
          },
          status: ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.Created,
          updatedAt: 1,
        },
      ],
    })
    view.rerender(
      <RepairMissingKeysDialog
        isOpen
        onClose={vi.fn()}
        accounts={[account]}
        startOnOpen={false}
      />,
    )

    await user.click(
      await screen.findByTestId(
        KEY_MANAGEMENT_TEST_IDS.repairCreatedManagedSiteImportButton,
      ),
    )

    expect(
      await screen.findByText(
        "keyManagement:repairMissingKeys.managedSiteImport.nothingPending",
      ),
    ).toBeVisible()
    expect(
      screen.queryByText(
        "keyManagement:repairMissingKeys.managedSiteImport.unavailable",
      ),
    ).not.toBeInTheDocument()

    mockResolveRepairCreatedKeyBatchImportCandidate.mockResolvedValueOnce(
      buildRepairImportCandidate(
        account,
        MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.COMPLETE,
      ),
    )
    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.managedSiteImport.useRegularImport",
      }),
    )

    await waitFor(() => {
      expect(
        mockResolveRepairCreatedKeyBatchImportCandidate,
      ).toHaveBeenLastCalledWith(
        expect.objectContaining({
          includeCompletedReferences: true,
          forceCompleteVerification: true,
        }),
      )
    })
    expect(
      mockManagedSiteTokenBatchExportDialog.mock.calls.at(-1)?.[0],
    ).toEqual(
      expect.objectContaining({
        isOpen: true,
        intent: {
          source: MANAGED_SITE_TOKEN_BATCH_IMPORT_SOURCES.REPAIR_CREATED,
          verification: MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS.COMPLETE,
        },
      }),
    )
  })

  it("clears target-specific feedback when the managed site type changes", async () => {
    const user = userEvent.setup()
    const account = buildAccount()
    mockProgress = buildRepairProgress(ACCOUNT_KEY_REPAIR_JOB_STATES.Running, {
      jobId: "repair-job",
    })

    const view = render(
      <RepairMissingKeysDialog
        isOpen
        onClose={vi.fn()}
        accounts={[account]}
        startOnOpen={false}
      />,
    )
    await screen.findByRole("progressbar", {
      name: "keyManagement:repairMissingKeys.progressLabel",
    })

    mockProgress = buildCreatedProgress(account, {
      managedSiteImportReceipts: [
        {
          targetFingerprint: "a".repeat(64),
          resourceRef: {
            accountId: account.id,
            siteType: account.siteType,
            scopeKey: "account",
            resourceId: "11",
          },
          status: ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.Created,
          updatedAt: 1,
        },
      ],
    })
    view.rerender(
      <RepairMissingKeysDialog
        isOpen
        onClose={vi.fn()}
        accounts={[account]}
        startOnOpen={false}
      />,
    )

    await user.click(
      await screen.findByTestId(
        KEY_MANAGEMENT_TEST_IDS.repairCreatedManagedSiteImportButton,
      ),
    )
    await screen.findByText(
      "keyManagement:repairMissingKeys.managedSiteImport.nothingPending",
    )

    await user.click(
      screen.getByRole("combobox", {
        name: "keyManagement:repairMissingKeys.managedSiteImport.changeTarget",
      }),
    )
    await user.click(
      await screen.findByRole("option", {
        name: "settings:managedSite.doneHub",
      }),
    )

    await waitFor(() => {
      expect(
        screen.getByRole("combobox", {
          name: "keyManagement:repairMissingKeys.managedSiteImport.changeTarget",
        }),
      ).toHaveTextContent("settings:managedSite.doneHub")
    })

    await waitFor(() => {
      expect(
        screen.queryByText(
          "keyManagement:repairMissingKeys.managedSiteImport.nothingPending",
        ),
      ).not.toBeInTheDocument()
    })

    mockGetCurrentManagedSiteRuntimeConfig.mockResolvedValueOnce({
      siteType: SITE_TYPES.DONE_HUB,
      config: {
        baseUrl: "https://done-hub.example.invalid",
        adminToken: "done-hub-token",
        userId: "2",
      },
    })
    mockCreateManagedSiteTokenBatchImportTarget.mockResolvedValueOnce({
      targetFingerprint: "b".repeat(64),
      targetSummary: {
        siteType: SITE_TYPES.DONE_HUB,
        baseUrl: "https://done-hub.example.invalid",
        compatibleUserId: "2",
      },
    })

    await user.click(
      screen.getByTestId(
        KEY_MANAGEMENT_TEST_IDS.repairCreatedManagedSiteImportButton,
      ),
    )

    await waitFor(() => {
      expect(mockGetCurrentManagedSiteRuntimeConfig).toHaveBeenCalledTimes(2)
    })
    expect(
      mockCreateManagedSiteTokenBatchImportTarget,
    ).toHaveBeenLastCalledWith(
      expect.objectContaining({ siteType: SITE_TYPES.DONE_HUB }),
    )
  })

  it("opens missing managed-site configuration in a new tab and detects it on retry", async () => {
    const user = userEvent.setup()
    const account = buildAccount()
    mockProgress = buildRepairProgress(ACCOUNT_KEY_REPAIR_JOB_STATES.Running, {
      jobId: "repair-job",
    })
    mockGetCurrentManagedSiteRuntimeConfig.mockResolvedValueOnce(null)

    const view = render(
      <RepairMissingKeysDialog
        isOpen
        onClose={vi.fn()}
        accounts={[account]}
        startOnOpen={false}
      />,
    )
    await screen.findByRole("progressbar", {
      name: "keyManagement:repairMissingKeys.progressLabel",
    })
    mockProgress = buildCreatedProgress(account)
    view.rerender(
      <RepairMissingKeysDialog
        isOpen
        onClose={vi.fn()}
        accounts={[account]}
        startOnOpen={false}
      />,
    )

    await user.click(
      await screen.findByTestId(
        KEY_MANAGEMENT_TEST_IDS.repairCreatedManagedSiteImportButton,
      ),
    )
    expect(
      await screen.findByText(
        "keyManagement:repairMissingKeys.managedSiteImport.configMissing",
      ),
    ).toBeVisible()

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:repairMissingKeys.managedSiteImport.openConfiguration",
      }),
    )
    expect(mockOpenSettingsTabInNewTab).toHaveBeenCalledWith("managedSite", {
      anchor: SETTINGS_ANCHORS.MANAGED_SITE_SELECTOR,
    })

    mockGetCurrentManagedSiteRuntimeConfig.mockResolvedValueOnce({
      siteType: SITE_TYPES.NEW_API,
      config: {
        baseUrl: "https://target.example.invalid",
        adminToken: "target-token",
        userId: "1",
      },
    })
    mockResolveRepairCreatedKeyBatchImportCandidate.mockResolvedValueOnce(
      buildRepairImportCandidate(account),
    )
    await user.click(
      screen.getByTestId(
        KEY_MANAGEMENT_TEST_IDS.repairCreatedManagedSiteImportButton,
      ),
    )

    expect(mockGetCurrentManagedSiteRuntimeConfig).toHaveBeenCalledTimes(2)
    expect(
      await screen.findByTestId("repair-created-batch-dialog"),
    ).toBeVisible()
  })

  it("shows manual recovery guidance when the managed-site configuration tab cannot open", async () => {
    const user = userEvent.setup()
    const account = buildAccount()
    mockProgress = buildRepairProgress(ACCOUNT_KEY_REPAIR_JOB_STATES.Running, {
      jobId: "repair-job",
    })
    mockGetCurrentManagedSiteRuntimeConfig.mockResolvedValueOnce(null)
    mockOpenSettingsTabInNewTab.mockRejectedValueOnce(
      new Error("tabs unavailable"),
    )

    const view = render(
      <RepairMissingKeysDialog
        isOpen
        onClose={vi.fn()}
        accounts={[account]}
        startOnOpen={false}
      />,
    )
    await screen.findByRole("progressbar", {
      name: "keyManagement:repairMissingKeys.progressLabel",
    })
    mockProgress = buildCreatedProgress(account)
    view.rerender(
      <RepairMissingKeysDialog
        isOpen
        onClose={vi.fn()}
        accounts={[account]}
        startOnOpen={false}
      />,
    )

    await user.click(
      await screen.findByTestId(
        KEY_MANAGEMENT_TEST_IDS.repairCreatedManagedSiteImportButton,
      ),
    )
    await user.click(
      await screen.findByRole("button", {
        name: "keyManagement:repairMissingKeys.managedSiteImport.openConfiguration",
      }),
    )

    expect(
      await screen.findByText(
        "keyManagement:repairMissingKeys.managedSiteImport.configurationOpenFailed",
      ),
    ).toBeVisible()
  })

  it("records only controlled attempted outcomes and reconciled matches", async () => {
    const user = userEvent.setup()
    const account = buildAccount()
    mockProgress = buildRepairProgress(ACCOUNT_KEY_REPAIR_JOB_STATES.Running, {
      jobId: "repair-job",
    })

    const candidate = buildRepairImportCandidate(account)
    candidate.items = [11, 12, 13, 14].map((resourceId) => ({
      kind: MANAGED_SITE_TOKEN_BATCH_EXPORT_INPUT_KINDS.RESOLVED,
      account,
      runtimeKey: buildAccountKeyResourceRuntimeKey(account, {
        ref: {
          accountId: account.id,
          siteType: account.siteType,
          scopeKey: "account",
          resourceId: String(resourceId),
        },
        label: `Created key ${resourceId}`,
        secret: `resolved-runtime-secret-${resourceId}`,
      }),
    }))
    mockResolveRepairCreatedKeyBatchImportCandidate.mockResolvedValue(candidate)

    const view = render(
      <RepairMissingKeysDialog
        isOpen
        onClose={vi.fn()}
        accounts={[account]}
        startOnOpen={false}
      />,
    )

    await screen.findByRole("progressbar", {
      name: "keyManagement:repairMissingKeys.progressLabel",
    })
    mockProgress = buildCreatedProgress(account)
    view.rerender(
      <RepairMissingKeysDialog
        isOpen
        onClose={vi.fn()}
        accounts={[account]}
        startOnOpen={false}
      />,
    )
    await user.click(
      await screen.findByTestId(
        KEY_MANAGEMENT_TEST_IDS.repairCreatedManagedSiteImportButton,
      ),
    )

    await waitFor(() => {
      expect(screen.getByTestId("repair-created-batch-dialog")).toBeVisible()
    })
    const batchDialogProps =
      mockManagedSiteTokenBatchExportDialog.mock.calls.at(-1)?.[0]

    await act(async () => {
      batchDialogProps.onCompleted?.(
        {
          totalSelected: 3,
          attemptedCount: 3,
          createdCount: 1,
          failedCount: 1,
          uncertainCount: 1,
          skippedCount: 0,
          items: [
            {
              id: candidate.items[0].runtimeKey.id,
              accountName: account.name,
              runtimeKeyName: "Created key 11",
              result: "created",
              success: true,
              skipped: false,
            },
            {
              id: candidate.items[1].runtimeKey.id,
              accountName: account.name,
              runtimeKeyName: "Created key 12",
              result: "failed",
              success: false,
              skipped: false,
            },
            {
              id: candidate.items[2].runtimeKey.id,
              accountName: account.name,
              runtimeKeyName: "Created key 13",
              result: "uncertain",
              success: false,
              skipped: false,
            },
          ],
        },
        { alreadyPresentItemIds: [candidate.items[3].runtimeKey.id] },
      )
    })

    await waitFor(() => {
      expect(mockSendAccountKeyRepairMessage).toHaveBeenCalledWith(
        AccountKeyRepairMessageTypes.RecordManagedSiteImportResults,
        {
          jobId: "repair-job",
          targetFingerprint: "a".repeat(64),
          items: [
            {
              resourceRef: {
                accountId: account.id,
                siteType: account.siteType,
                scopeKey: "account",
                resourceId: "11",
              },
              status: ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.Created,
            },
            {
              resourceRef: {
                accountId: account.id,
                siteType: account.siteType,
                scopeKey: "account",
                resourceId: "12",
              },
              status: ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.Failed,
            },
            {
              resourceRef: {
                accountId: account.id,
                siteType: account.siteType,
                scopeKey: "account",
                resourceId: "13",
              },
              status: ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.Uncertain,
            },
            {
              resourceRef: {
                accountId: account.id,
                siteType: account.siteType,
                scopeKey: "account",
                resourceId: "14",
              },
              status:
                ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.AlreadyPresent,
            },
          ],
        },
      )
    })
    expect(mockSetProgress).toHaveBeenCalledWith(mockProgress)

    mockSendAccountKeyRepairMessage.mockRejectedValueOnce(
      new Error("receipt persistence unavailable"),
    )
    await act(async () => {
      batchDialogProps.onCompleted?.({
        totalSelected: 1,
        attemptedCount: 1,
        createdCount: 0,
        failedCount: 1,
        uncertainCount: 0,
        skippedCount: 0,
        items: [
          {
            id: candidate.items[1].runtimeKey.id,
            accountName: account.name,
            runtimeKeyName: "Created key 12",
            result: "failed",
            success: false,
            skipped: false,
          },
        ],
      })
    })
    await waitFor(() => {
      expect(mockSendAccountKeyRepairMessage).toHaveBeenCalledTimes(2)
    })
    await user.click(
      screen.getByRole("button", { name: "Close repair import" }),
    )
    expect(
      await screen.findByText(
        "keyManagement:repairMissingKeys.managedSiteImport.receiptFailed",
      ),
    ).toBeVisible()
  })
})
