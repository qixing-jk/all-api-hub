import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AXON_HUB_CHANNEL_TYPE } from "~/constants/axonHub"
import { CLAUDE_CODE_HUB_PROVIDER_TYPE } from "~/constants/claudeCodeHub"
import {
  AXON_HUB,
  CLAUDE_CODE_HUB,
  NEW_API,
  OCTOPUS,
} from "~/constants/siteType"
import { ManagedSiteChannelMigrationDialog } from "~/features/ManagedSiteChannels/components/ManagedSiteChannelMigrationDialog"
import {
  executeManagedSiteChannelMigration,
  prepareManagedSiteChannelMigrationPreview,
} from "~/services/managedSites/channelMigration"
import {
  MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES,
  MANAGED_SITE_CHANNEL_MIGRATION_GENERAL_WARNING_CODES,
  MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES,
} from "~/types/managedSiteMigration"
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "~~/tests/test-utils/render"

const { mockPreparePreview, mockExecuteMigration } = vi.hoisted(() => ({
  mockPreparePreview: vi.fn(),
  mockExecuteMigration: vi.fn(),
}))

vi.mock("~/services/managedSites/channelMigration", () => ({
  prepareManagedSiteChannelMigrationPreview: mockPreparePreview,
  executeManagedSiteChannelMigration: mockExecuteMigration,
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
  }: {
    children: ReactNode
    onClick?: () => void
    disabled?: boolean
  }) => (
    <button disabled={disabled} onClick={() => onClick?.()}>
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
  { siteType: OCTOPUS, label: "Octopus" },
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
  targetSiteType: OCTOPUS,
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

  it("loads the preview on open and renders ready, blocked, and warning details", async () => {
    render(
      <ManagedSiteChannelMigrationDialog
        isOpen={true}
        onClose={vi.fn()}
        channels={channels}
        preferences={{} as any}
        sourceSiteType={NEW_API}
        availableTargets={availableTargets}
      />,
    )

    await waitFor(() => {
      expect(mockedPreparePreview).toHaveBeenCalledWith(
        expect.objectContaining({
          channels,
          preferences: {},
          sourceSiteType: NEW_API,
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
      targetSiteType: AXON_HUB,
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
        sourceSiteType={NEW_API}
        availableTargets={[{ siteType: AXON_HUB, label: "AxonHub" }] as any}
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
      targetSiteType: CLAUDE_CODE_HUB,
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
        sourceSiteType={NEW_API}
        availableTargets={
          [{ siteType: CLAUDE_CODE_HUB, label: "Claude Code Hub" }] as any
        }
      />,
    )

    expect(
      await screen.findByText("Claude (Anthropic Messages API)"),
    ).toBeInTheDocument()
    expect(screen.getByText("future-provider")).toBeInTheDocument()
  })

  it("shows preview errors and allows refreshing the preview", async () => {
    mockedPreparePreview
      .mockRejectedValueOnce(new Error("preview failed"))
      .mockResolvedValueOnce(previewPayload)

    render(
      <ManagedSiteChannelMigrationDialog
        isOpen={true}
        onClose={vi.fn()}
        channels={channels}
        preferences={{} as any}
        sourceSiteType={NEW_API}
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

    await waitFor(() => {
      expect(mockedPreparePreview).toHaveBeenCalledTimes(2)
    })

    expect(
      await screen.findByText(
        "managedSiteChannels:migration.preview.status.ready",
      ),
    ).toBeInTheDocument()
  })

  it("executes the confirmed migration and renders execution results", async () => {
    render(
      <ManagedSiteChannelMigrationDialog
        isOpen={true}
        onClose={vi.fn()}
        channels={channels}
        preferences={{} as any}
        sourceSiteType={NEW_API}
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
        sourceSiteType={NEW_API}
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
