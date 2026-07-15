import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AXON_HUB_CHANNEL_TYPE } from "~/constants/axonHub"
import { CLAUDE_CODE_HUB_PROVIDER_TYPE } from "~/constants/claudeCodeHub"
import { SITE_TYPES } from "~/constants/siteType"
import { ManagedSiteChannelMigrationDialog } from "~/features/ManagedSiteChannels/components/ManagedSiteChannelMigrationDialog"
import {
  executeManagedSiteChannelMigration,
  prepareManagedSiteChannelMigrationPreview,
} from "~/services/managedSites/channelMigration"
import type { ProductAnalyticsActionInsights } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MANAGED_SITE_TYPES,
  PRODUCT_ANALYTICS_RESULTS,
  type ProductAnalyticsResult,
} from "~/services/productAnalytics/contracts"
import {
  MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES,
  MANAGED_SITE_CHANNEL_MIGRATION_GENERAL_WARNING_CODES,
  MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES,
} from "~/types/managedSiteMigration"
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "~~/tests/test-utils/render"

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, reject, resolve }
}

const {
  mockPreparePreview,
  mockExecuteMigration,
  mockTrackProductAnalyticsActionStarted,
  mockTrackProductAnalyticsActionCompleted,
} = vi.hoisted(() => ({
  mockPreparePreview: vi.fn(),
  mockExecuteMigration: vi.fn(),
  mockTrackProductAnalyticsActionStarted: vi.fn(),
  mockTrackProductAnalyticsActionCompleted: vi.fn(),
}))

vi.mock("~/services/managedSites/channelMigration", () => ({
  prepareManagedSiteChannelMigrationPreview: mockPreparePreview,
  executeManagedSiteChannelMigration: mockExecuteMigration,
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  trackProductAnalyticsActionStarted: (...args: any[]) =>
    mockTrackProductAnalyticsActionStarted(...args),
  trackProductAnalyticsActionCompleted: (...args: any[]) =>
    mockTrackProductAnalyticsActionCompleted(...args),
}))

vi.mock("~/services/managedSites/utils/managedSite", () => ({
  getManagedSiteLabel: (_t: unknown, siteType: string) => `site:${siteType}`,
}))

vi.mock("~/components/Tooltip", () => ({
  default: ({
    children,
    content,
  }: {
    children: ReactNode
    content: ReactNode
  }) => (
    <div>
      {children}
      <div>{content}</div>
    </div>
  ),
}))

vi.mock("~/components/ui", () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Button: ({
    children,
    onClick,
    disabled,
    loading,
    "aria-busy": ariaBusy,
  }: {
    children: ReactNode
    onClick?: () => void
    disabled?: boolean
    loading?: boolean
    "aria-busy"?: boolean | "false" | "true"
  }) => (
    <button
      disabled={disabled || loading}
      aria-busy={loading ? true : ariaBusy}
      onClick={() => onClick?.()}
    >
      {children}
    </button>
  ),
  CollapsibleSection: ({
    title,
    children,
  }: {
    title: ReactNode
    children: ReactNode
  }) => (
    <section>
      <div>{title}</div>
      <div>{children}</div>
    </section>
  ),
  DestructiveConfirmDialog: ({
    isOpen,
    title,
    description,
    onClose,
    onConfirm,
    cancelLabel,
    confirmLabel,
  }: {
    isOpen: boolean
    title: ReactNode
    description?: ReactNode
    onClose: () => void
    onConfirm: () => void
    cancelLabel: ReactNode
    confirmLabel: ReactNode
  }) =>
    isOpen ? (
      <div role="alertdialog">
        <div>{title}</div>
        <div>{description}</div>
        <button onClick={onClose}>{cancelLabel}</button>
        <button onClick={onConfirm}>{confirmLabel}</button>
      </div>
    ) : null,
  Modal: ({
    isOpen,
    header,
    children,
    footer,
    onClose,
  }: {
    isOpen: boolean
    header?: ReactNode
    children: ReactNode
    footer?: ReactNode
    onClose: () => void
  }) =>
    isOpen ? (
      <div role="dialog">
        {header}
        <button onClick={onClose}>modal-close</button>
        {children}
        {footer}
      </div>
    ) : null,
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <div data-value={value}>{children}</div>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <div>{placeholder}</div>
  ),
}))

