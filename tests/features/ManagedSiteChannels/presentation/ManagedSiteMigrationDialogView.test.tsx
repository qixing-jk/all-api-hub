import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type {
  ManagedSiteMigrationCallbacks,
  ManagedSiteMigrationComparison,
  ManagedSiteMigrationLabels,
} from "~/features/ManagedSiteChannels/presentation/contracts"
import { ManagedSiteMigrationDialogView } from "~/features/ManagedSiteChannels/presentation/ManagedSiteMigrationDialogView"
import { MANAGED_SITE_CHANNELS_TEST_IDS } from "~/features/ManagedSiteChannels/testIds"

const labels: ManagedSiteMigrationLabels = {
  title: "Migrate channels",
  beta: "Beta",
  description: "Review destination changes",
  targetLabel: "Target site",
  targetPlaceholder: "Select target",
  sourceLabel: "Source",
  destinationLabel: "Destination",
  unselectedTarget: "Not selected",
  refreshPreview: "Refresh preview",
  loadingPreview: "Loading preview",
  generalWarningsTitle: "Migration limits",
  generalWarningsSummary: "Review the limits",
  limitsLabel: "limits",
  warningsLabel: "warnings",
  ready: "Ready",
  blocked: "Blocked",
  fieldLabel: "Field",
  resultsTitle: "Migration result",
  close: "Close",
  cancel: "Cancel",
  start: "Start migration",
  running: "Running",
  footerSummary: "1 ready, 1 blocked",
  confirmationTitle: "Confirm migration",
  confirmationDescription: "Ready channels will be created",
  confirmationWarningTitle: "Create only",
  confirmationConfirm: "Confirm migration",
  missingValue: "-",
  refreshRequired: "Refresh the channel list before closing.",
  refreshRequiredAction: "Refresh channels",
}

const comparisons = [
  ["baseUrl", "Base URL"],
  ["type", "Type"],
  ["models", "Models"],
  ["groups", "Groups"],
  ["priority", "Priority"],
  ["weight", "Weight"],
  ["status", "Status"],
].map(([id, label]) => ({
  id: id as
    | "baseUrl"
    | "type"
    | "models"
    | "groups"
    | "priority"
    | "weight"
    | "status",
  label,
  source: id === "baseUrl" ? "https://source.example.invalid" : "Source",
  target: id === "baseUrl" ? "https://target.example.invalid" : "Target",
  status: "changed" as const,
})) as [
  ManagedSiteMigrationComparison,
  ManagedSiteMigrationComparison,
  ManagedSiteMigrationComparison,
  ManagedSiteMigrationComparison,
  ManagedSiteMigrationComparison,
  ManagedSiteMigrationComparison,
  ManagedSiteMigrationComparison,
]

const createCallbacks = (
  overrides: Partial<ManagedSiteMigrationCallbacks> = {},
): ManagedSiteMigrationCallbacks => ({
  onTargetChange: vi.fn(),
  onRefreshPreview: vi.fn(),
  onRecoverRefreshRequired: vi.fn(),
  onConfirm: vi.fn(),
  onClose: vi.fn(),
  onOpenConfirmation: vi.fn(),
  onCloseConfirmation: vi.fn(),
  ...overrides,
})

