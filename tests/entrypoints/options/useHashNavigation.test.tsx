import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { useHashNavigation } from "~/entrypoints/options/hooks/useHashNavigation"
import {
  pushWithinOptionsPage,
  replaceWithinOptionsPage,
} from "~/utils/navigation"

vi.mock("~/utils/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/navigation")>()

  return {
    ...actual,
    pushWithinOptionsPage: vi.fn(),
    replaceWithinOptionsPage: vi.fn(),
  }
})

function Probe() {
  const { activeMenuItem, handleMenuItemChange, refreshKey, routeParams } =
    useHashNavigation()

  return (
    <div>
      <div data-testid="active-menu">{activeMenuItem}</div>
      <div data-testid="refresh-key">{refreshKey}</div>
      <div data-testid="route-params">{JSON.stringify(routeParams)}</div>
      <button
        onClick={() =>
          handleMenuItemChange(MENU_ITEM_IDS.MODELS, { foo: "bar" })
        }
      >
        change-menu
      </button>
    </div>
  )
}

const parseRouteParams = () =>
  JSON.parse(screen.getByTestId("route-params").textContent ?? "{}")

describe("useHashNavigation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, "", "/options.html")
  })

  it("canonicalizes the overview page and preserves search params when no hash exists", () => {
    window.history.replaceState(null, "", "/options.html?source=test")

    render(<Probe />)

    expect(replaceWithinOptionsPage).toHaveBeenCalledWith(
      `#${MENU_ITEM_IDS.OVERVIEW}`,
      {
        source: "test",
      },
    )
  })

  it("canonicalizes invalid pages and preserves merged params", () => {
    window.history.replaceState(
      null,
      "",
      "/options.html?from=search#not-a-page?tab=managed&refresh=false",
    )

    render(<Probe />)

    expect(replaceWithinOptionsPage).toHaveBeenCalledWith(
      `#${MENU_ITEM_IDS.OVERVIEW}`,
      {
        from: "search",
        refresh: "false",
        tab: "managed",
      },
    )
  })

  it("normalizes invalid pages, merges hash params, and increments refreshKey on hashchange", () => {
    window.history.replaceState(
      null,
      "",
      "/options.html?from=search#overview?tab=managed&refresh=false",
    )

    render(<Probe />)

    expect(screen.getByTestId("active-menu")).toHaveTextContent(
      MENU_ITEM_IDS.OVERVIEW,
    )
    expect(parseRouteParams()).toEqual({
      from: "search",
      refresh: "false",
      tab: "managed",
    })

    act(() => {
      window.history.replaceState(
        null,
        "",
        "/options.html#models?refresh=true&panel=models",
      )
      window.dispatchEvent(new HashChangeEvent("hashchange"))
    })

    expect(screen.getByTestId("active-menu")).toHaveTextContent(
      MENU_ITEM_IDS.MODELS,
    )
    expect(parseRouteParams()).toEqual({
      panel: "models",
      refresh: "true",
    })
    expect(screen.getByTestId("refresh-key")).toHaveTextContent("1")
  })

  it("updates route params on popstate when only the search string changes", () => {
    window.history.replaceState(null, "", "/options.html?search=alpha#account")

    render(<Probe />)

    expect(screen.getByTestId("active-menu")).toHaveTextContent(
      MENU_ITEM_IDS.ACCOUNT,
    )
    expect(parseRouteParams()).toEqual({ search: "alpha" })

    act(() => {
      window.history.pushState(null, "", "/options.html?search=beta#account")
      window.dispatchEvent(new PopStateEvent("popstate"))
    })

    expect(screen.getByTestId("active-menu")).toHaveTextContent(
      MENU_ITEM_IDS.ACCOUNT,
    )
    expect(parseRouteParams()).toEqual({ search: "beta" })
  })

  it("preserves explicit basic links", () => {
    window.history.replaceState(null, "", "/options.html#basic?tab=display")

    render(<Probe />)

    expect(replaceWithinOptionsPage).not.toHaveBeenCalled()
    expect(screen.getByTestId("active-menu")).toHaveTextContent(
      MENU_ITEM_IDS.BASIC,
    )
    expect(parseRouteParams()).toEqual({ tab: "display" })
  })

  it("updates local state and delegates navigation when changing menu items", async () => {
    render(<Probe />)

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "change-menu" }))
    })

    await waitFor(() => {
      expect(screen.getByTestId("active-menu")).toHaveTextContent(
        MENU_ITEM_IDS.MODELS,
      )
    })
    expect(parseRouteParams()).toEqual({ foo: "bar" })
    expect(pushWithinOptionsPage).toHaveBeenCalledWith("#models", {
      foo: "bar",
    })
  })
})