const mockedPreparePreview =
  prepareManagedSiteChannelMigrationPreview as unknown as ReturnType<
    typeof vi.fn
  >
const mockedExecuteMigration =
  executeManagedSiteChannelMigration as unknown as ReturnType<typeof vi.fn>

const availableTargets = [
  { siteType: "done-hub", label: "DoneHub" },
  { siteType: SITE_TYPES.OCTOPUS, label: "Octopus" },
] as any

const channels = [
  {
    id: 1,
    name: "Alpha",
    type: 1,
    status: 2,
    base_url: "https://alpha.example",
  },
  { id: 2, name: "Beta", type: 1, status: 1, base_url: "https://beta.example" },
] as any

const previewPayload = {
  targetSiteType: SITE_TYPES.OCTOPUS,
  readyCount: 1,
  blockedCount: 1,
  totalCount: 2,
  generalWarningCodes: [
    MANAGED_SITE_CHANNEL_MIGRATION_GENERAL_WARNING_CODES.CREATE_ONLY,
    MANAGED_SITE_CHANNEL_MIGRATION_GENERAL_WARNING_CODES.NO_DEDUPE_OR_SYNC,
    MANAGED_SITE_CHANNEL_MIGRATION_GENERAL_WARNING_CODES.NO_ROLLBACK,
  ],
  items: [
    {
      channelId: 1,
      channelName: "Alpha",
      status: "blocked",
      blockingReasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
      blockingMessage: "Need a source key",
      warningCodes: [
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.DROPS_MODEL_MAPPING,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.DROPS_STATUS_CODE_MAPPING,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.DROPS_ADVANCED_SETTINGS,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.DROPS_MULTI_KEY_STATE,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_REMAPS_CHANNEL_TYPE,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_NORMALIZES_BASE_URL,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_FORCES_DEFAULT_GROUP,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_IGNORES_PRIORITY,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_IGNORES_WEIGHT,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_SIMPLIFIES_STATUS,
      ],
      sourceChannel: {
        base_url: "https://alpha.example",
        type: 1,
        models: "gpt-4o, claude-3",
        group: "default, vip",
        priority: 8,
        weight: 12,
        status: 2,
      },
      draft: {
        base_url: "https://alpha.example/v1",
        type: 3,
        models: ["gpt-4o"],
        groups: ["default"],
        priority: 0,
        weight: 0,
        status: 3,
      },
    },
    {
      channelId: 2,
      channelName: "Beta",
      status: "ready",
      blockingReasonCode: undefined,
      blockingMessage: undefined,
      warningCodes: [],
      sourceChannel: {
        base_url: "https://beta.example",
        type: 1,
        models: "",
        group: "",
        priority: 0,
        weight: 0,
        status: 1,
      },
      draft: {
        base_url: "https://beta.example/v1",
        type: 2,
        models: [],
        groups: [],
        priority: 1,
        weight: 1,
        status: 0,
      },
    },
  ],
} as any

describe("ManagedSiteChannelMigrationDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedPreparePreview.mockResolvedValue(previewPayload)
    mockedExecuteMigration.mockResolvedValue({
      createdCount: 1,
      failedCount: 1,
      skippedCount: 1,
      totalSelected: 3,
      items: [
        { channelId: 1, channelName: "Alpha", success: true },
        {
          channelId: 2,
          channelName: "Beta",
          success: false,
          skipped: true,
        },
        {
          channelId: 3,
          channelName: "Gamma",
          success: false,
          skipped: false,
          error: "create failed",
        },
      ],
    })
  })

  it("distinguishes automatic target previews from manual refresh loading", async () => {
    const initialPreview = createDeferred<typeof previewPayload>()
    const targetPreview = createDeferred<typeof previewPayload>()
    const manualPreview = createDeferred<typeof previewPayload>()
    mockedPreparePreview
      .mockReturnValueOnce(initialPreview.promise)
      .mockReturnValueOnce(targetPreview.promise)
      .mockReturnValueOnce(manualPreview.promise)
    const preferences = {} as any

    const { rerender } = render(
      <ManagedSiteChannelMigrationDialog
        isOpen={true}
        onClose={vi.fn()}
        channels={channels}
        preferences={preferences}
        sourceSiteType={SITE_TYPES.NEW_API}
        availableTargets={availableTargets}
      />,
    )

    const automaticallyLockedStart = await screen.findByRole("button", {
      name: "managedSiteChannels:migration.actions.start",
    })
    expect(automaticallyLockedStart).toBeDisabled()
    expect(automaticallyLockedStart).not.toHaveAttribute("aria-busy")
    const automaticallyLockedRefresh = screen.getByRole("button", {
      name: "managedSiteChannels:migration.actions.refreshPreview",
    })
    expect(automaticallyLockedRefresh).toBeDisabled()
    expect(automaticallyLockedRefresh).not.toHaveAttribute("aria-busy")

    await act(async () => {
      initialPreview.resolve(previewPayload)
      await initialPreview.promise
    })
    expect(
      await screen.findByText(
        "managedSiteChannels:migration.preview.status.ready",
      ),
    ).toBeInTheDocument()

    rerender(
      <ManagedSiteChannelMigrationDialog
        isOpen={true}
        onClose={vi.fn()}
        channels={channels}
        preferences={preferences}
        sourceSiteType={SITE_TYPES.NEW_API}
        availableTargets={
          [{ siteType: SITE_TYPES.OCTOPUS, label: "Octopus" }] as any
        }
      />,
    )

    await waitFor(() => {
      expect(mockedPreparePreview).toHaveBeenCalledTimes(2)
    })
    const targetLockedStart = screen.getByRole("button", {
      name: "managedSiteChannels:migration.actions.start",
    })
    expect(targetLockedStart).toBeDisabled()
    expect(targetLockedStart).not.toHaveAttribute("aria-busy")
    const targetLockedRefresh = screen.getByRole("button", {
      name: "managedSiteChannels:migration.actions.refreshPreview",
    })
    expect(targetLockedRefresh).toBeDisabled()
    expect(targetLockedRefresh).not.toHaveAttribute("aria-busy")

    await act(async () => {
      targetPreview.resolve(previewPayload)
      await targetPreview.promise
    })
    const idleRefresh = await screen.findByRole("button", {
      name: "managedSiteChannels:migration.actions.refreshPreview",
    })
    fireEvent.click(idleRefresh)

    const manuallyBusyRefresh = screen.queryByRole("button", {
      name: "managedSiteChannels:migration.preview.loading",
    })
    const manualRefreshState = manuallyBusyRefresh
      ? {
          ariaBusy: manuallyBusyRefresh.getAttribute("aria-busy"),
          disabled: manuallyBusyRefresh.hasAttribute("disabled"),
        }
      : null
    const manualLoadingLabelCount = screen.queryAllByText(
      "managedSiteChannels:migration.preview.loading",
    ).length
    const manuallyLockedStart = screen.getByRole("button", {
      name: "managedSiteChannels:migration.actions.start",
    })
    const manualStartState = {
      ariaBusy: manuallyLockedStart.getAttribute("aria-busy"),
      disabled: manuallyLockedStart.hasAttribute("disabled"),
    }
    if (manuallyBusyRefresh) fireEvent.click(manuallyBusyRefresh)

    await act(async () => {
      manualPreview.resolve(previewPayload)
      await manualPreview.promise
    })
    expect(manualRefreshState).toEqual({ ariaBusy: "true", disabled: true })
    expect(manualLoadingLabelCount).toBe(1)
    expect(manualStartState).toEqual({ ariaBusy: null, disabled: true })
    expect(mockedPreparePreview).toHaveBeenCalledTimes(3)
    expect(
      await screen.findByRole("button", {
        name: "managedSiteChannels:migration.actions.refreshPreview",
      }),
    ).toBeEnabled()
  })

  it("prepares one preview when preferences and derived targets change together", async () => {
    const refreshedPreview = createDeferred<typeof previewPayload>()
    const initialPreferences = {} as any
    const nextPreferences = { newApiBaseUrl: "https://example.invalid" } as any
    mockedPreparePreview
      .mockResolvedValueOnce(previewPayload)
      .mockReturnValue(refreshedPreview.promise)

    const { rerender } = render(
      <ManagedSiteChannelMigrationDialog
        isOpen={true}
        onClose={vi.fn()}
        channels={channels}
        preferences={initialPreferences}
        sourceSiteType={SITE_TYPES.NEW_API}
        availableTargets={availableTargets}
      />,
    )

    await screen.findByText(
      "managedSiteChannels:migration.preview.status.ready",
    )
    expect(mockedPreparePreview).toHaveBeenCalledTimes(1)

    rerender(
      <ManagedSiteChannelMigrationDialog
        isOpen={true}
        onClose={vi.fn()}
        channels={channels}
        preferences={nextPreferences}
        sourceSiteType={SITE_TYPES.NEW_API}
        availableTargets={[...availableTargets] as any}
      />,
    )

    await waitFor(() => {
      expect(mockedPreparePreview.mock.calls.length).toBeGreaterThan(1)
    })
    await act(async () => {
      refreshedPreview.resolve(previewPayload)
      await refreshedPreview.promise
    })

    expect(mockedPreparePreview).toHaveBeenCalledTimes(2)
    expect(mockedPreparePreview).toHaveBeenLastCalledWith(
      expect.objectContaining({
        preferences: nextPreferences,
        targetSiteType: "done-hub",
      }),
    )
  })

  it("prepares only the replacement when the selected target becomes unavailable", async () => {
    const replacementPreview = createDeferred<typeof previewPayload>()
    const nextPreferences = { newApiBaseUrl: "https://example.invalid" } as any
    mockedPreparePreview.mockResolvedValueOnce(previewPayload)

    const { rerender } = render(
      <ManagedSiteChannelMigrationDialog
        isOpen={true}
        onClose={vi.fn()}
        channels={channels}
        preferences={{} as any}
        sourceSiteType={SITE_TYPES.NEW_API}
        availableTargets={[{ siteType: "done-hub", label: "DoneHub" }] as any}
      />,
    )

    await screen.findByText(
      "managedSiteChannels:migration.preview.status.ready",
    )
    mockedPreparePreview.mockReset()
    mockedPreparePreview.mockReturnValue(replacementPreview.promise)

    rerender(
      <ManagedSiteChannelMigrationDialog
        isOpen={true}
        onClose={vi.fn()}
        channels={channels}
        preferences={nextPreferences}
        sourceSiteType={SITE_TYPES.NEW_API}
        availableTargets={
          [{ siteType: SITE_TYPES.OCTOPUS, label: "Octopus" }] as any
        }
      />,
    )

    await waitFor(() => {
      expect(mockedPreparePreview.mock.calls.length).toBeGreaterThan(0)
    })
    await act(async () => {
      replacementPreview.resolve(previewPayload)
      await replacementPreview.promise
    })

    expect(mockedPreparePreview).toHaveBeenCalledTimes(1)
    expect(mockedPreparePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        preferences: nextPreferences,
        targetSiteType: SITE_TYPES.OCTOPUS,
      }),
    )
  })

  it("does not prepare or remain loading when all targets become unavailable", async () => {
    const obsoletePreview = createDeferred<typeof previewPayload>()
    const nextPreferences = { newApiBaseUrl: "https://example.invalid" } as any
    mockedPreparePreview.mockResolvedValueOnce(previewPayload)

    const { rerender } = render(
      <ManagedSiteChannelMigrationDialog
        isOpen={true}
        onClose={vi.fn()}
        channels={channels}
        preferences={{} as any}
        sourceSiteType={SITE_TYPES.NEW_API}
        availableTargets={[{ siteType: "done-hub", label: "DoneHub" }] as any}
      />,
    )

    await screen.findByText(
      "managedSiteChannels:migration.preview.status.ready",
    )
    mockedPreparePreview.mockReset()
    mockedPreparePreview.mockReturnValue(obsoletePreview.promise)

    rerender(
      <ManagedSiteChannelMigrationDialog
        isOpen={true}
        onClose={vi.fn()}
        channels={channels}
        preferences={nextPreferences}
        sourceSiteType={SITE_TYPES.NEW_API}
        availableTargets={[]}
      />,
    )

    await screen.findByText("managedSiteChannels:migration.target.unselected")
    const obsoleteRequestCount = mockedPreparePreview.mock.calls.length
    const hasStuckLoadingStatus = Boolean(
      screen.queryByText("managedSiteChannels:migration.preview.loading"),
    )
    await act(async () => {
      obsoletePreview.resolve(previewPayload)
      await obsoletePreview.promise
    })

    expect(obsoleteRequestCount).toBe(0)
    expect(hasStuckLoadingStatus).toBe(false)
  })

  it("loads the preview on open and renders ready, blocked, and warning details", async () => {
    render(
      <ManagedSiteChannelMigrationDialog
        isOpen={true}
        onClose={vi.fn()}
        channels={channels}
        preferences={{} as any}
        sourceSiteType={SITE_TYPES.NEW_API}
        availableTargets={availableTargets}
      />,
    )

    await waitFor(() => {
      expect(mockedPreparePreview).toHaveBeenCalledWith(
        expect.objectContaining({
          channels,
          preferences: {},
          sourceSiteType: SITE_TYPES.NEW_API,
          targetSiteType: "done-hub",
        }),
      )
    })

    expect(
      await screen.findByText(
        "managedSiteChannels:migration.preview.status.blocked",
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText("managedSiteChannels:migration.preview.status.ready"),
    ).toBeInTheDocument()
    expect(
      screen.getAllByText(
        "managedSiteChannels:migration.itemWarnings.dropsModelMapping",
      ).length,
    ).toBeGreaterThan(0)
    expect(
      screen.getAllByText(
        "managedSiteChannels:migration.blockedReasons.sourceKeyMissing",
      ).length,
    ).toBeGreaterThan(0)
    expect(screen.getAllByText("Need a source key").length).toBeGreaterThan(0)
    expect(screen.getByText("site:new-api")).toBeInTheDocument()
    expect(screen.getAllByText("site:done-hub").length).toBeGreaterThan(0)
  })

  it("renders AxonHub string channel type labels and unknown type fallbacks", async () => {
    mockedPreparePreview.mockResolvedValueOnce({
      ...previewPayload,
      targetSiteType: SITE_TYPES.AXON_HUB,
      items: [
        {
          ...previewPayload.items[0],
          draft: {
            ...previewPayload.items[0].draft,
            type: AXON_HUB_CHANNEL_TYPE.ANTHROPIC,
          },
        },
        {
          ...previewPayload.items[1],
          draft: {
            ...previewPayload.items[1].draft,
            type: "future-provider",
          },
        },
        {
          channelId: 3,
          channelName: "Missing Type",
          status: "ready",
          blockingReasonCode: undefined,
          blockingMessage: undefined,
          warningCodes: [],
          sourceChannel: {
            base_url: "https://missing-type.example",
            type: 1,
            models: "gpt-4o",
            group: "default",
            priority: 0,
            weight: 0,
            status: 1,
          },
          draft: {
            base_url: "https://missing-type.example/v1",
            type: undefined,
            models: ["gpt-4o"],
            groups: ["default"],
            priority: 0,
            weight: 0,
            status: 1,
          },
        },
      ],
    })

    render(
      <ManagedSiteChannelMigrationDialog
        isOpen={true}
        onClose={vi.fn()}
        channels={channels}
        preferences={{} as any}
        sourceSiteType={SITE_TYPES.NEW_API}
        availableTargets={
          [{ siteType: SITE_TYPES.AXON_HUB, label: "AxonHub" }] as any
        }
      />,
    )

    expect(await screen.findByText("Anthropic")).toBeInTheDocument()
    expect(screen.getByText("future-provider")).toBeInTheDocument()

    const missingTypeSection = screen
      .getByText("Missing Type")
      .closest("section")
    expect(missingTypeSection).toBeTruthy()
    expect(within(missingTypeSection!).getByText("—")).toBeInTheDocument()
  })

  it("renders Claude Code Hub string provider type labels and unknown type fallbacks", async () => {
    mockedPreparePreview.mockResolvedValueOnce({
      ...previewPayload,
      targetSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
      items: [
        {
          ...previewPayload.items[0],
          draft: {
            ...previewPayload.items[0].draft,
            type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
          },
        },
        {
          ...previewPayload.items[1],
          draft: {
            ...previewPayload.items[1].draft,
            type: "future-provider",
          },
        },
      ],
    })

    render(
      <ManagedSiteChannelMigrationDialog
        isOpen={true}
        onClose={vi.fn()}
        channels={channels}
        preferences={{} as any}
        sourceSiteType={SITE_TYPES.NEW_API}
        availableTargets={
          [
            { siteType: SITE_TYPES.CLAUDE_CODE_HUB, label: "Claude Code Hub" },
          ] as any
        }
      />,
    )

    expect(
      await screen.findByText("Claude (Anthropic Messages API)"),
    ).toBeInTheDocument()
    expect(screen.getByText("future-provider")).toBeInTheDocument()
  })

  it("renders target draft preparation blockers with channel wording", async () => {
    mockedPreparePreview.mockResolvedValueOnce({
      ...previewPayload,
      readyCount: 0,
      blockedCount: 1,
      totalCount: 1,
      items: [
        {
          ...previewPayload.items[0],
          status: "blocked",
          draft: null,
          blockingReasonCode:
            MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.TARGET_DRAFT_PREPARATION_FAILED,
          blockingMessage: "Target draft failed",
          warningCodes: [],
        },
      ],
    })

    render(
      <ManagedSiteChannelMigrationDialog
        isOpen={true}
        onClose={vi.fn()}
        channels={channels}
        preferences={{} as any}
        sourceSiteType={SITE_TYPES.NEW_API}
        availableTargets={availableTargets}
      />,
    )

    expect(
      await screen.findAllByText(
        "managedSiteChannels:migration.blockedReasons.targetDraftPreparationFailed",
      ),
    ).not.toHaveLength(0)
    expect(screen.getAllByText("Target draft failed").length).toBeGreaterThan(0)
  })

  it("restores manual preview refresh after rejection and allows retry", async () => {
    const failedManualRefresh = createDeferred<typeof previewPayload>()
    const successfulRetry = createDeferred<typeof previewPayload>()
    mockedPreparePreview
      .mockRejectedValueOnce(new Error("preview failed"))
      .mockReturnValueOnce(failedManualRefresh.promise)
      .mockReturnValueOnce(successfulRetry.promise)

    render(
      <ManagedSiteChannelMigrationDialog
        isOpen={true}
        onClose={vi.fn()}
        channels={channels}
        preferences={{} as any}
        sourceSiteType={SITE_TYPES.NEW_API}
        availableTargets={availableTargets}
      />,
    )

    expect(
      await screen.findByText(
        "managedSiteChannels:migration.preview.loadFailed",
      ),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:migration.actions.refreshPreview",
      }),
    )

    const busyRefresh = screen.queryByRole("button", {
      name: "managedSiteChannels:migration.preview.loading",
    })
    const busyRefreshState = busyRefresh
      ? {
          ariaBusy: busyRefresh.getAttribute("aria-busy"),
          disabled: busyRefresh.hasAttribute("disabled"),
        }
      : null
    if (busyRefresh) fireEvent.click(busyRefresh)

    await act(async () => {
      failedManualRefresh.reject(new Error("manual refresh failed"))
      await failedManualRefresh.promise.catch(() => undefined)
    })
    const restoredRefresh = await screen.findByRole("button", {
      name: "managedSiteChannels:migration.actions.refreshPreview",
    })
    const restoredRefreshState = {
      ariaBusy: restoredRefresh.getAttribute("aria-busy"),
      disabled: restoredRefresh.hasAttribute("disabled"),
    }
    fireEvent.click(restoredRefresh)
    await waitFor(() => {
      expect(mockedPreparePreview).toHaveBeenCalledTimes(3)
    })

    await act(async () => {
      successfulRetry.resolve(previewPayload)
      await successfulRetry.promise
    })

    expect(busyRefreshState).toEqual({ ariaBusy: "true", disabled: true })
    expect(mockedPreparePreview).toHaveBeenCalledTimes(3)
    expect(restoredRefreshState).toEqual({ ariaBusy: null, disabled: false })

    expect(
      await screen.findByText(
        "managedSiteChannels:migration.preview.status.ready",
      ),
    ).toBeInTheDocument()
  })

  it("hands confirmed execution loading to the stable start control", async () => {
    const execution =
      createDeferred<
        Awaited<ReturnType<typeof executeManagedSiteChannelMigration>>
      >()
    mockedExecuteMigration.mockReturnValueOnce(execution.promise)

    render(
      <ManagedSiteChannelMigrationDialog
        isOpen={true}
        onClose={vi.fn()}
        channels={channels}
        preferences={{} as any}
        sourceSiteType={SITE_TYPES.NEW_API}
        availableTargets={availableTargets}
      />,
    )

    await screen.findByText(
      "managedSiteChannels:migration.preview.status.ready",
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:migration.actions.start",
      }),
    )
    const confirmation = await screen.findByRole("alertdialog")
    fireEvent.click(
      within(confirmation).getByRole("button", {
        name: "managedSiteChannels:migration.confirm.confirm",
      }),
    )

    expect(screen.queryByRole("alertdialog")).toBeNull()
    const runningStart = screen.getByRole("button", {
      name: "managedSiteChannels:migration.actions.running",
    })
    const runningStartState = {
      ariaBusy: runningStart.getAttribute("aria-busy"),
      disabled: runningStart.hasAttribute("disabled"),
    }
    const lockedCancel = screen.getByRole("button", {
      name: "managedSiteChannels:migration.actions.cancel",
    })
    const lockedCancelState = {
      ariaBusy: lockedCancel.getAttribute("aria-busy"),
      disabled: lockedCancel.hasAttribute("disabled"),
    }
    fireEvent.click(runningStart)

    await act(async () => {
      execution.reject(new Error("execution failed"))
      await execution.promise.catch(() => undefined)
    })

    const restoredStart = await screen.findByRole("button", {
      name: "managedSiteChannels:migration.actions.start",
    })
    expect(runningStartState).toEqual({ ariaBusy: "true", disabled: true })
    expect(lockedCancelState).toEqual({ ariaBusy: null, disabled: true })
    expect(mockedExecuteMigration).toHaveBeenCalledTimes(1)
    expect(restoredStart).not.toHaveAttribute("aria-busy")
  })

  it("executes the confirmed migration and renders execution results", async () => {
    render(
      <ManagedSiteChannelMigrationDialog
        isOpen={true}
        onClose={vi.fn()}
        channels={channels}
        preferences={{} as any}
        sourceSiteType={SITE_TYPES.NEW_API}
        availableTargets={availableTargets}
      />,
    )

    await screen.findByText(
      "managedSiteChannels:migration.preview.status.ready",
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:migration.actions.start",
      }),
    )

    expect(await screen.findByRole("alertdialog")).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:migration.confirm.confirm",
      }),
    )

    await waitFor(() => {
      expect(mockedExecuteMigration).toHaveBeenCalledWith({
        preview: previewPayload,
      })
    })

    expect(
      await screen.findByText("managedSiteChannels:migration.results.title"),
    ).toBeInTheDocument()
    expect(screen.getByText("Alpha")).toBeInTheDocument()
    expect(screen.getByText("Beta")).toBeInTheDocument()
    expect(screen.getByText("Gamma")).toBeInTheDocument()
    expect(screen.getByText("create failed")).toBeInTheDocument()
    expect(
      screen.getByText("managedSiteChannels:migration.results.status.success"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("managedSiteChannels:migration.results.status.skipped"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("managedSiteChannels:migration.results.status.failed"),
    ).toBeInTheDocument()
  })

  it("tracks confirmed migration execution success with aggregate-only insights", async () => {
    render(
      <ManagedSiteChannelMigrationDialog
        isOpen={true}
        onClose={vi.fn()}
        channels={channels}
        preferences={{} as any}
        sourceSiteType={SITE_TYPES.NEW_API}
        availableTargets={availableTargets}
      />,
    )

    await screen.findByText(
      "managedSiteChannels:migration.preview.status.ready",
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:migration.actions.start",
      }),
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:migration.confirm.confirm",
      }),
    )

    await waitFor(() => {
      expect(mockedExecuteMigration).toHaveBeenCalledWith({
        preview: previewPayload,
      })
    })

    expect(mockTrackProductAnalyticsActionStarted).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.MigrateManagedSiteChannels,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(mockTrackProductAnalyticsActionCompleted).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.MigrateManagedSiteChannels,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      insights: {
        itemCount: 3,
        selectedCount: 3,
        successCount: 1,
        failureCount: 1,
        sourceManagedSiteType: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.NewApi,
        targetManagedSiteType: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.Octopus,
        readyCount: 1,
        blockedCount: 1,
        warningCount: 13,
      } satisfies ProductAnalyticsActionInsights,
    })
    expect(
      mockTrackProductAnalyticsActionCompleted.mock.calls[0]?.[0],
    ).not.toHaveProperty("durationMs")
  })

  it("tracks confirmed migration execution failure without raw error details", async () => {
    mockedExecuteMigration.mockRejectedValueOnce(new Error("private failure"))

    render(
      <ManagedSiteChannelMigrationDialog
        isOpen={true}
        onClose={vi.fn()}
        channels={channels}
        preferences={{} as any}
        sourceSiteType={SITE_TYPES.NEW_API}
        availableTargets={availableTargets}
      />,
    )

    await screen.findByText(
      "managedSiteChannels:migration.preview.status.ready",
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:migration.actions.start",
      }),
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:migration.confirm.confirm",
      }),
    )

    await waitFor(() => {
      expect(mockTrackProductAnalyticsActionCompleted).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.MigrateManagedSiteChannels,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: {
          itemCount: 1,
          selectedCount: 1,
          sourceManagedSiteType: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.NewApi,
          targetManagedSiteType: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.Octopus,
          readyCount: 1,
          blockedCount: 1,
          warningCount: 13,
          failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
        } satisfies ProductAnalyticsActionInsights,
      })
    })

    const completionCalls = mockTrackProductAnalyticsActionCompleted.mock
      .calls as Array<
      [
        {
          result: ProductAnalyticsResult
          errorCategory?: string
          insights?: ProductAnalyticsActionInsights
          error?: string
          message?: string
          durationMs?: number
        },
      ]
    >
    expect(completionCalls[0]?.[0]).not.toHaveProperty("error")
    expect(completionCalls[0]?.[0]).not.toHaveProperty("message")
    expect(completionCalls[0]?.[0]).not.toHaveProperty("durationMs")
  })

  it("prevents closing while execution is still running", async () => {
    const onClose = vi.fn()
    let resolveExecution!: (value: unknown) => void
    mockedExecuteMigration.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveExecution = resolve
      }),
    )

    render(
      <ManagedSiteChannelMigrationDialog
        isOpen={true}
        onClose={onClose}
        channels={channels}
        preferences={{} as any}
        sourceSiteType={SITE_TYPES.NEW_API}
        availableTargets={availableTargets}
      />,
    )

    await screen.findByText(
      "managedSiteChannels:migration.preview.status.ready",
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:migration.actions.start",
      }),
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:migration.confirm.confirm",
      }),
    )

    await waitFor(() => {
      expect(mockedExecuteMigration).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole("button", { name: "modal-close" }))
    expect(onClose).not.toHaveBeenCalled()

    resolveExecution({
      createdCount: 1,
      failedCount: 0,
      skippedCount: 0,
      totalSelected: 1,
      items: [{ channelId: 1, channelName: "Alpha", success: true }],
    })

    await screen.findByText("managedSiteChannels:migration.results.title")

    fireEvent.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:migration.actions.close",
      }),
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
