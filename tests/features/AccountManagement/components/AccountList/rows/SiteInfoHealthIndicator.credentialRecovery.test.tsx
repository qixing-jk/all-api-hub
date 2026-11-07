import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { SiteInfoHealthIndicator } from "~/features/AccountManagement/components/AccountList/rows/SiteInfoHealthIndicator"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import { openTargetedOptionsPage } from "~/utils/navigation/optionsPage"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"
import { render, screen } from "~~/tests/test-utils/render"

vi.mock("~/components/Tooltip", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/components/Tooltip")>()),
  default: ({
    children,
    content,
  }: {
    children: ReactNode
    content: ReactNode
  }) => (
    <div>
      {children}
      {content}
    </div>
  ),
}))

vi.mock("~/utils/navigation/optionsPage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/navigation/optionsPage")>()),
  openTargetedOptionsPage: vi.fn().mockResolvedValue(undefined),
}))

describe("account health credential recovery guidance", () => {
  it("opens the rejected account's login settings without refreshing it", async () => {
    const user = userEvent.setup()
    const onRefresh = vi.fn()
    const site = buildDisplaySiteData({
      id: "expired-cookie-account",
      siteType: SITE_TYPES.ANYROUTER,
      authType: AuthTypeEnum.Cookie,
      health: {
        status: SiteHealthStatus.Warning,
        code: "authentication_required",
        reason: "HTTP 401",
      },
    })
    render(
      <SiteInfoHealthIndicator
        site={site}
        onRefresh={onRefresh}
        isRefreshing={false}
        isHealthRefreshing={false}
        isRefreshLocked={false}
      />,
    )

    await screen.findByRole("button", {
      name: "account:list.site.refreshHealthStatus",
    })
    expect(screen.getByText(/HTTP 401/)).toBeVisible()
    await user.click(
      screen.getByRole("button", {
        name: "accountDialog:login.configureRecovery",
      }),
    )
    expect(openTargetedOptionsPage).toHaveBeenCalledWith({
      targetHash: "#account",
      inPageSearchParams: {
        action: "edit",
        accountId: site.id,
        focusSection: "account-login",
      },
      newTabSearchParams: {
        action: "edit",
        accountId: site.id,
        focusSection: "account-login",
      },
    })
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it.each([
    { siteType: SITE_TYPES.NEW_API, authType: AuthTypeEnum.Cookie },
    { siteType: SITE_TYPES.ANYROUTER, authType: AuthTypeEnum.AccessToken },
    {
      siteType: SITE_TYPES.ANYROUTER,
      authType: AuthTypeEnum.Cookie,
      disabled: true,
    },
    {
      siteType: SITE_TYPES.ANYROUTER,
      authType: AuthTypeEnum.Cookie,
      health: { status: SiteHealthStatus.Warning, reason: "HTTP 401" },
    },
  ])(
    "does not suggest recovery for an ineligible or unclassified failure (%j)",
    async (overrides) => {
      const site = buildDisplaySiteData({
        health: {
          status: SiteHealthStatus.Warning,
          code: "authentication_required",
          reason: "HTTP 401",
        },
        ...overrides,
      })
      render(
        <SiteInfoHealthIndicator
          site={site}
          onRefresh={vi.fn()}
          isRefreshing={false}
          isHealthRefreshing={false}
          isRefreshLocked={false}
        />,
      )
      await screen.findByRole("button", {
        name: "account:list.site.refreshHealthStatus",
      })
      expect(
        screen.queryByRole("button", {
          name: "accountDialog:login.configureRecovery",
        }),
      ).not.toBeInTheDocument()
    },
  )
})
