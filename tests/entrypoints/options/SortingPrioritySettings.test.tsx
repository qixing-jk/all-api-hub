import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import SortingPrioritySettings from "~/features/BasicSettings/components/tabs/AccountManagement/SortingPrioritySettings"
import {
  SortingCriteriaType,
  type SortingPriorityConfig,
} from "~/types/sorting"
import { showUpdateToast } from "~/utils/feedback/preferenceFeedback"
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

const preferenceWriteSuccess = () => ({
  ok: true,
  preferences: {} as any,
})

const preferenceWriteFailure = () => ({
  ok: false,
  reason: { type: "storage-error", error: new Error("save failed") },
})

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

vi.mock("~/utils/feedback/preferenceFeedback", () => ({
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
    onReset?: () => Promise<any>
  }) => (
    <section>
      <h2>{title}</h2>
      <p>{description}</p>
      <button onClick={() => void onReset?.()}>common:actions.reset</button>
      {children}
    </section>
  ),
}))

vi.mock("~/components/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/components/ui")>()),
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

const mockedShowUpdateToast = showUpdateToast as ReturnType<typeof vi.fn>

const createConfig = (
  criteria?: SortingPriorityConfig["criteria"],
): SortingPriorityConfig => ({
  criteria: criteria ?? [
    {
      id: SortingCriteriaType.CURRENT_SITE,
      enabled: true,
      priority: 1,
    },
    {
      id: SortingCriteriaType.MATCHED_OPEN_TABS,
      enabled: false,
      priority: 0,
    },
    {
      id: SortingCriteriaType.PINNED,
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

    mockUpdateSortingPriorityConfig.mockResolvedValue(preferenceWriteSuccess())
    mockResetSortingPriorityConfig.mockResolvedValue(preferenceWriteSuccess())
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

  it("shows only independent browsing-context switches and keeps them visible during reloads", () => {
    const { rerender } = render(<SortingPrioritySettings />)
    expect(screen.getAllByRole("switch")).toHaveLength(2)
    expect(
      screen.queryByText("settings:sorting.customCheckInUrl"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("settings:sorting.customRedeemUrl"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("settings:sorting.automaticTitle"),
    ).not.toBeInTheDocument()
    mockedUseUserPreferencesContext.mockReturnValue(
      createContextValue({ isLoading: true }),
    )
    rerender(<SortingPrioritySettings />)
    expect(screen.getAllByRole("switch")).toHaveLength(2)
    expect(screen.queryByText("common:status.loading")).not.toBeInTheDocument()
  })

  it.each([true, false])(
    "saves a context toggle independently and rolls back a failed write (success: %s)",
    async (success) => {
      const user = userEvent.setup()
      mockUpdateSortingPriorityConfig.mockResolvedValue(
        success ? preferenceWriteSuccess() : preferenceWriteFailure(),
      )
      render(<SortingPrioritySettings />)
      const openTabs = screen.getByRole("switch", {
        name: "settings:sorting.matchedOpenTabs",
      })
      expect(openTabs).not.toBeChecked()
      expect(openTabs).toHaveAccessibleDescription(
        "settings:sorting.matchedOpenTabsDesc",
      )
      await user.click(openTabs)
      await waitFor(() =>
        expect(mockUpdateSortingPriorityConfig).toHaveBeenCalledWith(
          expect.objectContaining({
            criteria: [
              {
                id: SortingCriteriaType.MATCHED_OPEN_TABS,
                enabled: true,
                priority: 0,
              },
              {
                id: SortingCriteriaType.CURRENT_SITE,
                enabled: true,
                priority: 1,
              },
            ],
          }),
        ),
      )
      await waitFor(() =>
        expect(openTabs).toHaveAttribute("aria-checked", String(success)),
      )
      expect(
        screen.getByRole("switch", {
          name: "settings:sorting.currentSitePriority",
        }),
      ).toBeChecked()
      expect(mockedShowUpdateToast).toHaveBeenCalledWith(
        expect.objectContaining({ ok: success }),
        "settings:sorting.title",
      )
    },
  )

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
