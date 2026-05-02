import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { NEW_API } from "~/constants/siteType"
import { ManagedSiteTokenBatchExportDialog } from "~/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog"
import {
  MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES,
  type ManagedSiteTokenBatchExportPreview,
} from "~/types/managedSiteTokenBatchExport"
import {
  buildApiToken,
  buildDisplaySiteData,
} from "~~/tests/test-utils/factories"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const { mockExecuteBatchExport, mockPreparePreview, mockToastSuccess } =
  vi.hoisted(() => ({
    mockExecuteBatchExport: vi.fn(),
    mockPreparePreview: vi.fn(),
    mockToastSuccess: vi.fn(),
  }))

vi.mock("~/services/managedSites/tokenBatchExport", () => ({
  prepareManagedSiteTokenBatchExportPreview: mockPreparePreview,
  executeManagedSiteTokenBatchExport: mockExecuteBatchExport,
}))

vi.mock("react-hot-toast", () => ({
  default: {
    success: mockToastSuccess,
  },
}))

vi.mock("~/components/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/components/ui")>()

  return {
    ...actual,
    Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
    Button: ({
      children,
      disabled,
      onClick,
      type = "button",
    }: {
      children: ReactNode
      disabled?: boolean
      onClick?: () => void
      type?: "button" | "submit" | "reset"
    }) => (
      <button type={type} disabled={disabled} onClick={onClick}>
        {children}
      </button>
    ),
    Checkbox: ({
      checked,
      disabled,
      "aria-label": ariaLabel,
      onCheckedChange,
    }: {
      checked?: boolean | "indeterminate"
      disabled?: boolean
      "aria-label"?: string
      onCheckedChange?: (checked: boolean) => void
    }) => (
      <button
        type="button"
        role="checkbox"
        aria-checked={checked === "indeterminate" ? "mixed" : checked === true}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => onCheckedChange?.(checked !== true)}
      />
    ),
    CompactMultiSelect: ({
      selected,
      onChange,
      "aria-label": ariaLabel,
    }: {
      selected: string[]
      onChange: (values: string[]) => void
      "aria-label"?: string
    }) => (
      <div>
        <div data-testid={ariaLabel}>{selected.join(",")}</div>
        <button
          type="button"
          onClick={() => onChange(["gpt-4o-mini", "custom-model"])}
        >
          Set editable models
        </button>
        <button type="button" onClick={() => onChange([])}>
          Clear editable models
        </button>
      </div>
    ),
    DestructiveConfirmDialog: ({
      isOpen,
      onClose,
      onConfirm,
      title,
      confirmLabel,
      cancelLabel,
      isWorking,
    }: {
      isOpen: boolean
      onClose: () => void
      onConfirm: () => void
      title: string
      confirmLabel: string
      cancelLabel: string
      isWorking?: boolean
    }) =>
      isOpen ? (
        <div role="dialog" aria-label={title}>
          <button type="button" onClick={onClose} disabled={isWorking}>
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} disabled={isWorking}>
            {confirmLabel}
          </button>
        </div>
      ) : null,
    Modal: ({
      isOpen,
      children,
      footer,
      header,
    }: {
      isOpen: boolean
      children?: ReactNode
      footer?: ReactNode
      header?: ReactNode
    }) =>
      isOpen ? (
        <div role="dialog">
          <div>{header}</div>
          <div>{children}</div>
          <div>{footer}</div>
        </div>
      ) : null,
  }
})

const account = buildDisplaySiteData({
  id: "account-1",
  name: "Account 1",
})
const token = {
  ...buildApiToken({
    id: 1,
    name: "Token 1",
  }),
  accountId: account.id,
  accountName: account.name,
}

const preview: ManagedSiteTokenBatchExportPreview = {
  siteType: NEW_API,
  totalCount: 2,
  readyCount: 2,
  warningCount: 0,
  skippedCount: 0,
  blockedCount: 0,
  items: [
    {
      id: "account-1:1",
      accountId: "account-1",
      accountName: "Account 1",
      tokenId: 1,
      tokenName: "Token 1",
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.READY,
      warningCodes: [],
      draft: {
        name: "Account 1 - Token 1",
        type: 1,
        key: "test-key",
        base_url: "https://example.com",
        models: ["gpt-4o"],
        groups: ["default"],
        priority: 0,
        weight: 0,
        status: 1,
      },
    },
    {
      id: "account-1:2",
      accountId: "account-1",
      accountName: "Account 1",
      tokenId: 2,
      tokenName: "Token 2",
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.READY,
      warningCodes: [],
      draft: {
        name: "Account 1 - Token 2",
        type: 1,
        key: "test-key-2",
        base_url: "https://example.com",
        models: ["gpt-4o"],
        groups: ["default"],
        priority: 0,
        weight: 0,
        status: 1,
      },
    },
  ],
}

