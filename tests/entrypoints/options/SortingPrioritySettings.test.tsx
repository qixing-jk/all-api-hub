import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import SortingPrioritySettings from "~/features/BasicSettings/components/tabs/AccountManagement/SortingPrioritySettings"
import { SortingCriteriaType } from "~/types/sorting"
import { showUpdateToast } from "~/utils/core/toastHelpers"
import { fireEvent, render, screen, waitFor } from "~~/tests/test-utils/render"

const {
  mockedUseUserPreferencesContext,
  mockUpdateSortingPriorityConfig,
  mockResetSortingPriorityConfig,
} = vi.hoisted(() => ({
  mockedUseUserPreferencesContext: vi.fn(),
  mockUpdateSortingPriorityConfig: vi.fn(),
  mockResetSortingPriorityConfig: vi.fn(),
}))

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual =
    (await importOriginal()) as typeof import("~/contexts/UserPreferencesContext")

  return {
    ...actual,
    UserPreferencesProvider: ({ children }: { children: ReactNode }) =>
      children,
    useUserPreferencesContext: () => mockedUseUserPreferencesContext(),
  }
})

vi.mock("~/utils/core/toastHelpers", () => ({
  showUpdateToast: vi.fn(),
}))

vi.mock("~/components/SettingSection", () => ({
  SettingSection: ({
    children,
    title,
    description,
    onReset,
  }: {
    children: ReactNode
    title: string
    description: string
    onReset?: () => Promise<boolean>
  }) => (
    <section>
      <h2>{title}</h2>
      <p>{description}</p>
      <button onClick={() => void onReset?.()}>common:actions.reset</button>
      {children}
    </section>
  ),
}))

