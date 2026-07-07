import { act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { ManagedSiteTokenBatchExportDialog } from "~/features/KeyManagement/components/ManagedSiteTokenBatchExportDialog"
import { NEW_API_MANAGED_VERIFICATION_CLOSE_MODES } from "~/features/ManagedSiteVerification/useNewApiManagedVerification"
import { buildAccountTokenRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/contracts"
import {
  MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES,
  type ManagedSiteTokenBatchExportPreview,
  type ManagedSiteTokenBatchExportPreviewItem,
} from "~/types/managedSiteTokenBatchExport"
import {
  buildApiToken,
  buildDisplaySiteData,
} from "~~/tests/test-utils/factories"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const {
  mockAllowDisabledVerificationButtonClicks,
  mockExecuteBatchExport,
  mockCloseNewApiManagedVerification,
  mockGetPreviewVerificationTargets,
  mockLoadNewApiChannelKeyWithVerification,
  mockOpenNewApiManagedVerification,
  mockPreparePreview,
  mockTrackProductAnalyticsActionCompleted,
  mockTrackProductAnalyticsActionStarted,
  mockToastSuccess,
  mockVerificationDialogState,
} = vi.hoisted(() => ({
  mockAllowDisabledVerificationButtonClicks: {
    current: false,
  },
  mockExecuteBatchExport: vi.fn(),
  mockCloseNewApiManagedVerification: vi.fn(),
  mockGetPreviewVerificationTargets: vi.fn(),
  mockLoadNewApiChannelKeyWithVerification: vi.fn(),
  mockOpenNewApiManagedVerification: vi.fn(),
  mockPreparePreview: vi.fn(),
  mockTrackProductAnalyticsActionCompleted: vi.fn(),
  mockTrackProductAnalyticsActionStarted: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockVerificationDialogState: {
    isOpen: false,
  },
}))

vi.mock(
  "~/features/KeyManagement/components/managedSiteTokenBatchExportPreview",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/features/KeyManagement/components/managedSiteTokenBatchExportPreview")
      >()

    return {
      ...actual,
      getPreviewVerificationTargets: (...args: unknown[]) => {
        const implementation =
          mockGetPreviewVerificationTargets.getMockImplementation()
        return implementation
          ? mockGetPreviewVerificationTargets(...args)
          : actual.getPreviewVerificationTargets(
              args[0] as Parameters<
                typeof actual.getPreviewVerificationTargets
              >[0],
            )
      },
    }
  },
)

vi.mock("~/services/managedSites/tokenBatchExport", () => ({
  prepareManagedSiteTokenBatchExportPreview: mockPreparePreview,
  executeManagedSiteTokenBatchExport: mockExecuteBatchExport,
}))

vi.mock(
  "~/features/ManagedSiteVerification/loadNewApiChannelKeyWithVerification",
  () => ({
    loadNewApiChannelKeyWithVerification:
      mockLoadNewApiChannelKeyWithVerification,
  }),
)

vi.mock(
  "~/features/ManagedSiteVerification/useNewApiManagedVerification",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/features/ManagedSiteVerification/useNewApiManagedVerification")
      >()

    return {
      ...actual,
      useNewApiManagedVerification: () => ({
        dialogState: {
          isOpen: mockVerificationDialogState.isOpen,
          step: actual.NEW_API_MANAGED_VERIFICATION_STEPS.LOGGING_IN,
          request: null,
          code: "",
          isBusy: false,
        },
        setCode: vi.fn(),
        closeDialog: mockCloseNewApiManagedVerification,
        openBaseUrl: vi.fn(),
        openNewApiManagedVerification: mockOpenNewApiManagedVerification,
        submitCode: vi.fn(),
        retryVerification: vi.fn(),
        patchRequestConfig: vi.fn(),
      }),
    }
  },
)