const richPreview: ManagedSiteTokenBatchExportPreview = {
  siteType: NEW_API,
  totalCount: 4,
  readyCount: 1,
  warningCount: 1,
  skippedCount: 1,
  blockedCount: 1,
  items: [
    preview.items[0],
    {
      ...preview.items[1],
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.WARNING,
      warningCodes: [
        MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.MODEL_PREFILL_FAILED,
        MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.MATCH_REQUIRES_CONFIRMATION,
        MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.EXACT_VERIFICATION_UNAVAILABLE,
        MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.BACKEND_SEARCH_FAILED,
        MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.DEDUPE_UNSUPPORTED,
      ],
    },
    {
      id: "account-1:3",
      accountId: "account-1",
      accountName: "Account 1",
      tokenId: 3,
      tokenName: "Token 3",
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.SKIPPED,
      warningCodes: [],
      draft: {
        name: "Account 1 - Token 3",
        type: 1,
        key: "test-key-3",
        base_url: "https://example.com",
        models: ["gpt-4o-mini"],
        groups: ["default"],
        priority: 0,
        weight: 0,
        status: 1,
      },
      matchedChannel: {
        id: 8,
        name: "Existing channel",
      },
    },
    {
      id: "account-1:4",
      accountId: "account-1",
      accountName: "Account 1",
      tokenId: 4,
      tokenName: "Token 4",
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED,
      warningCodes: [],
      blockingReasonCode:
        MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.BASE_URL_REQUIRED,
      blockingMessage: "missing base URL",
      draft: null,
    },
  ],
}

const modelsRequiredPreview: ManagedSiteTokenBatchExportPreview = {
  siteType: NEW_API,
  totalCount: 3,
  readyCount: 0,
  warningCount: 0,
  skippedCount: 1,
  blockedCount: 2,
  items: [
    {
      id: "account-1:9",
      accountId: "account-1",
      accountName: "Account 1",
      tokenId: 9,
      tokenName: "Token 9",
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED,
      warningCodes: [],
      blockingReasonCode:
        MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.MODELS_REQUIRED,
      draft: {
        name: "Account 1 - Token 9",
        type: 1,
        key: "test-key-9",
        base_url: "https://example.com",
        models: [],
        groups: ["default"],
        priority: 0,
        weight: 0,
        status: 1,
      },
    },
    {
      id: "account-1:3",
      accountId: "account-1",
      accountName: "Account 1",
      tokenId: 3,
      tokenName: "Token 3",
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.SKIPPED,
      warningCodes: [],
      draft: {
        name: "Account 1 - Token 3",
        type: 1,
        key: "test-key-3",
        base_url: "https://example.com",
        models: ["gpt-4o-mini"],
        groups: ["default"],
        priority: 0,
        weight: 0,
        status: 1,
      },
      matchedChannel: {
        id: 8,
        name: "Existing channel",
      },
    },
    {
      id: "account-1:4",
      accountId: "account-1",
      accountName: "Account 1",
      tokenId: 4,
      tokenName: "Token 4",
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED,
      warningCodes: [],
      blockingReasonCode:
        MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.BASE_URL_REQUIRED,
      blockingMessage: "missing base URL",
      draft: null,
    },
  ],
}

const renderDialog = (props?: {
  onClose?: () => void
  onCompleted?: (result: unknown) => void
}) =>
  render(
    <ManagedSiteTokenBatchExportDialog
      isOpen={true}
      onClose={props?.onClose ?? vi.fn()}
      items={[{ account, token }]}
      onCompleted={props?.onCompleted as any}
    />,
  )

describe("ManagedSiteTokenBatchExportDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows preview load errors and retries preview preparation", async () => {
    const user = userEvent.setup()
    mockPreparePreview
      .mockRejectedValueOnce(new Error("preview failed"))
      .mockResolvedValueOnce(preview)

    renderDialog()

    expect(
      await screen.findByText(
        "keyManagement:batchManagedSiteExport.preview.loadFailed",
      ),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:batchManagedSiteExport.actions.refreshPreview",
      }),
    )

    await waitFor(() => {
      expect(mockPreparePreview).toHaveBeenCalledTimes(2)
    })
    expect(await screen.findByText("Account 1 / Token 1")).toBeInTheDocument()
  })

  it("resets transient state when the dialog closes and lets the confirm dialog cancel cleanly", async () => {
    const user = userEvent.setup()
    mockPreparePreview
      .mockRejectedValueOnce(new Error("preview failed"))
      .mockResolvedValueOnce(preview)

    const { rerender } = render(
      <ManagedSiteTokenBatchExportDialog
        isOpen={true}
        onClose={vi.fn()}
        items={[{ account, token }]}
      />,
    )

    expect(
      await screen.findByText(
        "keyManagement:batchManagedSiteExport.preview.loadFailed",
      ),
    ).toBeInTheDocument()

    rerender(
      <ManagedSiteTokenBatchExportDialog
        isOpen={false}
        onClose={vi.fn()}
        items={[{ account, token }]}
      />,
    )

    expect(screen.queryByRole("dialog")).toBeNull()

    rerender(
      <ManagedSiteTokenBatchExportDialog
        isOpen={true}
        onClose={vi.fn()}
        items={[{ account, token }]}
      />,
    )

    expect(await screen.findByText("Account 1 / Token 1")).toBeInTheDocument()
    expect(
      screen.queryByText(
        "keyManagement:batchManagedSiteExport.preview.loadFailed",
      ),
    ).toBeNull()

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:batchManagedSiteExport.actions.start",
      }),
    )
    expect(
      screen.getByRole("dialog", {
        name: "keyManagement:batchManagedSiteExport.confirm.title",
      }),
    ).toBeInTheDocument()

    await user.click(
      screen.getAllByRole("button", { name: "common:actions.cancel" })[1],
    )
    expect(
      screen.queryByRole("dialog", {
        name: "keyManagement:batchManagedSiteExport.confirm.title",
      }),
    ).toBeNull()
  })

  it("executes selected preview rows and reports success", async () => {
    const user = userEvent.setup()
    mockPreparePreview.mockResolvedValue(preview)
    mockExecuteBatchExport.mockResolvedValue({
      totalSelected: 1,
      attemptedCount: 1,
      createdCount: 1,
      failedCount: 0,
      skippedCount: 1,
      items: [
        {
          id: "account-1:1",
          accountName: "Account 1",
          tokenName: "Token 1",
          success: true,
          skipped: false,
        },
        {
          id: "account-1:2",
          accountName: "Account 1",
          tokenName: "Token 2",
          success: false,
          skipped: true,
        },
      ],
    })

    renderDialog()

    expect(await screen.findByText("Account 1 / Token 1")).toBeInTheDocument()
    await user.click(
      screen.getByRole("checkbox", {
        name: "Account 1 / Token 2",
      }),
    )
    expect(
      screen.getByRole("checkbox", {
        name: "keyManagement:batchManagedSiteExport.actions.selectAll",
      }),
    ).toHaveAttribute("aria-checked", "mixed")
    await user.click(
      screen.getByRole("checkbox", {
        name: "keyManagement:batchManagedSiteExport.actions.selectAll",
      }),
    )
    await user.click(
      screen.getByRole("checkbox", {
        name: "keyManagement:batchManagedSiteExport.actions.selectAll",
      }),
    )

    expect(
      screen.getByRole("button", {
        name: "keyManagement:batchManagedSiteExport.actions.start",
      }),
    ).toBeDisabled()

    await user.click(
      screen.getByRole("checkbox", {
        name: "Account 1 / Token 1",
      }),
    )

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:batchManagedSiteExport.actions.start",
      }),
    )
    await user.click(
      screen.getAllByRole("button", {
        name: "keyManagement:batchManagedSiteExport.actions.start",
      })[1],
    )

    await waitFor(() => {
      expect(mockExecuteBatchExport).toHaveBeenCalledWith({
        preview,
        selectedItemIds: ["account-1:1"],
      })
    })
    expect(mockToastSuccess).toHaveBeenCalledWith(
      "keyManagement:batchManagedSiteExport.messages.completed",
    )
    expect(
      await screen.findByText(
        "keyManagement:batchManagedSiteExport.results.summary",
      ),
    ).toBeInTheDocument()
  })

  it("passes edited models to batch execution", async () => {
    const user = userEvent.setup()
    mockPreparePreview.mockResolvedValue(preview)
    mockExecuteBatchExport.mockResolvedValue({
      totalSelected: 2,
      attemptedCount: 2,
      createdCount: 2,
      failedCount: 0,
      skippedCount: 0,
      items: [
        {
          id: "account-1:1",
          accountName: "Account 1",
          tokenName: "Token 1",
          success: true,
          skipped: false,
        },
        {
          id: "account-1:2",
          accountName: "Account 1",
          tokenName: "Token 2",
          success: true,
          skipped: false,
        },
      ],
    })

    renderDialog()

    expect(await screen.findByText("Account 1 / Token 1")).toBeInTheDocument()
    await user.click(screen.getAllByText("Set editable models")[0])
    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:batchManagedSiteExport.actions.start",
      }),
    )
    await user.click(
      screen.getAllByRole("button", {
        name: "keyManagement:batchManagedSiteExport.actions.start",
      })[1],
    )

    await waitFor(() => {
      expect(mockExecuteBatchExport).toHaveBeenCalledTimes(1)
    })
    const call = mockExecuteBatchExport.mock.calls[0][0]
    expect(call.preview.items[0].draft.models).toEqual([
      "gpt-4o-mini",
      "custom-model",
    ])
    expect(call.selectedItemIds).toEqual(["account-1:1", "account-1:2"])
  })

  it("lets users unblock rows that only lack models", async () => {
    const user = userEvent.setup()
    mockPreparePreview.mockResolvedValue(modelsRequiredPreview)
    mockExecuteBatchExport.mockResolvedValue({
      totalSelected: 1,
      attemptedCount: 1,
      createdCount: 1,
      failedCount: 0,
      skippedCount: 0,
      items: [
        {
          id: "account-1:9",
          accountName: "Account 1",
          tokenName: "Token 9",
          success: true,
          skipped: false,
        },
      ],
    })

    renderDialog()

    expect(await screen.findByText("Account 1 / Token 9")).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "keyManagement:batchManagedSiteExport.actions.start",
      }),
    ).toBeDisabled()

    await user.click(screen.getByText("Set editable models"))
    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:batchManagedSiteExport.actions.start",
      }),
    )
    await user.click(
      screen.getAllByRole("button", {
        name: "keyManagement:batchManagedSiteExport.actions.start",
      })[1],
    )

    await waitFor(() => {
      expect(mockExecuteBatchExport).toHaveBeenCalledTimes(1)
    })
    const call = mockExecuteBatchExport.mock.calls[0][0]
    expect(call.preview.items[0]).toMatchObject({
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.WARNING,
      blockingReasonCode: undefined,
    })
    expect(call.preview.items[0].draft.models).toEqual([
      "gpt-4o-mini",
      "custom-model",
    ])
    expect(call.selectedItemIds).toEqual(["account-1:9"])
  })

  it("re-blocks edited rows when models are cleared", async () => {
    const user = userEvent.setup()
    mockPreparePreview.mockResolvedValue(modelsRequiredPreview)

    renderDialog()

    expect(await screen.findByText("Account 1 / Token 9")).toBeInTheDocument()

    await user.click(screen.getByText("Set editable models"))
    await user.click(screen.getByText("Clear editable models"))

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "keyManagement:batchManagedSiteExport.actions.start",
        }),
      ).toBeDisabled()
    })

    expect(mockExecuteBatchExport).not.toHaveBeenCalled()
  })

  it("renders warning, skipped, blocked, and execution result details", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onCompleted = vi.fn()
    mockPreparePreview.mockResolvedValue(richPreview)
    mockExecuteBatchExport.mockResolvedValue({
      totalSelected: 2,
      attemptedCount: 2,
      createdCount: 1,
      failedCount: 1,
      skippedCount: 2,
      items: [
        {
          id: "account-1:1",
          accountName: "Account 1",
          tokenName: "Token 1",
          success: true,
          skipped: false,
        },
        {
          id: "account-1:2",
          accountName: "Account 1",
          tokenName: "Token 2",
          success: false,
          skipped: false,
          error: "warning item failed",
        },
        {
          id: "account-1:3",
          accountName: "Account 1",
          tokenName: "Token 3",
          success: false,
          skipped: true,
        },
        {
          id: "account-1:4",
          accountName: "Account 1",
          tokenName: "Token 4",
          success: false,
          skipped: true,
        },
      ],
    })

    renderDialog({ onClose, onCompleted })

    expect(await screen.findByText("Account 1 / Token 4")).toBeInTheDocument()
    expect(
      screen.getByText("keyManagement:batchManagedSiteExport.status.warning"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("keyManagement:batchManagedSiteExport.status.skipped"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("keyManagement:batchManagedSiteExport.status.blocked"),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "keyManagement:batchManagedSiteExport.warnings.modelPrefillFailed",
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "keyManagement:batchManagedSiteExport.warnings.matchRequiresConfirmation",
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "keyManagement:batchManagedSiteExport.warnings.exactVerificationUnavailable",
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "keyManagement:batchManagedSiteExport.warnings.backendSearchFailed",
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "keyManagement:batchManagedSiteExport.warnings.dedupeUnsupported",
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "keyManagement:batchManagedSiteExport.messages.duplicate",
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /keyManagement:batchManagedSiteExport.blockedReasons.baseUrlRequired/,
      ),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:batchManagedSiteExport.actions.start",
      }),
    )
    await user.click(
      screen.getAllByRole("button", {
        name: "keyManagement:batchManagedSiteExport.actions.start",
      })[1],
    )

    await waitFor(() => {
      expect(onCompleted).toHaveBeenCalledTimes(1)
    })
    expect(
      await screen.findByText(
        "keyManagement:batchManagedSiteExport.results.status.success",
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "keyManagement:batchManagedSiteExport.results.status.failed",
      ),
    ).toBeInTheDocument()
    expect(
      screen.getAllByText(
        "keyManagement:batchManagedSiteExport.results.status.skipped",
      ),
    ).toHaveLength(2)
    expect(screen.getByText("warning item failed")).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "common:actions.close",
      }),
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("shows execution errors without replacing the preview error state", async () => {
    const user = userEvent.setup()
    mockPreparePreview.mockResolvedValue(preview)
    mockExecuteBatchExport.mockRejectedValue(new Error("execute failed"))

    renderDialog()

    expect(await screen.findByText("Account 1 / Token 1")).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:batchManagedSiteExport.actions.start",
      }),
    )
    await user.click(
      screen.getAllByRole("button", {
        name: "keyManagement:batchManagedSiteExport.actions.start",
      })[1],
    )

    expect(
      await screen.findByText(
        "keyManagement:batchManagedSiteExport.messages.executionFailed",
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(
        "keyManagement:batchManagedSiteExport.preview.loadFailed",
      ),
    ).toBeNull()
    expect(
      screen.getByRole("button", {
        name: "keyManagement:batchManagedSiteExport.actions.start",
      }),
    ).toBeEnabled()
  })

  it("maps known execution error codes to user-facing text", async () => {
    const user = userEvent.setup()
    mockPreparePreview.mockResolvedValue(preview)
    mockExecuteBatchExport.mockResolvedValue({
      totalSelected: 1,
      attemptedCount: 1,
      createdCount: 0,
      failedCount: 1,
      skippedCount: 1,
      items: [
        {
          id: "account-1:1",
          accountName: "Account 1",
          tokenName: "Token 1",
          success: false,
          skipped: false,
          error:
            MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.CONFIG_MISSING,
        },
        {
          id: "account-1:2",
          accountName: "Account 1",
          tokenName: "Token 2",
          success: false,
          skipped: true,
        },
      ],
    })

    renderDialog()

    expect(await screen.findByText("Account 1 / Token 1")).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:batchManagedSiteExport.actions.start",
      }),
    )
    await user.click(
      screen.getAllByRole("button", {
        name: "keyManagement:batchManagedSiteExport.actions.start",
      })[1],
    )

    expect(
      await screen.findByText(
        "keyManagement:batchManagedSiteExport.blockedReasons.configMissing",
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText("config-missing")).toBeNull()
  })

  it("falls back to generic localized text for unknown errors and blocked reasons", async () => {
    const user = userEvent.setup()
    mockPreparePreview
      .mockResolvedValueOnce({
        ...preview,
        totalCount: 1,
        readyCount: 0,
        blockedCount: 1,
        items: [
          {
            id: "account-1:5",
            accountId: "account-1",
            accountName: "Account 1",
            tokenId: 5,
            tokenName: "Token 5",
            status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED,
            warningCodes: [],
            blockingReasonCode: "unknown-reason" as any,
            blockingMessage: "custom detail",
            draft: null,
          },
        ],
      })
      .mockResolvedValueOnce(preview)
    mockExecuteBatchExport.mockResolvedValue({
      totalSelected: 1,
      attemptedCount: 1,
      createdCount: 0,
      failedCount: 1,
      skippedCount: 1,
      items: [
        {
          id: "account-1:1",
          accountName: "Account 1",
          tokenName: "Token 1",
          success: false,
          skipped: false,
          error: "   ",
        },
        {
          id: "account-1:2",
          accountName: "Account 1",
          tokenName: "Token 2",
          success: false,
          skipped: true,
        },
      ],
    })

    renderDialog()

    expect(await screen.findByText("Account 1 / Token 5")).toBeInTheDocument()
    expect(
      screen.getByText(
        "keyManagement:batchManagedSiteExport.blockedReasons.inputPreparationFailed: custom detail",
      ),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:batchManagedSiteExport.actions.refreshPreview",
      }),
    )

    await screen.findByText("Account 1 / Token 1")
    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:batchManagedSiteExport.actions.start",
      }),
    )
    await user.click(
      screen.getAllByRole("button", {
        name: "keyManagement:batchManagedSiteExport.actions.start",
      })[1],
    )

    expect(
      await screen.findByText(
        "keyManagement:batchManagedSiteExport.results.channelCreationFailed",
      ),
    ).toBeInTheDocument()
  })

  it("renders localized text for every blocked reason code", async () => {
    mockPreparePreview.mockResolvedValue({
      siteType: NEW_API,
      totalCount: 6,
      readyCount: 0,
      warningCount: 0,
      skippedCount: 0,
      blockedCount: 6,
      items: [
        {
          id: "account-1:11",
          accountId: "account-1",
          accountName: "Account 1",
          tokenId: 11,
          tokenName: "Token 11",
          status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED,
          warningCodes: [],
          blockingReasonCode:
            MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.SECRET_RESOLUTION_FAILED,
          blockingMessage: "secret issue",
          draft: null,
        },
        {
          id: "account-1:12",
          accountId: "account-1",
          accountName: "Account 1",
          tokenId: 12,
          tokenName: "Token 12",
          status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED,
          warningCodes: [],
          blockingReasonCode:
            MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.NAME_REQUIRED,
          draft: null,
        },
        {
          id: "account-1:13",
          accountId: "account-1",
          accountName: "Account 1",
          tokenId: 13,
          tokenName: "Token 13",
          status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED,
          warningCodes: [],
          blockingReasonCode:
            MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.KEY_REQUIRED,
          draft: null,
        },
        {
          id: "account-1:14",
          accountId: "account-1",
          accountName: "Account 1",
          tokenId: 14,
          tokenName: "Token 14",
          status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED,
          warningCodes: [],
          blockingReasonCode:
            MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.REAL_KEY_REQUIRED,
          draft: null,
        },
        {
          id: "account-1:15",
          accountId: "account-1",
          accountName: "Account 1",
          tokenId: 15,
          tokenName: "Token 15",
          status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED,
          warningCodes: [],
          blockingReasonCode:
            MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.MODELS_REQUIRED,
          draft: null,
        },
        {
          id: "account-1:16",
          accountId: "account-1",
          accountName: "Account 1",
          tokenId: 16,
          tokenName: "Token 16",
          status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED,
          warningCodes: [],
          blockingReasonCode:
            MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.INPUT_PREPARATION_FAILED,
          draft: null,
        },
      ],
    })

    renderDialog()

    expect(
      await screen.findByText(
        /keyManagement:batchManagedSiteExport\.blockedReasons\.secretResolutionFailed/,
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "keyManagement:batchManagedSiteExport.blockedReasons.nameRequired",
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "keyManagement:batchManagedSiteExport.blockedReasons.keyRequired",
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "keyManagement:batchManagedSiteExport.blockedReasons.realKeyRequired",
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "keyManagement:batchManagedSiteExport.blockedReasons.modelsRequired",
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "keyManagement:batchManagedSiteExport.blockedReasons.inputPreparationFailed",
      ),
    ).toBeInTheDocument()
    expect(screen.getByText(/secret issue/)).toBeInTheDocument()
  })
})
