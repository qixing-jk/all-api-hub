import { fireEvent, render, screen } from "@testing-library/react"
import type { ComponentProps, SVGProps } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  DropdownMenu,
  DropdownMenuContent,
} from "~/components/ui/dropdown-menu"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { AccountActionMenuItem } from "~/features/AccountManagement/components/AccountActionButtons/AccountActionMenuItem"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"

const { trackStartedMock } = vi.hoisted(() => ({
  trackStartedMock: vi.fn(),
}))

vi.mock("~/services/productAnalytics/actions", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/productAnalytics/actions")>()

  return {
    ...actual,
    trackProductAnalyticsActionStarted: trackStartedMock,
  }
})

function TestIcon(props: SVGProps<SVGSVGElement>) {
  return <svg aria-hidden="true" {...props} />
}

function renderMenuItem(
  props: Partial<ComponentProps<typeof AccountActionMenuItem>> = {},
) {
  const onClick = props.onClick ?? vi.fn()

  render(
    <ProductAnalyticsScope
      entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Options}
      featureId={PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement}
      surfaceId={
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions
      }
    >
      <DropdownMenu open={true}>
        <DropdownMenuContent>
          <AccountActionMenuItem
            onClick={onClick}
            icon={TestIcon}
            label="Refresh"
            {...props}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </ProductAnalyticsScope>,
  )

  return { onClick }
}

describe("AccountActionMenuItem analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    trackStartedMock.mockResolvedValue(undefined)
  })

  it("tracks simplified scoped analytics actions", () => {
    renderMenuItem({
      analyticsAction: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccount,
    })

    fireEvent.click(screen.getByRole("menuitem", { name: "Refresh" }))

    expect(trackStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccount,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("keeps full analytics action objects compatible", () => {
    renderMenuItem({
      analyticsAction: {
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunQuickCheckin,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      },
    })

    fireEvent.click(screen.getByRole("menuitem", { name: "Refresh" }))

    expect(trackStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunQuickCheckin,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("does not track disabled or unconfigured menu actions", () => {
    const enabled = renderMenuItem()
    fireEvent.click(screen.getByRole("menuitem", { name: "Refresh" }))
    expect(enabled.onClick).toHaveBeenCalled()
    expect(trackStartedMock).not.toHaveBeenCalled()

    vi.clearAllMocks()
    renderMenuItem({
      disabled: true,
      analyticsAction: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccount,
    })
    const disabledButton = screen
      .getAllByRole("menuitem", { name: "Refresh" })
      .find(
        (menuItem) =>
          menuItem instanceof HTMLButtonElement && menuItem.disabled,
      )
    expect(disabledButton).toBeDefined()
    fireEvent.click(disabledButton!)

    expect(trackStartedMock).not.toHaveBeenCalled()
  })

  it("renders a visible description when no compact hint is provided", () => {
    renderMenuItem({
      description: "Refresh the latest balance and usage data.",
    })

    expect(
      screen.getByText("Refresh the latest balance and usage data."),
    ).toBeInTheDocument()
    expect(screen.getByRole("menuitem", { name: "Refresh" })).toHaveAttribute(
      "aria-describedby",
      expect.stringMatching(/.+/),
    )
  })
})