vi.mock(
  "~/features/ManagedSiteVerification/NewApiManagedVerificationDialog",
  () => ({
    NewApiManagedVerificationDialog: ({ isOpen }: { isOpen: boolean }) =>
      isOpen ? <div role="dialog">New API verification</div> : null,
  }),
)

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/contexts/UserPreferencesContext")>()

  return {
    ...actual,
    useUserPreferencesContext: () => ({
      newApiBaseUrl: "https://managed.example",
      newApiUserId: "1",
      newApiUsername: "admin",
      newApiPassword: "secret",
      newApiTotpSecret: "JBSWY3DPEHPK3PXP",
    }),
  }
})

vi.mock("~/services/productAnalytics/actions", () => ({
  trackProductAnalyticsActionStarted: mockTrackProductAnalyticsActionStarted,
  trackProductAnalyticsActionCompleted:
    mockTrackProductAnalyticsActionCompleted,
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
    }) => {
      const isVerificationButton =
        children ===
          "keyManagement:batchManagedSiteExport.actions.verifyAndRefresh" ||
        children === "keyManagement:batchManagedSiteExport.actions.verifying"

      return (
        <button
          type={type}
          disabled={
            isVerificationButton &&
            mockAllowDisabledVerificationButtonClicks.current
              ? false
              : disabled
          }
          onClick={onClick}
        >
          {children}
        </button>
      )
    },
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
const runtimeKey = buildAccountTokenRuntimeKey(account, token)

const buildDialogPreviewItem = (
  tokenId: number,
  runtimeKeyName: string,
  fields: Omit<
    ManagedSiteTokenBatchExportPreviewItem,
    "id" | "accountId" | "accountName" | "runtimeKeyId" | "runtimeKeyName"
  >,
): ManagedSiteTokenBatchExportPreviewItem => {
  const runtimeKeyId = `account_token:account-1:${tokenId}`
  return {
    id: runtimeKeyId,
    accountId: "account-1",
    accountName: "Account 1",
    runtimeKeyId,
    runtimeKeyName,
    ...fields,
  }
}

const buildRecoverablePreviewItem = (
  item: ManagedSiteTokenBatchExportPreviewItem,
  channel: { id: number; name: string },
): ManagedSiteTokenBatchExportPreviewItem => ({
  ...item,
  status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.WARNING,
  warningCodes: [
    MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.EXACT_VERIFICATION_UNAVAILABLE,
  ],
  matchedChannel: channel,
  verificationCandidate: channel,
  assessment: {
    searchBaseUrl: "https://example.com",
    searchCompleted: true,
    url: {
      matched: true,
      candidateCount: 1,
      channel,
    },
    key: {
      comparable: false,
      matched: false,
      reason: "comparison-unavailable",
    },
    models: {
      comparable: true,
      matched: true,
      reason: "exact",
      channel,
      similarityScore: 1,
    },
  },
})

const preview: ManagedSiteTokenBatchExportPreview = {
  siteType: SITE_TYPES.NEW_API,
  totalCount: 2,
  readyCount: 2,
  warningCount: 0,
  skippedCount: 0,
  blockedCount: 0,
  items: [
    buildDialogPreviewItem(1, "Token 1", {
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
    }),
    buildDialogPreviewItem(2, "Token 2", {
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
    }),
  ],
}

const richPreview: ManagedSiteTokenBatchExportPreview = {
  siteType: SITE_TYPES.NEW_API,
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
    buildDialogPreviewItem(3, "Token 3", {
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
    }),
    buildDialogPreviewItem(4, "Token 4", {
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED,
      warningCodes: [],
      blockingReasonCode:
        MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.BASE_URL_REQUIRED,
      blockingMessage: "missing base URL",
      draft: null,
    }),
  ],
}