describe("ManagedSiteMigrationDialogView", () => {
  it("uses responsive migration footer layouts for preview and result", () => {
    const props = {
      isOpen: true,
      selectedTarget: "target",
      targets: [{ value: "target", label: "Target example" }],
      preview: {
        sourceLabel: "Source example",
        targetLabel: "Target example",
        isLoading: false,
        isManualLoading: false,
        error: null,
        readyCount: 1,
        blockedCount: 0,
        totalCount: 1,
        generalWarnings: [],
        rows: [],
      },
      labels,
      callbacks: createCallbacks(),
      isConfirmationOpen: false,
    }
    const { rerender } = render(<ManagedSiteMigrationDialogView {...props} />)

    expect(screen.getByText(labels.footerSummary).parentElement).toHaveClass(
      "flex",
      "flex-col",
      "items-stretch",
      "gap-3",
      "sm:flex-row",
      "sm:items-center",
      "sm:justify-between",
    )
    expect(
      screen.getByRole("button", { name: labels.start }).parentElement,
    ).toHaveClass("flex", "w-full", "justify-end", "gap-2", "sm:w-auto")

    rerender(
      <ManagedSiteMigrationDialogView
        {...props}
        preview={null}
        result={{ summary: "1 created", items: [] }}
      />,
    )

    expect(screen.getByText(labels.footerSummary).parentElement).toHaveClass(
      "flex",
      "flex-col",
      "items-stretch",
      "gap-3",
      "sm:flex-row",
      "sm:items-center",
      "sm:justify-between",
    )
    expect(
      screen.getByRole("button", { name: labels.close }).parentElement,
    ).toHaveClass("flex", "w-full", "justify-end", "gap-2", "sm:w-auto")
  })

  it("renders seven ordered comparisons and uses controlled confirmation", async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onOpenConfirmation = vi.fn()
    const callbacks = createCallbacks({ onConfirm, onOpenConfirmation })
    const props = {
      isOpen: true,
      selectedTarget: "target",
      targets: [{ value: "target", label: "Target example" }],
      preview: {
        sourceLabel: "Source example",
        targetLabel: "Target example",
        isLoading: false,
        isManualLoading: false,
        error: null,
        readyCount: 1,
        blockedCount: 1,
        totalCount: 2,
        generalWarnings: ["Create only", "No rollback"],
        rows: [
          {
            rowKey: "opaque:blocked",
            displayIdentifier: "101",
            name: "Example blocked",
            baseURL: "https://source.example.invalid",
            status: "blocked" as const,
            comparisons,
            warningText: ["Advanced settings are omitted"],
            blockedReason: "Secret unavailable",
            blockedMessage: "Load the source secret and refresh.",
          },
          {
            rowKey: "opaque:ready",
            displayIdentifier: "202",
            name: "Example ready",
            baseURL: "https://ready.example.invalid",
            status: "ready" as const,
            comparisons,
            warningText: [],
          },
        ],
      },
      labels,
      callbacks,
      isConfirmationOpen: false,
    }
    const { rerender } = render(<ManagedSiteMigrationDialogView {...props} />)

    expect(
      screen.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.migrationControls),
    ).toBeVisible()
    expect(
      screen.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.migrationComparison),
    ).toBeVisible()
    const blockedSection = screen
      .getByText("Example blocked")
      .closest("section")
    const comparisonLabels = within(blockedSection ?? document.body)
      .getAllByText(/Base URL|Type|Models|Groups|Priority|Weight|Status/)
      .map((element) => element.textContent)
    expect(comparisonLabels).toEqual([
      "Base URL",
      "Type",
      "Models",
      "Groups",
      "Priority",
      "Weight",
      "Status",
    ])
    expect(screen.getByText("Secret unavailable")).toBeVisible()
    expect(
      screen.getByText("Migration limits").closest(".rounded-md"),
    ).toHaveClass(
      "dark:border-amber-900/40",
      "dark:bg-amber-950/30",
      "dark:text-amber-200",
    )
    expect(
      screen.getByText("Secret unavailable").closest(".rounded-md"),
    ).toHaveClass(
      "dark:border-amber-900/40",
      "dark:bg-amber-950/30",
      "dark:text-amber-200",
    )
    expect(
      screen.getAllByText("https://source.example.invalid").length,
    ).toBeGreaterThan(0)
    expect(screen.queryByText("opaque:blocked")).toBeNull()

    await user.click(screen.getByRole("button", { name: "Start migration" }))
    expect(onOpenConfirmation).toHaveBeenCalledTimes(1)
    expect(
      screen.queryByRole("dialog", { name: "Confirm migration" }),
    ).toBeNull()

    rerender(<ManagedSiteMigrationDialogView {...props} isConfirmationOpen />)
    await user.click(
      within(
        screen.getByRole("dialog", { name: "Confirm migration" }),
      ).getByRole("button", {
        name: "Confirm migration",
      }),
    )
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it("renders partial results and guards close while refresh is required", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onRecoverRefreshRequired = vi.fn()
    render(
      <ManagedSiteMigrationDialogView
        isOpen
        selectedTarget="target"
        targets={[{ value: "target", label: "Target example" }]}
        preview={null}
        result={{
          summary: "1 created, 1 failed",
          items: [
            {
              rowKey: "opaque:ok",
              displayIdentifier: "101",
              name: "Example ok",
              status: "success",
              statusLabel: "Success",
            },
            {
              rowKey: "opaque:failed",
              displayIdentifier: "202",
              name: "Example failed",
              status: "failed",
              statusLabel: "Failed",
              message: "Rejected",
            },
          ],
        }}
        labels={{ ...labels, footerSummary: "1 created, 1 failed" }}
        isConfirmationOpen={false}
        refreshRequired
        callbacks={createCallbacks({ onClose, onRecoverRefreshRequired })}
      />,
    )

    expect(screen.getAllByText("1 created, 1 failed").length).toBeGreaterThan(0)
    expect(screen.getByText("Rejected")).toBeVisible()
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled()
    expect(
      screen.getByText("Refresh the channel list before closing."),
    ).toBeVisible()
    expect(
      screen.getByText("Migration result").closest(".rounded-md"),
    ).toHaveClass(
      "dark:border-blue-900/40",
      "dark:bg-blue-950/30",
      "dark:text-blue-200",
    )

    await user.click(screen.getByRole("button", { name: "Refresh channels" }))
    expect(onRecoverRefreshRequired).toHaveBeenCalledTimes(1)
  })

  it("honors refresh-required and no-replay controls carried by the result", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onRecoverRefreshRequired = vi.fn()
    render(
      <ManagedSiteMigrationDialogView
        isOpen
        selectedTarget="target"
        targets={[{ value: "target", label: "Target example" }]}
        preview={null}
        result={{
          summary: "1 uncertain",
          refreshRequired: true,
          canReplay: false,
          items: [
            {
              rowKey: "opaque:uncertain",
              displayIdentifier: "opaque:uncertain",
              name: "Uncertain example",
              status: "uncertain",
              statusLabel: "Uncertain",
              message: "Verify the target and refresh before continuing.",
            },
          ],
        }}
        labels={{ ...labels, footerSummary: "1 uncertain" }}
        isConfirmationOpen={false}
        callbacks={createCallbacks({ onClose, onRecoverRefreshRequired })}
      />,
    )

    expect(
      screen.queryByRole("button", { name: "Start migration" }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled()

    await user.click(screen.getByRole("button", { name: "Refresh channels" }))
    expect(onRecoverRefreshRequired).toHaveBeenCalledOnce()
  })

  it("keeps normal failed and skipped results closable", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <ManagedSiteMigrationDialogView
        isOpen
        selectedTarget="target"
        targets={[{ value: "target", label: "Target example" }]}
        preview={null}
        result={{
          summary: "1 failed, 1 skipped",
          refreshRequired: false,
          canReplay: false,
          items: [
            {
              rowKey: "opaque:failed",
              displayIdentifier: "opaque:failed",
              name: "Failed example",
              status: "failed",
              statusLabel: "Failed",
            },
            {
              rowKey: "opaque:skipped",
              displayIdentifier: "opaque:skipped",
              name: "Skipped example",
              status: "skipped",
              statusLabel: "Skipped",
            },
          ],
        }}
        labels={{ ...labels, footerSummary: "1 failed, 1 skipped" }}
        isConfirmationOpen={false}
        callbacks={createCallbacks({ onClose })}
      />,
    )

    const close = screen.getByRole("button", { name: "Close" })
    expect(close).toBeEnabled()
    await user.click(close)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("preserves the migration error dark-theme panel contract", () => {
    render(
      <ManagedSiteMigrationDialogView
        isOpen
        selectedTarget="target"
        targets={[{ value: "target", label: "Target example" }]}
        preview={{
          sourceLabel: "Source example",
          targetLabel: "Target example",
          isLoading: false,
          isManualLoading: false,
          error: "Preview failed",
          readyCount: 0,
          blockedCount: 0,
          totalCount: 0,
          generalWarnings: [],
          rows: [],
        }}
        labels={labels}
        isConfirmationOpen={false}
        callbacks={createCallbacks()}
      />,
    )

    expect(
      screen.getByText("Preview failed").closest(".rounded-md"),
    ).toHaveClass(
      "dark:border-red-900/40",
      "dark:bg-red-950/30",
      "dark:text-red-300",
    )
  })
})
