import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { RepairMissingKeysDialog } from "~/features/KeyManagement/components/RepairMissingKeysDialog"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import { AccountKeyRepairMessageTypes } from "~/services/accounts/accountKeyAutoProvisioning/messaging"
import { buildDisplayAccountTokenRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import type { DisplaySiteData } from "~/types"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import {
  ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS,
  ACCOUNT_KEY_REPAIR_JOB_STATES,
  ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES,
  ACCOUNT_KEY_REPAIR_OUTCOMES,
  ACCOUNT_KEY_REPAIR_SKIP_REASONS,
  type AccountKeyRepairProgress,
} from "~/types/accountKeyAutoProvisioning"
import {
  MANAGED_SITE_TOKEN_BATCH_EXPORT_INPUT_KINDS,
  MANAGED_SITE_TOKEN_BATCH_IMPORT_SOURCES,
  MANAGED_SITE_TOKEN_BATCH_IMPORT_VERIFICATIONS,
} from "~/types/managedSiteTokenBatchExport"
import { buildCompleteTodayStatsAvailability } from "~~/tests/test-utils/accountTodayStats"
import { act, render, screen, waitFor } from "~~/tests/test-utils/render"
import { createToken } from "~~/tests/utils/keyManagementFactories"

const {
  mockHandleStartAudit,
  mockUseRepairMissingKeysJob,
  mockSetProgress,
  mockResolveRepairCreatedTokenBatchImportCandidate,
  mockGetCurrentManagedSiteRuntimeConfig,
  mockCreateManagedSiteTokenBatchImportTarget,
  mockSendAccountKeyRepairMessage,
  mockManagedSiteTokenBatchExportDialog,
} = vi.hoisted(() => ({
  mockHandleStartAudit: vi.fn(),
  mockUseRepairMissingKeysJob: vi.fn(),
  mockSetProgress: vi.fn(),
  mockResolveRepairCreatedTokenBatchImportCandidate: vi.fn(),
  mockGetCurrentManagedSiteRuntimeConfig: vi.fn(),
  mockCreateManagedSiteTokenBatchImportTarget: vi.fn(),
  mockSendAccountKeyRepairMessage: vi.fn(),
  mockManagedSiteTokenBatchExportDialog: vi.fn(),
}))
let mockProgress: AccountKeyRepairProgress
let mockIsStarting = false

function buildRepairProgress(
  state: AccountKeyRepairProgress["state"] = ACCOUNT_KEY_REPAIR_JOB_STATES.Idle,
  overrides: Partial<AccountKeyRepairProgress> = {},
): AccountKeyRepairProgress {
  return {
    jobId: state,
    state,
    totals: {
      enabledAccounts: 0,
      eligibleAccounts: 0,
      processedAccounts: 0,
    },
    summary: {
      created: 0,
      alreadyHad: 0,
      skipped: 0,
      failed: 0,
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
        handleCancelAudit: vi.fn(),
        handleStartAudit: mockHandleStartAudit,
        isCancelling: false,
        isStarting: mockIsStarting,
        progress: mockProgress,
        setProgress: mockSetProgress,
      }
    },
  }),
)

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

