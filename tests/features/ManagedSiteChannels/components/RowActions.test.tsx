import { fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import RowActions from "~/features/ManagedSiteChannels/components/RowActions"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const createDeferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}

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

const setup = (props: Partial<Parameters<typeof RowActions>[0]> = {}) => {
  const defaultProps = {
    rowKey: "opaque:channel:42",
    displayName: "Example Channel",
    capabilities: {
      canEdit: true,
      canView: true,
      canMigrate: true,
      canDelete: true,
      canSync: true,
      canOpenSync: true,
      canFilter: true,
    },
    onEdit: vi.fn(),
    onView: vi.fn(),
    onMigrate: vi.fn(),
    onDelete: vi.fn(),
    onSync: vi.fn().mockResolvedValue(undefined),
    onOpenSync: vi.fn(),
    onFilters: vi.fn(),
    showMigrationAction: false,
    showNewApiOnlyActions: true,
    isSyncing: false,
    labels,
    testIds: {
      trigger: "row-actions-trigger",
      edit: "row-actions-edit",
      delete: "row-actions-delete",
    },
  }

  const mergedProps = { ...defaultProps, ...props }
  render(<RowActions {...mergedProps} />, {
    withReleaseUpdateStatusProvider: false,
    withThemeProvider: false,
    withUserPreferencesProvider: false,
  })

  return mergedProps
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

    expect(props.onEdit).toHaveBeenCalledWith("opaque:channel:42")
    expect(props.onFilters).toHaveBeenCalledWith("opaque:channel:42")
    expect(props.onOpenSync).toHaveBeenCalledWith("opaque:channel:42")
    expect(props.onSync).toHaveBeenCalledWith("opaque:channel:42")
    expect(props.onDelete).toHaveBeenCalledWith("opaque:channel:42")
    expect(screen.queryByRole("menuitem", { name: labels.view })).toBeNull()
    expect(screen.queryByRole("menuitem", { name: labels.migrate })).toBeNull()
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

  it("passes opaque native row keys through without coercion", async () => {
    const user = userEvent.setup()
    const props = setup({
      rowKey: "gid://example.invalid/Channel/native-string-id",
      showNewApiOnlyActions: false,
    })

    await user.click(screen.getByRole("menuitem", { name: labels.edit }))
    await user.click(screen.getByRole("menuitem", { name: labels.delete }))

    expect(props.onEdit).toHaveBeenCalledWith(
      "gid://example.invalid/Channel/native-string-id",
    )
    expect(props.onDelete).toHaveBeenCalledWith(
      "gid://example.invalid/Channel/native-string-id",
    )
  })

  it("renders only capable migration actions", async () => {
    const user = userEvent.setup()
    const props = setup({
      capabilities: {
        canEdit: true,
        canView: true,
        canMigrate: false,
        canDelete: true,
      },
      showMigrationAction: true,
    })

    await user.click(screen.getByRole("menuitem", { name: labels.view }))

    expect(screen.queryByRole("menuitem", { name: labels.migrate })).toBeNull()
    expect(screen.queryByRole("menuitem", { name: labels.edit })).toBeNull()
    expect(screen.queryByRole("menuitem", { name: labels.delete })).toBeNull()
    expect(props.onView).toHaveBeenCalledWith("opaque:channel:42")
    expect(props.onMigrate).not.toHaveBeenCalled()
  })

  it("renders an action only when both capability and callback are present", () => {
    setup({
      capabilities: {
        canEdit: true,
        canDelete: true,
        canFilter: true,
        canOpenSync: true,
        canSync: true,
      },
      onEdit: undefined,
      onFilters: undefined,
      onOpenSync: undefined,
      onSync: undefined,
    })

    expect(screen.queryByRole("menuitem", { name: labels.edit })).toBeNull()
    expect(screen.queryByRole("menuitem", { name: labels.filters })).toBeNull()
    expect(screen.queryByRole("menuitem", { name: labels.openSync })).toBeNull()
    expect(screen.queryByRole("menuitem", { name: labels.sync })).toBeNull()
    expect(
      screen.getByRole("menuitem", { name: labels.delete }),
    ).toBeInTheDocument()
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
