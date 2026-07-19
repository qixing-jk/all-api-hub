import { fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import RowActions from "~/features/ManagedSiteChannels/components/RowActions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import type { NewApiChannel } from "~/types/newApi"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const createDeferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}

const mockTrackProductAnalyticsActionStarted = vi.fn()

vi.mock("~/services/productAnalytics/actions", () => ({
  trackProductAnalyticsActionStarted: (...args: unknown[]) =>
    mockTrackProductAnalyticsActionStarted(...args),
}))

vi.mock("~/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div role="menu">{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    disabled,
    onClick,
  }: {
    children: ReactNode
    disabled?: boolean
    onClick?: () => void
  }) => (
    <button disabled={disabled} onClick={onClick} role="menuitem">
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}))

const labels = {
  trigger: "open actions",
  edit: "Edit",
  view: "View",
  migrate: "Migrate",
  sync: "Sync",
  syncing: "Syncing",
  openSync: "Open sync",
  filters: "Filters",
  delete: "Delete",
}

const channel: NewApiChannel = {
  id: 42,
  base_url: "https://example.invalid",
  name: "Example Channel",
  key: "example-key",
  type: 1,
  models: "gpt-4o",
  status: 1,
  weight: 0,
  priority: 0,
  openai_organization: null,
  test_model: null,
  created_time: 0,
  test_time: 0,
  response_time: 0,
  other: "",
  balance: 0,
  balance_updated_time: 0,
  group: "default",
  used_quota: 0,
  model_mapping: "",
  status_code_mapping: "",
  auto_ban: 0,
  other_info: "",
  tag: null,
  param_override: null,
  header_override: null,
  remark: null,
  channel_info: {
    is_multi_key: false,
    multi_key_size: 0,
    multi_key_status_list: null,
    multi_key_polling_index: 0,
    multi_key_mode: "",
  },
  setting: "",
  settings: "",
}

const setup = (props: Partial<Parameters<typeof RowActions>[0]> = {}) => {
  const defaultProps = {
    channel,
    onEdit: vi.fn(),
    onView: vi.fn(),
    onMigrate: vi.fn(),
    onDelete: vi.fn(),
    onSync: vi.fn().mockResolvedValue(undefined),
    onOpenSync: vi.fn(),
    onFilters: vi.fn(),
    canMigrate: true,
    showMigrationAction: false,
    showNewApiOnlyActions: true,
    isSyncing: false,
    labels,
  }

  const mergedProps = { ...defaultProps, ...props }
  render(<RowActions {...mergedProps} />, {
    withReleaseUpdateStatusProvider: false,
    withThemeProvider: false,
    withUserPreferencesProvider: false,
  })

  return mergedProps
}

const expectRowActionTracked = (
  actionId: (typeof PRODUCT_ANALYTICS_ACTION_IDS)[keyof typeof PRODUCT_ANALYTICS_ACTION_IDS],
) => {
  expect(mockTrackProductAnalyticsActionStarted).toHaveBeenCalledWith({
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
    actionId,
    surfaceId:
      PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsRowActions,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  })
}

describe("ManagedSiteChannels RowActions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders standard row actions and routes callbacks", async () => {
    const user = userEvent.setup()
    const props = setup()

    await user.click(screen.getByRole("menuitem", { name: labels.edit }))
    await user.click(screen.getByRole("menuitem", { name: labels.filters }))
    await user.click(screen.getByRole("menuitem", { name: labels.openSync }))
    await user.click(screen.getByRole("menuitem", { name: labels.sync }))
    await user.click(screen.getByRole("menuitem", { name: labels.delete }))

    expect(props.onEdit).toHaveBeenCalledWith(channel)
    expect(props.onFilters).toHaveBeenCalledWith(channel)
    expect(props.onOpenSync).toHaveBeenCalledWith(channel.id)
    expect(props.onSync).toHaveBeenCalledWith([channel.id])
    expect(props.onDelete).toHaveBeenCalledWith([channel.id])
    expect(screen.queryByRole("menuitem", { name: labels.view })).toBeNull()
    expect(screen.queryByRole("menuitem", { name: labels.migrate })).toBeNull()
    expectRowActionTracked(
      PRODUCT_ANALYTICS_ACTION_IDS.UpdateManagedSiteChannel,
    )
    expectRowActionTracked(
      PRODUCT_ANALYTICS_ACTION_IDS.OpenManagedSiteChannelFilters,
    )
    expectRowActionTracked(
      PRODUCT_ANALYTICS_ACTION_IDS.OpenManagedSiteChannelModelSync,
    )
  })

  it("hides New API-only actions for incompatible managed sites", () => {
    setup({ showNewApiOnlyActions: false })

    expect(
      screen.getByRole("menuitem", { name: labels.edit }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("menuitem", { name: labels.delete }),
    ).toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: labels.filters })).toBeNull()
    expect(screen.queryByRole("menuitem", { name: labels.openSync })).toBeNull()
    expect(screen.queryByRole("menuitem", { name: labels.sync })).toBeNull()
  })

  it("does not coerce string native ids for edit and delete row actions", async () => {
    const user = userEvent.setup()
    const nativeIdChannel = {
      ...channel,
      id: "gid://axonhub/Channel/native-string-id" as unknown as number,
    }
    const props = setup({
      channel: nativeIdChannel,
      showNewApiOnlyActions: false,
    })

    await user.click(screen.getByRole("menuitem", { name: labels.edit }))
    await user.click(screen.getByRole("menuitem", { name: labels.delete }))

    expect(props.onEdit).toHaveBeenCalledWith(nativeIdChannel)
    expect(props.onDelete).toHaveBeenCalledWith([
      "gid://axonhub/Channel/native-string-id",
    ])
  })

  it("renders migration actions and disables migration without targets", async () => {
    const user = userEvent.setup()
    const props = setup({
      canMigrate: false,
      showMigrationAction: true,
    })

    await user.click(screen.getByRole("menuitem", { name: labels.view }))

    const migrate = screen.getByRole("menuitem", { name: labels.migrate })
    expect(migrate).toBeDisabled()
    expect(screen.queryByRole("menuitem", { name: labels.edit })).toBeNull()
    expect(screen.queryByRole("menuitem", { name: labels.delete })).toBeNull()
    expect(props.onView).toHaveBeenCalledWith(channel)
    expect(props.onMigrate).not.toHaveBeenCalled()
    expectRowActionTracked(PRODUCT_ANALYTICS_ACTION_IDS.ViewManagedSiteChannel)
  })

  it("keeps an externally syncing row locked without announcing local work", () => {
    setup({ isSyncing: true })

    const trigger = screen.getByRole("button", { name: labels.trigger })
    expect(trigger).toBeDisabled()
    expect(trigger).not.toHaveAttribute("aria-busy")
  })

  it("marks only locally initiated sync as busy and suppresses duplicate syncs", async () => {
    const deferredSync = createDeferred()
    const onSync = vi.fn(() => deferredSync.promise)
    setup({ onSync })

    const syncItem = screen.getByRole("menuitem", { name: labels.sync })
    fireEvent.click(syncItem)
    fireEvent.click(syncItem)

    const trigger = screen.getByRole("button", { name: labels.trigger })
    expect(onSync).toHaveBeenCalledTimes(1)
    expect(trigger).toBeDisabled()
    expect(trigger).toHaveAttribute("aria-busy", "true")
    expect(trigger).toHaveAccessibleName(labels.trigger)

    deferredSync.resolve()

    await waitFor(() => {
      expect(trigger).toBeEnabled()
    })
    expect(trigger).not.toHaveAttribute("aria-busy")
  })
})