vi.mock("~/services/managedSites/repairCreatedTokenBatchImport", async () => {
  const actual = await vi.importActual<
    typeof import("~/services/managedSites/repairCreatedTokenBatchImport")
  >("~/services/managedSites/repairCreatedTokenBatchImport")
  return {
    ...actual,
    resolveRepairCreatedTokenBatchImportCandidate:
      mockResolveRepairCreatedTokenBatchImportCandidate,
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
    checkIn: { enableDetection: false },
  }
}

function buildCreatedProgress(
  account: DisplaySiteData,
  overrides: Partial<AccountKeyRepairProgress> = {},
): AccountKeyRepairProgress {
  return buildRepairProgress(ACCOUNT_KEY_REPAIR_JOB_STATES.Completed, {
    jobId: "repair-job",
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
      createdKeys: 1,
    },
    results: [
      {
        accountId: account.id,
        accountName: account.name,
        siteType: account.siteType,
        siteUrlOrigin: account.baseUrl,
        outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Created,
        createdGroups: ["alpha"],
        createdTokens: [{ tokenId: 11, group: "alpha" }],
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
  return {
    items: [
      {
        kind: MANAGED_SITE_TOKEN_BATCH_EXPORT_INPUT_KINDS.RESOLVED,
        account,
        runtimeKey: buildDisplayAccountTokenRuntimeKey(
          account,
          createToken({
            id: 11,
            name: "Created alpha key",
            group: "alpha",
            accountId: account.id,
            accountName: account.name,
          }),
        ),
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
    mockResolveRepairCreatedTokenBatchImportCandidate.mockResolvedValue(null)
    mockSendAccountKeyRepairMessage.mockImplementation(async () => ({
      success: true,
      data: mockProgress,
    }))
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
          {
            accountId: "account-1",
            accountName: "Account 1",
            siteType: SITE_TYPES.SUB2API,
            siteUrlOrigin: "https://sub2api.example.invalid",
            outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped,
            skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.Sub2Api,
            invalidTokens: [
              {
                accountId: "account-1",
                accountName: "Account 1",
                siteType: SITE_TYPES.SUB2API,
                siteUrlOrigin: "https://sub2api.example.invalid",
                tokenId: 1,
                tokenName: "Invalid token",
                group: "removed",
                reason:
                  ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS.GroupUnavailable,
              },
            ],
            finishedAt: 1,
          },
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
          {
            accountId: "aihubmix-1",
            accountName: "AIHubMix",
            siteType: SITE_TYPES.AIHUBMIX,
            siteUrlOrigin: "https://aihubmix.example.invalid",
            outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped,
            skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.AihubmixOneTimeKey,
            finishedAt: 1,
          },
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
        results: [
          {
            accountId: "account-1",
            accountName: "Account 1",
            siteType: SITE_TYPES.SUB2API,
            siteUrlOrigin: "https://sub2api.example.invalid",
            outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped,
            skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.Sub2Api,
            invalidTokens: [
              {
                accountId: "account-1",
                accountName: "Account 1",
                siteType: SITE_TYPES.SUB2API,
                siteUrlOrigin: "https://sub2api.example.invalid",
                tokenId: 1,
                tokenName: "Invalid token",
                group: "removed",
                reason:
                  ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS.GroupUnavailable,
              },
            ],
            finishedAt: 1,
          },
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
      screen.getByRole("progressbar", {
        name: "keyManagement:repairMissingKeys.progressLabel",
      }),
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
    expect(
      screen.queryByTestId("repair-missing-keys-progress-actions"),
    ).not.toHaveTextContent(
      "keyManagement:repairMissingKeys.previousResult.backToSetup",
    )

    await user.click(
      screen.getByRole("button", {
        name: /keyManagement:repairMissingKeys\.views\.invalidKeys/,
      }),
    )

    expect(screen.getByText("Invalid token")).toBeInTheDocument()
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

  it("resolves current-session created keys lazily and opens the shared trusted review", async () => {
    const user = userEvent.setup()
    const account = buildAccount()
    mockProgress = buildRepairProgress(ACCOUNT_KEY_REPAIR_JOB_STATES.Running, {
      jobId: "repair-job",
    })
    mockResolveRepairCreatedTokenBatchImportCandidate.mockResolvedValue(
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
      mockResolveRepairCreatedTokenBatchImportCandidate,
    ).not.toHaveBeenCalled()

    await user.click(openButton)

    await waitFor(() => {
      expect(
        mockResolveRepairCreatedTokenBatchImportCandidate,
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
    mockResolveRepairCreatedTokenBatchImportCandidate.mockResolvedValue(
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
        mockResolveRepairCreatedTokenBatchImportCandidate,
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

  it("does not offer managed-site import for legacy results without exact references", async () => {
    const user = userEvent.setup()
    const account = buildAccount()
    mockProgress = buildCreatedProgress(account, {
      results: [
        {
          accountId: account.id,
          accountName: account.name,
          siteType: account.siteType,
          siteUrlOrigin: account.baseUrl,
          outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Created,
          createdGroups: ["alpha"],
          finishedAt: 1,
        },
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
    mockResolveRepairCreatedTokenBatchImportCandidate.mockRejectedValue(
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
          accountId: account.id,
          tokenId: 11,
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
  })

  it("records only controlled attempted outcomes and reconciled matches", async () => {
    const user = userEvent.setup()
    const account = buildAccount()
    const onManagedSiteImportSuccess = vi.fn()
    mockProgress = buildRepairProgress(ACCOUNT_KEY_REPAIR_JOB_STATES.Running, {
      jobId: "repair-job",
    })

    const candidate = buildRepairImportCandidate(account)
    candidate.items = [11, 12, 13, 14].map((tokenId) => ({
      kind: MANAGED_SITE_TOKEN_BATCH_EXPORT_INPUT_KINDS.RESOLVED,
      account,
      runtimeKey: buildDisplayAccountTokenRuntimeKey(
        account,
        createToken({
          id: tokenId,
          name: `Created key ${tokenId}`,
          group: `group-${tokenId}`,
          accountId: account.id,
          accountName: account.name,
        }),
      ),
    }))
    mockResolveRepairCreatedTokenBatchImportCandidate.mockResolvedValue(
      candidate,
    )

    const view = render(
      <RepairMissingKeysDialog
        isOpen
        onClose={vi.fn()}
        accounts={[account]}
        startOnOpen={false}
        onManagedSiteImportSuccess={onManagedSiteImportSuccess}
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
        onManagedSiteImportSuccess={onManagedSiteImportSuccess}
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
              accountId: account.id,
              tokenId: 11,
              status: ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.Created,
            },
            {
              accountId: account.id,
              tokenId: 12,
              status: ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.Failed,
            },
            {
              accountId: account.id,
              tokenId: 13,
              status: ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.Uncertain,
            },
            {
              accountId: account.id,
              tokenId: 14,
              status:
                ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.AlreadyPresent,
            },
          ],
        },
      )
    })
    expect(onManagedSiteImportSuccess).toHaveBeenCalledTimes(1)
    expect(onManagedSiteImportSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ id: 11, accountId: account.id }),
    )
    expect(mockSetProgress).toHaveBeenCalledWith(mockProgress)
  })
})
