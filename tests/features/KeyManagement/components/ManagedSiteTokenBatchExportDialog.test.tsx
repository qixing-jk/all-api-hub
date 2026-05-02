import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { NEW_API } from "~/constants/siteType"
import { ManagedSiteTokenBatchExportDialog } from "~/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog"
import {
  MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES,
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
      onCheckedChange,
    }: {
      checked?: boolean
      disabled?: boolean
      onCheckedChange?: (checked: boolean) => void
    }) => (
      <button
        type="button"
        role="checkbox"
        aria-checked={checked === true}
        disabled={disabled}
        onClick={() => onCheckedChange?.(!checked)}
      />
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

const renderDialog = () =>
  render(
    <ManagedSiteTokenBatchExportDialog
      isOpen={true}
      onClose={vi.fn()}
      items={[{ account, token }]}
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
    const rowCheckboxes = screen.getAllByRole("checkbox")
    await user.click(rowCheckboxes[2])

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
})
