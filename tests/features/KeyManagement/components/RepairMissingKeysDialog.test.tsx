import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { RepairMissingKeysDialog } from "~/features/KeyManagement/components/RepairMissingKeysDialog"
import type { DisplaySiteData } from "~/types"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import {
  ACCOUNT_KEY_REPAIR_JOB_STATES,
  type AccountKeyRepairProgress,
} from "~/types/accountKeyAutoProvisioning"
import { render, screen } from "~~/tests/test-utils/render"

const mockHandleStartAudit = vi.fn()
const mockUseRepairMissingKeysJob = vi.fn()
let mockProgress: AccountKeyRepairProgress
let mockIsStarting = false

function buildRepairProgress(
  state: AccountKeyRepairProgress["state"] = ACCOUNT_KEY_REPAIR_JOB_STATES.Idle,
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
  }
}

vi.mock("~/features/KeyManagement/components/useRepairMissingKeysJob", () => ({
  useRepairMissingKeysJob: (options: unknown) => {
    mockUseRepairMissingKeysJob(options)
    return {
      error: "",
      handleCancelAudit: vi.fn(),
      handleStartAudit: mockHandleStartAudit,
      isCancelling: false,
      isStarting: mockIsStarting,
      progress: mockProgress,
      setProgress: vi.fn(),
    }
  },
}))

function buildAccount(): DisplaySiteData {
  return {
    id: "account-1",
    name: "Account 1",
    username: "user@example.invalid",
    balance: { USD: 0, CNY: 0 },
    todayConsumption: { USD: 0, CNY: 0 },
    todayIncome: { USD: 0, CNY: 0 },
    todayTokens: { upload: 0, download: 0 },
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

describe("RepairMissingKeysDialog", () => {
  beforeEach(() => {
    mockHandleStartAudit.mockReset()
    mockUseRepairMissingKeysJob.mockReset()
    mockIsStarting = false
    mockProgress = buildRepairProgress()
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
    mockProgress = buildRepairProgress(ACCOUNT_KEY_REPAIR_JOB_STATES.Completed)

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

  it("shows historical result details as read-only and can return to check setup", async () => {
    const user = userEvent.setup()
    mockProgress = buildRepairProgress(ACCOUNT_KEY_REPAIR_JOB_STATES.Completed)

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
      screen.queryByTestId("repair-missing-keys-progress-actions"),
    ).not.toHaveTextContent(
      "keyManagement:repairMissingKeys.previousResult.backToSetup",
    )

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
})