const modelsRequiredPreview: ManagedSiteTokenBatchExportPreview = {
  siteType: SITE_TYPES.NEW_API,
  totalCount: 3,
  readyCount: 0,
  warningCount: 0,
  skippedCount: 1,
  blockedCount: 2,
  items: [
    buildDialogPreviewItem(9, "Token 9", {
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
    }),
    buildDialogPreviewItem(3, "Token 3", {
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
    }),
    buildDialogPreviewItem(4, "Token 4", {
      status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED,
      warningCodes: [],
      blockingReasonCode:
        MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.BASE_URL_REQUIRED,
      blockingMessage: "missing base URL",
      draft: null,
    }),
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
      items={[{ account, runtimeKey }]}
      onCompleted={props?.onCompleted as any}
    />,
  )

describe("ManagedSiteTokenBatchExportDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExecuteBatchExport.mockReset()
    mockCloseNewApiManagedVerification.mockReset()
    mockGetPreviewVerificationTargets.mockReset()
    mockLoadNewApiChannelKeyWithVerification.mockReset()
    mockPreparePreview.mockReset()
    mockAllowDisabledVerificationButtonClicks.current = false
    mockVerificationDialogState.isOpen = false
    mockLoadNewApiChannelKeyWithVerification.mockImplementation(
      async (params) => {
        await Promise.resolve(params.onLoaded?.())
        return true
      },
    )
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
        items={[{ account, runtimeKey }]}
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
        items={[{ account, runtimeKey }]}
      />,
    )

    expect(screen.queryByRole("dialog")).toBeNull()

    rerender(
      <ManagedSiteTokenBatchExportDialog
        isOpen={true}
        onClose={vi.fn()}
        items={[{ account, runtimeKey }]}
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

  it("keeps the opened item batch stable across parent rerenders while open", async () => {
    mockPreparePreview.mockResolvedValue(preview)

    const { rerender } = render(
      <ManagedSiteTokenBatchExportDialog
        isOpen={true}
        onClose={vi.fn()}
        items={[{ account, runtimeKey }]}
      />,
    )

    expect(await screen.findByText("Account 1 / Token 1")).toBeInTheDocument()
    expect(mockPreparePreview).toHaveBeenCalledTimes(1)
    mockPreparePreview.mockClear()

    rerender(
      <ManagedSiteTokenBatchExportDialog
        isOpen={true}
        onClose={vi.fn()}
        items={[{ account, runtimeKey }]}
      />,
    )

    await act(async () => {
      await Promise.resolve()
    })
    expect(mockPreparePreview).not.toHaveBeenCalled()
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
          id: "account_token:account-1:1",
          accountName: "Account 1",
          runtimeKeyName: "Token 1",
          success: true,
          skipped: false,
        },
        {
          id: "account_token:account-1:2",
          accountName: "Account 1",
          runtimeKeyName: "Token 2",
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
        selectedItemIds: ["account_token:account-1:1"],
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

  it("does not auto-select warning rows that need duplicate-risk confirmation", async () => {
    mockPreparePreview.mockResolvedValue(richPreview)

    renderDialog()

    expect(await screen.findByText("Account 1 / Token 2")).toBeInTheDocument()
    expect(
      screen.getByRole("checkbox", {
        name: "Account 1 / Token 1",
      }),
    ).toHaveAttribute("aria-checked", "true")
    expect(
      screen.getByRole("checkbox", {
        name: "Account 1 / Token 2",
      }),
    ).toHaveAttribute("aria-checked", "false")
  })

  it("lets users verify recoverable warning rows and update the preview locally", async () => {
    const user = userEvent.setup()
    mockLoadNewApiChannelKeyWithVerification.mockImplementation(
      async (params) => {
        const keyByChannelId: Record<number, string> = {
          7: "test-key",
          8: "test-key-2",
        }
        await Promise.resolve(params.setKey(keyByChannelId[params.channelId]))
        await Promise.resolve(params.onLoaded?.())
        return true
      },
    )
    const recoverablePreview: ManagedSiteTokenBatchExportPreview = {
      ...preview,
      totalCount: 2,
      readyCount: 0,
      warningCount: 2,
      skippedCount: 0,
      blockedCount: 0,
      items: [
        buildRecoverablePreviewItem(preview.items[0], {
          id: 7,
          name: "Potential channel",
        }),
        buildRecoverablePreviewItem(preview.items[1], {
          id: 8,
          name: "Second potential channel",
        }),
      ],
    }
    mockPreparePreview.mockResolvedValueOnce(recoverablePreview)

    renderDialog()

    expect(await screen.findByText("Account 1 / Token 1")).toBeInTheDocument()
    await user.click(
      screen.getAllByRole("button", {
        name: "keyManagement:batchManagedSiteExport.actions.verifyAndRefresh",
      })[0],
    )

    await waitFor(() => {
      expect(mockLoadNewApiChannelKeyWithVerification).toHaveBeenCalledWith(
        expect.objectContaining({
          channelId: 7,
          label: "Potential channel",
          requestKind: "channel",
          config: {
            baseUrl: "https://managed.example",
            userId: "1",
            username: "admin",
            password: "secret",
            totpSecret: "JBSWY3DPEHPK3PXP",
          },
          openVerification: expect.any(Function),
        }),
      )
    })
    await waitFor(() => {
      expect(
        screen.getAllByText(
          "keyManagement:batchManagedSiteExport.status.skipped",
        ),
      ).toHaveLength(2)
    })
    expect(mockLoadNewApiChannelKeyWithVerification).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: 8,
        label: "Second potential channel",
      }),
    )
    expect(mockLoadNewApiChannelKeyWithVerification).toHaveBeenCalledTimes(2)
    expect(mockPreparePreview).toHaveBeenCalledTimes(1)
  })

  it("continues verifying remaining warning rows after two-step verification completes", async () => {
    const user = userEvent.setup()
    mockLoadNewApiChannelKeyWithVerification
      .mockImplementationOnce(async (params) => {
        await Promise.resolve(
          params.openVerification({
            kind: "channel",
            label: "Potential channel",
            config: {
              baseUrl: "https://managed.example",
              userId: "1",
              username: "admin",
              password: "secret",
              totpSecret: "JBSWY3DPEHPK3PXP",
            },
            onVerified: async () => {
              await Promise.resolve(params.setKey("test-key"))
              await Promise.resolve(params.onLoaded?.())
            },
          }),
        )
        return false
      })
      .mockImplementationOnce(async (params) => {
        await Promise.resolve(params.setKey("test-key-2"))
        await Promise.resolve(params.onLoaded?.())
        return true
      })
    const recoverablePreview: ManagedSiteTokenBatchExportPreview = {
      ...preview,
      totalCount: 2,
      readyCount: 0,
      warningCount: 2,
      skippedCount: 0,
      blockedCount: 0,
      items: [
        buildRecoverablePreviewItem(preview.items[0], {
          id: 7,
          name: "Potential channel",
        }),
        buildRecoverablePreviewItem(preview.items[1], {
          id: 8,
          name: "Second potential channel",
        }),
      ],
    }
    mockPreparePreview.mockResolvedValueOnce(recoverablePreview)

    renderDialog()

    expect(await screen.findByText("Account 1 / Token 1")).toBeInTheDocument()
    await user.click(
      screen.getAllByRole("button", {
        name: "keyManagement:batchManagedSiteExport.actions.verifyAndRefresh",
      })[0],
    )

    await waitFor(() => {
      expect(mockLoadNewApiChannelKeyWithVerification).toHaveBeenCalledTimes(1)
    })
    expect(mockLoadNewApiChannelKeyWithVerification).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: 7,
      }),
    )

    const openedVerificationRequest =
      mockOpenNewApiManagedVerification.mock.calls[0]?.[0]
    expect(openedVerificationRequest?.closeMode).toBe(
      NEW_API_MANAGED_VERIFICATION_CLOSE_MODES.CLOSE_AFTER_VERIFICATION,
    )
    await act(async () => {
      await openedVerificationRequest?.onVerified?.()
    })

    await waitFor(() => {
      expect(mockLoadNewApiChannelKeyWithVerification).toHaveBeenCalledWith(
        expect.objectContaining({
          channelId: 8,
          label: "Second potential channel",
        }),
      )
    })
    await waitFor(() => {
      expect(
        screen.getAllByText(
          "keyManagement:batchManagedSiteExport.status.skipped",
        ),
      ).toHaveLength(2)
    })
    expect(mockLoadNewApiChannelKeyWithVerification).toHaveBeenCalledTimes(2)
    expect(mockPreparePreview).toHaveBeenCalledTimes(1)
  })

  it("closes an open verification dialog before closing the batch dialog", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    mockVerificationDialogState.isOpen = true
    mockPreparePreview.mockResolvedValue(preview)

    renderDialog({ onClose })

    expect(await screen.findByText("Account 1 / Token 1")).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", {
        name: "common:actions.cancel",
      }),
    )

    expect(mockCloseNewApiManagedVerification).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("shows a verification error when channel key loading fails", async () => {
    const user = userEvent.setup()
    const recoverablePreview: ManagedSiteTokenBatchExportPreview = {
      ...preview,
      totalCount: 1,
      readyCount: 0,
      warningCount: 1,
      skippedCount: 0,
      blockedCount: 0,
      items: [
        buildRecoverablePreviewItem(preview.items[0], {
          id: 7,
          name: "Potential channel",
        }),
      ],
    }
    mockPreparePreview.mockResolvedValueOnce(recoverablePreview)
    mockLoadNewApiChannelKeyWithVerification.mockRejectedValue(
      new Error("verification failed"),
    )

    renderDialog()

    expect(await screen.findByText("Account 1 / Token 1")).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:batchManagedSiteExport.actions.verifyAndRefresh",
      }),
    )

    expect(
      await screen.findByText(
        "keyManagement:batchManagedSiteExport.messages.executionFailed",
      ),
    ).toBeInTheDocument()
  })

  it("ignores verify clicks while the verification dialog is already open", async () => {
    const user = userEvent.setup()
    const recoverablePreview: ManagedSiteTokenBatchExportPreview = {
      ...preview,
      totalCount: 1,
      readyCount: 0,
      warningCount: 1,
      skippedCount: 0,
      blockedCount: 0,
      items: [
        buildRecoverablePreviewItem(preview.items[0], {
          id: 7,
          name: "Potential channel",
        }),
      ],
    }
    mockVerificationDialogState.isOpen = true
    mockAllowDisabledVerificationButtonClicks.current = true
    mockPreparePreview.mockResolvedValueOnce(recoverablePreview)

    renderDialog()

    expect(await screen.findByText("Account 1 / Token 1")).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:batchManagedSiteExport.actions.verifyAndRefresh",
      }),
    )

    expect(mockLoadNewApiChannelKeyWithVerification).not.toHaveBeenCalled()
  })

  it("falls back to the clicked item when the preview has no verification targets", async () => {
    const user = userEvent.setup()
    const recoverablePreview: ManagedSiteTokenBatchExportPreview = {
      ...preview,
      totalCount: 1,
      readyCount: 0,
      warningCount: 1,
      skippedCount: 0,
      blockedCount: 0,
      items: [
        buildRecoverablePreviewItem(preview.items[0], {
          id: 7,
          name: "Potential channel",
        }),
      ],
    }
    mockPreparePreview.mockResolvedValueOnce(recoverablePreview)
    mockGetPreviewVerificationTargets.mockReturnValue([])

    renderDialog()

    expect(await screen.findByText("Account 1 / Token 1")).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:batchManagedSiteExport.actions.verifyAndRefresh",
      }),
    )

    expect(mockLoadNewApiChannelKeyWithVerification).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: 7,
        label: "Potential channel",
      }),
    )
  })

  it("shows a fallback verification error when the verification target list cannot be read", async () => {
    const user = userEvent.setup()
    const recoverablePreview: ManagedSiteTokenBatchExportPreview = {
      ...preview,
      totalCount: 1,
      readyCount: 0,
      warningCount: 1,
      skippedCount: 0,
      blockedCount: 0,
      items: [
        buildRecoverablePreviewItem(preview.items[0], {
          id: 7,
          name: "Potential channel",
        }),
      ],
    }
    mockPreparePreview.mockResolvedValueOnce(recoverablePreview)
    let lengthReads = 0
    mockGetPreviewVerificationTargets.mockReturnValue(
      new Proxy(
        [
          {
            item: recoverablePreview.items[0],
            candidate: recoverablePreview.items[0].verificationCandidate,
          },
        ],
        {
          get(target, property, receiver) {
            if (property === "length") {
              lengthReads += 1
              if (lengthReads > 1) {
                throw new Error("target unavailable")
              }
            }

            return Reflect.get(target, property, receiver)
          },
        },
      ),
    )

    renderDialog()

    expect(await screen.findByText("Account 1 / Token 1")).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", {
        name: "keyManagement:batchManagedSiteExport.actions.verifyAndRefresh",
      }),
    )

    expect(
      await screen.findByText(
        "keyManagement:batchManagedSiteExport.messages.executionFailed",
      ),
    ).toBeInTheDocument()
  })

  it("tracks analytics only around confirmed batch export execution success", async () => {
    const user = userEvent.setup()
    mockPreparePreview.mockResolvedValue(preview)
    mockExecuteBatchExport.mockResolvedValue({
      totalSelected: 2,
      attemptedCount: 2,
      createdCount: 1,
      failedCount: 1,
      skippedCount: 0,
      items: [
        {
          id: "account_token:account-1:1",
          accountName: "Account 1",
          runtimeKeyName: "Token 1",
          success: true,
          skipped: false,
        },
        {
          id: "account_token:account-1:2",
          accountName: "Account 1",
          runtimeKeyName: "Token 2",
          success: false,
          skipped: false,
          error: "backend detail",
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

    expect(mockTrackProductAnalyticsActionStarted).not.toHaveBeenCalled()

    await user.click(
      screen.getAllByRole("button", {
        name: "keyManagement:batchManagedSiteExport.actions.start",
      })[1],
    )

    await waitFor(() => {
      expect(mockExecuteBatchExport).toHaveBeenCalledTimes(1)
    })
    expect(mockTrackProductAnalyticsActionStarted).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ExportManagedSiteTokenChannels,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(mockTrackProductAnalyticsActionCompleted).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ExportManagedSiteTokenChannels,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      insights: {
        selectedCount: 2,
        itemCount: 2,
        successCount: 1,
        failureCount: 1,
      },
    })
    expect(
      mockTrackProductAnalyticsActionCompleted.mock.calls[0]?.[0],
    ).not.toHaveProperty("durationMs")
  })

  it("tracks failed confirmed batch export execution without raw error details", async () => {
    const user = userEvent.setup()
    mockPreparePreview.mockResolvedValue(preview)
    mockExecuteBatchExport.mockRejectedValue(new Error("execute failed"))

    renderDialog()

    expect(await screen.findByText("Account 1 / Token 1")).toBeInTheDocument()
    await user.click(
      screen.getByRole("checkbox", {
        name: "Account 1 / Token 2",
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
      expect(mockExecuteBatchExport).toHaveBeenCalledTimes(1)
    })
    expect(mockTrackProductAnalyticsActionCompleted).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ExportManagedSiteTokenChannels,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      insights: {
        selectedCount: 1,
        itemCount: 1,
      },
    })
    for (const [payload] of mockTrackProductAnalyticsActionCompleted.mock
      .calls) {
      expect(payload).not.toHaveProperty("error")
      expect(payload).not.toHaveProperty("message")
    }
    expect(
      mockTrackProductAnalyticsActionCompleted.mock.calls[0]?.[0],
    ).not.toHaveProperty("durationMs")
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
          id: "account_token:account-1:1",
          accountName: "Account 1",
          runtimeKeyName: "Token 1",
          success: true,
          skipped: false,
        },
        {
          id: "account_token:account-1:2",
          accountName: "Account 1",
          runtimeKeyName: "Token 2",
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
    expect(call.selectedItemIds).toEqual([
      "account_token:account-1:1",
      "account_token:account-1:2",
    ])
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
          id: "account_token:account-1:9",
          accountName: "Account 1",
          runtimeKeyName: "Token 9",
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
    expect(call.selectedItemIds).toEqual(["account_token:account-1:9"])
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
          id: "account_token:account-1:1",
          accountName: "Account 1",
          runtimeKeyName: "Token 1",
          success: true,
          skipped: false,
        },
        {
          id: "account_token:account-1:2",
          accountName: "Account 1",
          runtimeKeyName: "Token 2",
          success: false,
          skipped: false,
          error: "warning item failed",
        },
        {
          id: "account_token:account-1:3",
          accountName: "Account 1",
          runtimeKeyName: "Token 3",
          success: false,
          skipped: true,
        },
        {
          id: "account_token:account-1:4",
          accountName: "Account 1",
          runtimeKeyName: "Token 4",
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
          id: "account_token:account-1:1",
          accountName: "Account 1",
          runtimeKeyName: "Token 1",
          success: false,
          skipped: false,
          error:
            MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.CONFIG_MISSING,
        },
        {
          id: "account_token:account-1:2",
          accountName: "Account 1",
          runtimeKeyName: "Token 2",
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
          buildDialogPreviewItem(5, "Token 5", {
            status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED,
            warningCodes: [],
            blockingReasonCode: "unknown-reason" as any,
            blockingMessage: "custom detail",
            draft: null,
          }),
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
          id: "account_token:account-1:1",
          accountName: "Account 1",
          runtimeKeyName: "Token 1",
          success: false,
          skipped: false,
          error: "   ",
        },
        {
          id: "account_token:account-1:2",
          accountName: "Account 1",
          runtimeKeyName: "Token 2",
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
      siteType: SITE_TYPES.NEW_API,
      totalCount: 6,
      readyCount: 0,
      warningCount: 0,
      skippedCount: 0,
      blockedCount: 6,
      items: [
        buildDialogPreviewItem(11, "Token 11", {
          status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED,
          warningCodes: [],
          blockingReasonCode:
            MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.SECRET_RESOLUTION_FAILED,
          blockingMessage: "secret issue",
          draft: null,
        }),
        buildDialogPreviewItem(12, "Token 12", {
          status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED,
          warningCodes: [],
          blockingReasonCode:
            MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.NAME_REQUIRED,
          draft: null,
        }),
        buildDialogPreviewItem(13, "Token 13", {
          status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED,
          warningCodes: [],
          blockingReasonCode:
            MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.KEY_REQUIRED,
          draft: null,
        }),
        buildDialogPreviewItem(14, "Token 14", {
          status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED,
          warningCodes: [],
          blockingReasonCode:
            MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.REAL_KEY_REQUIRED,
          draft: null,
        }),
        buildDialogPreviewItem(15, "Token 15", {
          status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED,
          warningCodes: [],
          blockingReasonCode:
            MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.MODELS_REQUIRED,
          draft: null,
        }),
        buildDialogPreviewItem(16, "Token 16", {
          status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED,
          warningCodes: [],
          blockingReasonCode:
            MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.INPUT_PREPARATION_FAILED,
          draft: null,
        }),
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
