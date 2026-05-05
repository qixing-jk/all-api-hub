import type { ReactNode } from "react"
import { lazy } from "react"
import userEvent from "@testing-library/user-event"
import { act } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import App from "~/entrypoints/options/App"
import { render, screen } from "~~/tests/test-utils/render"

const {
  mockedHandleMenuItemChange,
  mockedOptionsSearchDialog,
  mockedUseSearchHotkeys,
} = vi.hoisted(() => ({
  mockedHandleMenuItemChange: vi.fn(),
  mockedOptionsSearchDialog: vi.fn(),
  mockedUseSearchHotkeys: vi.fn(),
}))

vi.mock("~/components/AppLayout", () => ({
  AppLayout: ({ children }: { children: ReactNode }) => children,
}))

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: () => ({
    managedSiteType: "new-api",
    preferences: {
      autoCheckin: {
        globalEnabled: true,
      },
    },
    showTodayCashflow: true,
  }),
}))

vi.mock("~/entrypoints/options/hooks/useHashNavigation", () => ({
  useHashNavigation: () => ({
    activeMenuItem: MENU_ITEM_IDS.BASIC,
    routeParams: { source: "test" },
    handleMenuItemChange: mockedHandleMenuItemChange,
    refreshKey: 7,
  }),
}))

vi.mock("~/entrypoints/options/components/Header", () => ({
  default: ({
    onSearchOpen,
    onTitleClick,
  }: {
    onSearchOpen: () => void
    onTitleClick: () => void
  }) => (
    <div>
      <button onClick={onSearchOpen}>open search</button>
      <button onClick={onTitleClick}>go basic</button>
    </div>
  ),
}))

vi.mock("~/entrypoints/options/components/Sidebar", () => ({
  default: ({
    onMenuItemClick,
  }: {
    onMenuItemClick: (itemId: string) => void
  }) => (
    <button onClick={() => onMenuItemClick(MENU_ITEM_IDS.ACCOUNT)}>
      sidebar account
    </button>
  ),
}))

vi.mock("~/entrypoints/options/search/useOptionsSearch", () => ({
  useOptionsSearchContext: (context: Record<string, unknown>) => ({
    ...context,
    sidePanelSupported: true,
  }),
}))

vi.mock("~/entrypoints/options/search/useSearchHotkeys", () => ({
  useSearchHotkeys: mockedUseSearchHotkeys,
}))

vi.mock("~/entrypoints/options/search/OptionsSearchDialog", () => ({
  OptionsSearchDialog: (props: Record<string, unknown>) => {
    mockedOptionsSearchDialog(props)

    return props.open ? (
      <div role="dialog">
        <button
          onClick={() =>
            (
              props.onPageNavigate as (
                pageId: string,
                params?: Record<string, string | undefined>,
              ) => void
            )("bookmark", { anchor: "bookmarks" })
          }
        >
          navigate bookmark
        </button>
        <button onClick={() => (props.onOpenChange as (open: boolean) => void)(false)}>
          close dialog
        </button>
      </div>
    ) : null
  },
}))

vi.mock("~/entrypoints/options/constants", () => ({
  menuItems: [
    {
      id: MENU_ITEM_IDS.BASIC,
      component: lazy(async () => ({
        default: ({
          routeParams,
          refreshKey,
        }: {
          routeParams: Record<string, string>
          refreshKey: number
        }) => (
          <div>
            <div>source:{routeParams.source}</div>
            <div>refresh:{refreshKey}</div>
          </div>
        ),
      })),
    },
  ],
}))

describe("options App", () => {
  beforeEach(() => {
    mockedHandleMenuItemChange.mockReset()
    mockedOptionsSearchDialog.mockReset()
    mockedUseSearchHotkeys.mockReset()
  })

  it("shows the lazy page fallback and wires the search dialog interactions", async () => {
    const user = userEvent.setup()

    render(<App />, {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    expect(screen.getByLabelText("common:status.loading")).toBeInTheDocument()
    expect(await screen.findByText("source:test")).toBeInTheDocument()
    expect(screen.getByText("refresh:7")).toBeInTheDocument()

    await user.click(screen.getByText("open search"))
    expect(screen.getByRole("dialog")).toBeInTheDocument()

    await user.click(screen.getByText("navigate bookmark"))
    expect(mockedHandleMenuItemChange).toHaveBeenCalledWith("bookmark", {
      anchor: "bookmarks",
    })

    await user.click(screen.getByText("go basic"))
    expect(mockedHandleMenuItemChange).toHaveBeenCalledWith(MENU_ITEM_IDS.BASIC)
  })

  it("opens the search dialog from the registered hotkey callback", async () => {
    render(<App />, {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    const hotkeyRegistration = mockedUseSearchHotkeys.mock.calls[0]?.[0] as
      | { onOpen: () => void }
      | undefined
    act(() => {
      hotkeyRegistration?.onOpen()
    })

    expect(await screen.findByRole("dialog")).toBeInTheDocument()
  })
})
