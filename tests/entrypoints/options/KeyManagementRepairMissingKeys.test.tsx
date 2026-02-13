import { describe, expect, it, vi } from "vitest"

import {
  RuntimeActionIds,
  RuntimeMessageTypes,
} from "~/constants/runtimeActions"
import KeyManagement from "~/entrypoints/options/pages/KeyManagement"
import commonEn from "~/locales/en/common.json"
import keyManagementEn from "~/locales/en/keyManagement.json"
import { testI18n } from "~/tests/test-utils/i18n"
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "~/tests/test-utils/render"
import type { AccountKeyRepairProgress } from "~/types/accountKeyAutoProvisioning"

testI18n.addResourceBundle("en", "keyManagement", keyManagementEn, true, true)
testI18n.addResourceBundle("en", "common", commonEn, true, true)

const { sendRuntimeActionMessageMock, runtimeMessageState } = vi.hoisted(
  () => ({
    sendRuntimeActionMessageMock: vi.fn(),
    runtimeMessageState: {
      listener: undefined as ((message: any) => void) | undefined,
    },
  }),
)

vi.mock("~/utils/browserApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/browserApi")>()
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
  "~/entrypoints/options/pages/KeyManagement/hooks/useKeyManagement",
  () => ({
    useKeyManagement: vi.fn(() => ({
      displayData: [
        { id: "account-enabled", name: "Enabled Site", disabled: false },
        { id: "account-disabled", name: "Disabled Site", disabled: true },
        { id: "account-enabled-2", name: "Another Site", disabled: false },
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
      loadTokens: vi.fn(),
      filteredTokens: [],
      copyKey: vi.fn(),
      toggleKeyVisibility: vi.fn(),
      handleAddToken: vi.fn(),
      handleCloseAddToken: vi.fn(),
      handleEditToken: vi.fn(),
      handleDeleteToken: vi.fn(),
    })),
  }),
)

vi.mock(
  "~/entrypoints/options/pages/KeyManagement/components/Controls",
  () => ({
    Controls: () => <div data-testid="controls" />,
  }),
)

vi.mock(
  "~/entrypoints/options/pages/KeyManagement/components/TokenList",
  () => ({
    TokenList: () => <div data-testid="token-list" />,
  }),
)

vi.mock("~/entrypoints/options/pages/KeyManagement/components/Footer", () => ({
  Footer: () => <div data-testid="footer" />,
}))

vi.mock(
  "~/entrypoints/options/pages/KeyManagement/components/AddTokenDialog",
  () => ({
    default: () => null,
  }),
)

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

describe("KeyManagement repair missing keys entry point", () => {
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
      name: keyManagementEn.repairMissingKeys.action,
    })
    fireEvent.click(repairButton)

    expect(
      screen.getByText(keyManagementEn.repairMissingKeys.description),
    ).toBeInTheDocument()

    await waitFor(() => {
      expect(sendRuntimeActionMessageMock).toHaveBeenCalledWith({
        action: RuntimeActionIds.AccountKeyRepairStart,
      })
    })

    expect(runtimeMessageState.listener).toBeTypeOf("function")

    // Disabled accounts must not be shown in the dialog/results.
    expect(screen.queryByText("Disabled Site")).not.toBeInTheDocument()
    expect(screen.getByText("Enabled Site")).toBeInTheDocument()

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
        name: keyManagementEn.repairMissingKeys.action,
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
      name: keyManagementEn.repairMissingKeys.progressLabel,
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
        name: keyManagementEn.repairMissingKeys.action,
      }),
    )

    await waitFor(() => {
      expect(sendRuntimeActionMessageMock).toHaveBeenCalledWith({
        action: RuntimeActionIds.AccountKeyRepairStart,
      })
    })

    expect(screen.getByText("Enabled Site")).toBeInTheDocument()
    expect(screen.getByText("Another Site")).toBeInTheDocument()

    const searchInput = screen.getByPlaceholderText(
      keyManagementEn.repairMissingKeys.searchPlaceholder,
    )

    fireEvent.change(searchInput, { target: { value: "Another" } })

    expect(screen.queryByText("Enabled Site")).not.toBeInTheDocument()
    expect(screen.getByText("Another Site")).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", { name: commonEn.actions.clear }),
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: new RegExp(keyManagementEn.repairMissingKeys.outcomes.failed),
      }),
    )

    expect(screen.queryByText("Enabled Site")).not.toBeInTheDocument()
    expect(screen.getByText("Another Site")).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: new RegExp(keyManagementEn.repairMissingKeys.outcomes.created),
      }),
    )

    expect(screen.getByText("Enabled Site")).toBeInTheDocument()
    expect(screen.queryByText("Another Site")).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(commonEn.total) }),
    )

    expect(screen.getByText("Enabled Site")).toBeInTheDocument()
    expect(screen.getByText("Another Site")).toBeInTheDocument()
  })
})