vi.mock("~/components/ui", () => ({
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock(
  "~/features/BasicSettings/components/tabs/AccountManagement/SortingPrioritySettings/SortingPriorityDragList",
  () => ({
    SortingPriorityDragList: ({
      items,
      onDragEnd,
      onToggleEnabled,
    }: {
      items: Array<{
        id: string
        enabled: boolean
        priority: number
        label: string
        description?: string
      }>
      onDragEnd: (event: {
        active: { id: string }
        over: { id: string } | null
      }) => void
      onToggleEnabled?: (id: string, enabled: boolean) => void
    }) => (
      <div>
        {items.map((item) => (
          <div key={item.id} data-testid={`sorting-item-${item.id}`}>
            <span>{item.label}</span>
            <span>{item.description}</span>
            <span>{`enabled:${item.enabled}`}</span>
            <span>{`priority:${item.priority}`}</span>
            <button
              onClick={() => onToggleEnabled?.(item.id, !item.enabled)}
            >{`toggle-${item.id}`}</button>
          </div>
        ))}
        <button
          onClick={() =>
            onDragEnd({
              active: { id: SortingCriteriaType.USER_SORT_FIELD },
              over: { id: SortingCriteriaType.PINNED },
            })
          }
        >
          reorder-user-before-pinned
        </button>
        <button
          onClick={() =>
            onDragEnd({
              active: { id: SortingCriteriaType.PINNED },
              over: { id: SortingCriteriaType.PINNED },
            })
          }
        >
          reorder-noop
        </button>
      </div>
    ),
  }),
)

const mockedShowUpdateToast = showUpdateToast as ReturnType<typeof vi.fn>

const createConfig = (criteria?: any[]) => ({
  criteria: criteria ?? [
    {
      id: SortingCriteriaType.PINNED,
      enabled: true,
      priority: 1,
    },
    {
      id: SortingCriteriaType.USER_SORT_FIELD,
      enabled: false,
      priority: 0,
    },
    {
      id: "custom-unknown-rule",
      enabled: true,
      priority: 2,
    },
  ],
  lastModified: 123,
})

const createContextValue = (overrides: Record<string, unknown> = {}) => ({
  sortingPriorityConfig: createConfig(),
  updateSortingPriorityConfig: mockUpdateSortingPriorityConfig,
  resetSortingPriorityConfig: mockResetSortingPriorityConfig,
  isLoading: false,
  ...overrides,
})

describe("SortingPrioritySettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(Date, "now").mockReturnValue(
      new Date("2026-03-30T07:10:00.000Z").getTime(),
    )

    mockUpdateSortingPriorityConfig.mockResolvedValue(true)
    mockResetSortingPriorityConfig.mockResolvedValue(true)
    mockedUseUserPreferencesContext.mockReturnValue(createContextValue())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("shows a loading state while preferences are still loading", () => {
    mockedUseUserPreferencesContext.mockReturnValue(
      createContextValue({
        isLoading: true,
        sortingPriorityConfig: undefined,
      }),
    )

    render(<SortingPrioritySettings />)

    expect(screen.getByText("common:status.loading")).toBeInTheDocument()
    expect(screen.queryByText("settings:sorting.title")).not.toBeInTheDocument()
  })

  it("keeps rendered criteria visible during later preference reloads", async () => {
    const { rerender } = render(<SortingPrioritySettings />)

    expect(
      await screen.findByTestId(`sorting-item-${SortingCriteriaType.PINNED}`),
    ).toBeInTheDocument()

    mockedUseUserPreferencesContext.mockReturnValue(
      createContextValue({
        isLoading: true,
      }),
    )

    rerender(<SortingPrioritySettings />)

    expect(
      screen.getByTestId(`sorting-item-${SortingCriteriaType.PINNED}`),
    ).toBeInTheDocument()
    expect(screen.queryByText("common:status.loading")).toBeNull()
  })

  it("sorts initial criteria by priority and falls back to unknown-rule copy", async () => {
    render(<SortingPrioritySettings />)

    const itemLabels = await screen.findAllByTestId(/sorting-item-/)
    expect(itemLabels).toHaveLength(3)
    expect(itemLabels[0]).toHaveTextContent("settings:sorting.userCustomSort")
    expect(itemLabels[1]).toHaveTextContent("settings:sorting.pinnedPriority")
    expect(itemLabels[2]).toHaveTextContent("custom-unknown-rule")
    expect(itemLabels[2]).toHaveTextContent("settings:sorting.unknownSortRule")
  })

  it("reorders criteria, persists updated priorities, and shows a toast on success", async () => {
    render(<SortingPrioritySettings />)

    fireEvent.click(
      screen.getByRole("button", { name: "reorder-user-before-pinned" }),
    )

    await waitFor(() => {
      expect(mockUpdateSortingPriorityConfig).toHaveBeenCalledWith({
        ...createConfig(),
        criteria: [
          {
            id: SortingCriteriaType.PINNED,
            enabled: true,
            priority: 0,
          },
          {
            id: SortingCriteriaType.USER_SORT_FIELD,
            enabled: false,
            priority: 1,
          },
          {
            id: "custom-unknown-rule",
            enabled: true,
            priority: 2,
          },
        ],
        lastModified: new Date("2026-03-30T07:10:00.000Z").getTime(),
      })
    })

    expect(mockedShowUpdateToast).toHaveBeenCalledWith(
      true,
      "settings:sorting.title",
    )
    expect(
      screen.getByTestId(`sorting-item-${SortingCriteriaType.PINNED}`),
    ).toHaveTextContent("priority:0")
  })

  it("ignores drag events that do not change the target position", async () => {
    render(<SortingPrioritySettings />)

    fireEvent.click(screen.getByRole("button", { name: "reorder-noop" }))

    expect(mockUpdateSortingPriorityConfig).not.toHaveBeenCalled()
    expect(mockedShowUpdateToast).not.toHaveBeenCalled()
  })

  it("toggles a criterion and keeps the UI updated even when saving fails", async () => {
    mockUpdateSortingPriorityConfig.mockResolvedValue(false)

    render(<SortingPrioritySettings />)

    fireEvent.click(
      screen.getByRole("button", {
        name: `toggle-${SortingCriteriaType.USER_SORT_FIELD}`,
      }),
    )

    await waitFor(() => {
      expect(mockUpdateSortingPriorityConfig).toHaveBeenCalledWith({
        ...createConfig(),
        criteria: [
          {
            id: SortingCriteriaType.USER_SORT_FIELD,
            enabled: true,
            priority: 0,
          },
          {
            id: SortingCriteriaType.PINNED,
            enabled: true,
            priority: 1,
          },
          {
            id: "custom-unknown-rule",
            enabled: true,
            priority: 2,
          },
        ],
        lastModified: new Date("2026-03-30T07:10:00.000Z").getTime(),
      })
    })

    expect(
      screen.getByTestId(`sorting-item-${SortingCriteriaType.USER_SORT_FIELD}`),
    ).toHaveTextContent("enabled:true")
    expect(mockedShowUpdateToast).not.toHaveBeenCalled()
  })

  it("resets through SettingSection", async () => {
    render(<SortingPrioritySettings />)

    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.reset" }),
    )

    await waitFor(() => {
      expect(mockResetSortingPriorityConfig).toHaveBeenCalledTimes(1)
    })
  })
})
