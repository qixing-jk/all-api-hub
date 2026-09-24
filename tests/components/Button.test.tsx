import { beforeEach, describe, expect, it, vi } from "vitest"

import { Button, BUTTON_LOADING_BEHAVIORS } from "~/components/ui/button"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { fireEvent, render, screen } from "~~/tests/test-utils/render"

const { trackStartedMock } = vi.hoisted(() => ({
  trackStartedMock: vi.fn(),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  trackProductAnalyticsActionStarted: trackStartedMock,
}))

describe("Button", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    trackStartedMock.mockResolvedValue(undefined)
  })

  it("renders leftIcon when not loading", async () => {
    render(<Button leftIcon={<span data-testid="left-icon" />}>Save</Button>)

    expect(
      await screen.findByRole("button", { name: "Save" }),
    ).toBeInTheDocument()
    expect(screen.getByTestId("left-icon")).toBeInTheDocument()
    expect(
      screen.queryByRole("status", { name: "common:status.loading" }),
    ).not.toBeInTheDocument()
  })

  it("exposes the resolved visual size for responsive layout containers", async () => {
    render(
      <>
        <Button>Default</Button>
        <Button size="sm">Small</Button>
        <Button size="lg">Large</Button>
      </>,
    )

    expect(
      await screen.findByRole("button", { name: "Default" }),
    ).toHaveAttribute("data-size", "default")
    expect(screen.getByRole("button", { name: "Small" })).toHaveAttribute(
      "data-size",
      "sm",
    )
    expect(screen.getByRole("button", { name: "Large" })).toHaveAttribute(
      "data-size",
      "lg",
    )
  })

  it("lets text button sizes shrink, wrap, and grow within their container", async () => {
    render(
      <>
        <Button>Default localized action label</Button>
        <Button size="sm">Small localized action label</Button>
        <Button size="lg">Large localized action label</Button>
      </>,
    )

    const textButtons = [
      await screen.findByRole("button", {
        name: "Default localized action label",
      }),
      await screen.findByRole("button", {
        name: "Small localized action label",
      }),
      await screen.findByRole("button", {
        name: "Large localized action label",
      }),
    ]

    for (const button of textButtons) {
      expect(button).toHaveClass(
        "h-auto",
        "min-w-0",
        "max-w-full",
        "shrink",
        "text-center",
        "break-words",
        "whitespace-normal",
      )
      expect(button).not.toHaveClass("shrink-0")
      expect(button).not.toHaveClass("whitespace-nowrap")
    }

    expect(textButtons[0]).toHaveClass("min-h-(--density-control)")
    expect(textButtons[1]).toHaveClass("min-h-(--density-control-sm)")
    expect(textButtons[2]).toHaveClass("min-h-(--density-control-lg)")
  })

  it("keeps icon-only button sizes fixed", async () => {
    render(
      <>
        <Button size="icon" aria-label="Default icon" />
        <Button size="icon-xs" aria-label="Extra-small icon" />
        <Button size="icon-sm" aria-label="Small icon" />
        <Button size="icon-lg" aria-label="Large icon" />
      </>,
    )

    for (const name of [
      "Default icon",
      "Extra-small icon",
      "Small icon",
      "Large icon",
    ]) {
      const button = await screen.findByRole("button", { name })
      expect(button).toHaveClass("max-w-none", "shrink-0", "whitespace-nowrap")
      expect(button).not.toHaveClass("max-w-full")
      expect(button).not.toHaveClass("shrink")
      expect(button).not.toHaveClass("whitespace-normal")
    }
  })

  it("lets compact text actions opt out of wrapping", async () => {
    render(
      <Button className="h-6 min-h-0 max-w-none shrink-0 whitespace-nowrap">
        Compact action
      </Button>,
    )

    const button = await screen.findByRole("button", {
      name: "Compact action",
    })
    expect(button).toHaveClass(
      "h-6",
      "max-w-none",
      "shrink-0",
      "whitespace-nowrap",
    )
    expect(button).not.toHaveClass("h-auto")
    expect(button).not.toHaveClass("min-h-(--density-control)")
    expect(button).not.toHaveClass("max-w-full")
    expect(button).not.toHaveClass("shrink")
    expect(button).not.toHaveClass("whitespace-normal")
  })

  it("forwards the resolved visual size through asChild", async () => {
    render(
      <Button asChild size="sm" data-size="lg">
        <a href="/settings">Settings</a>
      </Button>,
    )

    expect(
      await screen.findByRole("link", { name: "Settings" }),
    ).toHaveAttribute("data-size", "sm")
  })

  it("keeps caller pending content and exposes the loading state", async () => {
    const { container } = render(
      <Button
        loading
        aria-busy={false}
        leftIcon={<span data-testid="left-icon" />}
        spinnerProps={{
          "aria-hidden": false,
          id: "button-spinner",
        }}
      >
        Saving changes
      </Button>,
    )

    const button = await screen.findByRole("button", {
      name: "Saving changes",
    })
    const spinner = container.querySelector("#button-spinner")

    expect(button).toHaveTextContent("Saving changes")
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute("aria-busy", "true")
    expect(screen.queryByTestId("left-icon")).not.toBeInTheDocument()
    expect(spinner).toHaveAttribute("aria-hidden", "true")
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  it("locks a loading slotted link and exposes its busy state", async () => {
    const onButtonClick = vi.fn()
    const onLinkClick = vi.fn()

    render(
      <Button asChild loading onClick={onButtonClick}>
        <a href="/settings" aria-busy={false} onClick={onLinkClick}>
          Saving changes
        </a>
      </Button>,
    )

    const anchor = await screen.findByRole("link", {
      name: "Saving changes",
    })

    expect(anchor.tagName).toBe("A")
    expect(anchor).toHaveAttribute("href", "/settings")
    expect(anchor).toHaveTextContent("Saving changes")
    expect(anchor).toHaveAttribute("aria-busy", "true")
    expect(anchor).toHaveAttribute("aria-disabled", "true")
    expect(anchor).toHaveAttribute("tabindex", "-1")
    expect(anchor).not.toHaveAttribute("disabled")

    expect(fireEvent.click(anchor)).toBe(false)

    expect(onLinkClick).not.toHaveBeenCalled()
    expect(onButtonClick).not.toHaveBeenCalled()
  })

  it("preserves native disabled semantics for a slotted button", async () => {
    const onButtonClick = vi.fn()
    const onChildClick = vi.fn()

    render(
      <Button asChild disabled onClick={onButtonClick}>
        <button type="button" disabled={false} onClick={onChildClick}>
          Save
        </button>
      </Button>,
    )

    const button = await screen.findByRole("button", { name: "Save" })

    expect(button).toBeDisabled()
    expect(button).toHaveAttribute("aria-disabled", "true")
    expect(button).toHaveAttribute("tabindex", "-1")

    fireEvent.click(button)

    expect(onChildClick).not.toHaveBeenCalled()
    expect(onButtonClick).not.toHaveBeenCalled()
  })

  it("preserves an explicit aria-busy value when not loading", async () => {
    render(<Button aria-busy="true">Save</Button>)

    expect(await screen.findByRole("button", { name: "Save" })).toHaveAttribute(
      "aria-busy",
      "true",
    )
  })

  it("renders a visual Spinner when loading without leftIcon", async () => {
    const { container } = render(
      <Button loading spinnerProps={{ id: "button-spinner" }}>
        Save
      </Button>,
    )

    expect(
      await screen.findByRole("button", { name: "Save" }),
    ).toBeInTheDocument()
    expect(container.querySelector("#button-spinner")).toHaveAttribute(
      "aria-hidden",
      "true",
    )
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  it("paints the loading spinner in the button's own foreground color", async () => {
    const { container } = render(
      <>
        <Button loading spinnerProps={{ id: "solid-spinner" }}>
          Solid
        </Button>
        <Button
          loading
          variant="destructive"
          spinnerProps={{ id: "destructive-spinner" }}
        >
          Destructive
        </Button>
        <Button
          loading
          variant="warning"
          spinnerProps={{ id: "warning-spinner" }}
        >
          Warning
        </Button>
      </>,
    )

    await screen.findByRole("button", { name: "Solid" })

    for (const id of [
      "solid-spinner",
      "destructive-spinner",
      "warning-spinner",
    ]) {
      const spinner = container.querySelector(`#${id}`)

      expect(spinner).toHaveClass("text-current")
      // --spinner-primary-color resolves to --primary, the same CSS variable as
      // --button-primary-bg, so the default would erase the icon on a solid
      // button and ignore the foreground of destructive/warning surfaces.
      expect(spinner).not.toHaveClass("text-[var(--spinner-primary-color)]")
    }
  })

  it("lets an explicit spinner variant override the button foreground", async () => {
    const { container } = render(
      <Button loading spinnerProps={{ id: "white-spinner", variant: "white" }}>
        Save
      </Button>,
    )

    await screen.findByRole("button", { name: "Save" })

    const spinner = container.querySelector("#white-spinner")

    expect(spinner).toHaveClass("text-[var(--spinner-white-color)]")
    expect(spinner).not.toHaveClass("text-current")
  })

  it("keeps a loading button at full strength instead of fading it", async () => {
    render(
      <>
        <Button loading>Save</Button>
        <Button disabled>Save</Button>
      </>,
    )

    const [busy, inert] = await screen.findAllByRole("button", {
      name: "Save",
    })

    // A busy button is disabled for input, but it is doing the most visible
    // work on screen, so it must not also read as inert.
    expect(busy).toHaveAttribute("aria-busy", "true")
    expect(busy).toHaveClass("disabled:not-aria-busy:opacity-50")
    expect(busy).not.toHaveClass("disabled:opacity-50")

    expect(inert).not.toHaveAttribute("aria-busy")
    expect(inert).toHaveClass("disabled:not-aria-busy:opacity-50")
    expect(inert).toBeDisabled()
  })

  it("keeps a loading slotted control at full strength instead of fading it", async () => {
    render(
      <Button asChild loading>
        <a href="/settings">Saving changes</a>
      </Button>,
    )

    const anchor = await screen.findByRole("link", {
      name: "Saving changes",
    })

    expect(anchor).toHaveClass("aria-disabled:not-aria-busy:opacity-50")
    expect(anchor).not.toHaveClass("aria-disabled:opacity-50")
  })

  it("disables user interaction while loading", async () => {
    const onClick = vi.fn()

    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    )

    const button = await screen.findByRole("button", { name: "Save" })
    expect(button).toBeDisabled()

    fireEvent.click(button)

    expect(onClick).not.toHaveBeenCalled()
  })

  it("keeps an interactive loading action enabled and clickable", async () => {
    const onClick = vi.fn()

    render(
      <Button
        loading
        loadingBehavior={BUTTON_LOADING_BEHAVIORS.Interactive}
        onClick={onClick}
      >
        Cancel loading
      </Button>,
    )

    const button = await screen.findByRole("button", {
      name: "Cancel loading",
    })
    expect(button).toBeEnabled()
    expect(button).toHaveAttribute("aria-busy", "true")

    fireEvent.click(button)

    expect(onClick).toHaveBeenCalledOnce()
  })

  it("lets an explicit disabled state override interactive loading", async () => {
    const onClick = vi.fn()

    render(
      <Button
        loading
        loadingBehavior={BUTTON_LOADING_BEHAVIORS.Interactive}
        disabled
        onClick={onClick}
      >
        Cancel loading
      </Button>,
    )

    const button = await screen.findByRole("button", {
      name: "Cancel loading",
    })
    expect(button).toBeDisabled()

    fireEvent.click(button)

    expect(onClick).not.toHaveBeenCalled()
  })

  it("tracks controlled analytics action without reading button text", async () => {
    const onClick = vi.fn()

    render(
      <Button
        onClick={onClick}
        analyticsAction={{
          featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
          actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccount,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        }}
      >
        Refresh private account for Alice
      </Button>,
    )

    await screen.findByRole("button", {
      name: "Refresh private account for Alice",
    })
    fireEvent.click(screen.getByRole("button"))

    expect(onClick).toHaveBeenCalledTimes(1)
    expect(trackStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccount,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("tracks scoped analytics action ids from context", async () => {
    render(
      <ProductAnalyticsScope
        entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Options}
        featureId={PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement}
        surfaceId={PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementHeader}
      >
        <Button analyticsAction={PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccount}>
          Refresh private account for Alice
        </Button>
      </ProductAnalyticsScope>,
    )

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Refresh private account for Alice",
      }),
    )

    expect(trackStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccount,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementHeader,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("does not track controlled analytics action when disabled", async () => {
    render(
      <Button
        disabled
        analyticsAction={{
          featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
          actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccount,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        }}
      >
        Refresh
      </Button>,
    )

    const button = await screen.findByRole("button", { name: "Refresh" })
    fireEvent.click(button)

    expect(trackStartedMock).not.toHaveBeenCalled()
  })
})
