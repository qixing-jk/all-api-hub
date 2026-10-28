import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import AutoDetectErrorAlert from "~/features/AccountManagement/components/AccountDialog/detection/AutoDetectErrorAlert"
import { AccessTokenVerificationGuide } from "~/features/AccountManagement/components/AccountDialog/form/AccessTokenVerificationGuide"
import { ManagedSiteConfigPromptDialog } from "~/features/AccountManagement/components/AccountDialog/postSave/ManagedSiteConfigPromptDialog"
import { DuplicateAccountWarningDialog } from "~/features/AccountManagement/components/AccountDialog/saving/DuplicateAccountWarningDialog"
import { AutoDetectErrorType } from "~/services/accounts/utils/autoDetectUtils"
import * as siteRouteResolver from "~/services/accounts/utils/siteRouteResolver"
import { ACCOUNT_SITE_MANUAL_ADD_GUIDE_ANCHORS } from "~/services/accountSiteDefinitions"
import * as accountSiteDefinitions from "~/services/accountSiteDefinitions"
import { clearSiteRouteFactsCacheForTests } from "~/services/apiAdapters/newApi/account/accountRoutes"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  PRODUCT_ANALYTICS_TARGET_KINDS,
  PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_ACTION_KINDS,
} from "~/services/productAnalytics/contracts"
import { server } from "~~/tests/msw/server"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

const { openLoginTabMock, reloadCurrentTabMock } = vi.hoisted(() => ({
  openLoginTabMock: vi.fn(),
  reloadCurrentTabMock: vi.fn(),
}))

const { openApiCredentialProfilesPageMock, openSiteSupportRequestPageMock } =
  vi.hoisted(() => ({
    openApiCredentialProfilesPageMock: vi.fn(),
    openSiteSupportRequestPageMock: vi.fn(),
  }))

const trackProductAnalyticsEventMock = vi.hoisted(() => vi.fn())

vi.mock("~/services/accounts/utils/autoDetectUtils", async () => {
  const actual = await vi.importActual<
    typeof import("~/services/accounts/utils/autoDetectUtils")
  >("~/services/accounts/utils/autoDetectUtils")

  return {
    ...actual,
    openLoginTab: openLoginTabMock,
    reloadCurrentTab: reloadCurrentTabMock,
  }
})

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: Record<string, unknown>) =>
        options ? JSON.stringify({ key, options }) : key,
      i18n: { language: "en" },
    }),
  }
})

vi.mock(
  "~/services/productAnalytics/runtime/dispatch",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/productAnalytics/runtime/dispatch")
      >()

    return {
      ...actual,
      trackProductAnalyticsEvent: trackProductAnalyticsEventMock,
    }
  },
)

vi.mock("~/utils/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/navigation")>()

  return {
    ...actual,
    openApiCredentialProfilesPage: openApiCredentialProfilesPageMock,
  }
})
vi.mock("~/utils/navigation/feedbackPages", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/navigation/feedbackPages")>()

  return {
    ...actual,
    openSiteSupportRequestPage: openSiteSupportRequestPageMock,
  }
})

describe("AccountDialog warnings", () => {
  it("shows a busy token-page action and prevents duplicate clicks while discovery is pending", async () => {
    let finish!: (url: string) => void
    const pending = new Promise<string>((resolve) => {
      finish = resolve
    })
    const resolve = vi
      .spyOn(siteRouteResolver, "resolveAccountSiteRouteUrl")
      .mockReturnValue(pending)
    try {
      render(
        <AccessTokenVerificationGuide
          message="Enter a token"
          siteUrl="https://site.example.com"
          siteType={SITE_TYPES.NEW_API}
        />,
      )
      const button = screen.getByRole("button", {
        name: "accessTokenVerification.openSecurity",
      })
      await userEvent.setup().click(button)
      expect(button).toHaveAttribute("aria-busy", "true")
      expect(button).toBeDisabled()
      await userEvent.setup().click(button)
      expect(resolve).toHaveBeenCalledTimes(2) // One quiet warmup, one admitted click.
      expect(browser.tabs.create).not.toHaveBeenCalled()
      await act(async () => finish("https://site.example.com/profile"))
      await waitFor(() => expect(browser.tabs.create).toHaveBeenCalledTimes(1))
      expect(button).not.toBeDisabled()
    } finally {
      resolve.mockRestore()
    }
  })
  it.each(["empty", "rejected"])(
    "reports %s credential discovery and allows retry",
    async (outcome) => {
      const resolve = vi.spyOn(siteRouteResolver, "resolveAccountSiteRouteUrl")
      if (outcome === "empty") resolve.mockResolvedValue(null)
      else resolve.mockRejectedValue(new Error("offline"))
      try {
        render(
          <AccessTokenVerificationGuide
            message="Enter a token"
            siteUrl="https://site.example.com"
          />,
        )
        const button = screen.getByRole("button", {
          name: "accessTokenVerification.openSecurity",
        })
        await userEvent.setup().click(button)
        expect(
          await screen.findByText("accessTokenVerification.openSecurityFailed"),
        ).toHaveTextContent("accessTokenVerification.openSecurityFailed")
        expect(browser.tabs.create).not.toHaveBeenCalled()
        expect(button).not.toBeDisabled()
        resolve.mockResolvedValue("https://site.example.com/profile")
        await userEvent.setup().click(button)
        await waitFor(() =>
          expect(browser.tabs.create).toHaveBeenCalledTimes(1),
        )
        expect(
          screen.queryByText("accessTokenVerification.openSecurityFailed"),
        ).not.toBeInTheDocument()
      } finally {
        resolve.mockRestore()
      }
    },
  )
  it("starts a network-only warmup before the token-page click", async () => {
    const resolve = vi
      .spyOn(siteRouteResolver, "resolveAccountSiteRouteUrl")
      .mockResolvedValue("https://site.example.com/profile")
    try {
      render(
        <AccessTokenVerificationGuide
          message="Enter a token"
          siteUrl="https://site.example.com"
          siteType={SITE_TYPES.NEW_API}
        />,
      )
      await waitFor(() =>
        expect(resolve).toHaveBeenCalledWith(
          { baseUrl: "https://site.example.com", siteType: SITE_TYPES.NEW_API },
          siteRouteResolver.SITE_ROUTE_KINDS.AccessToken,
        ),
      )
      expect(browser.tabs.create).not.toHaveBeenCalled()
    } finally {
      resolve.mockRestore()
    }
  })
  it.each([
    [
      SITE_TYPES.VERCEL_AI_GATEWAY,
      "/account/settings/tokens",
      "accessTokenVerification.vercel.openPage",
    ],
    [SITE_TYPES.RIX_API, "/admin-keys", "accessTokenVerification.openSecurity"],
  ])(
    "preserves an explicitly different account credential destination for %s",
    async (siteType, path, label) => {
      render(
        <AccessTokenVerificationGuide
          message="Enter a token"
          siteUrl="https://site.example.com"
          siteType={siteType}
        />,
      )
      await userEvent.setup().click(screen.getByRole("button", { name: label }))
      await waitFor(() =>
        expect(browser.tabs.create).toHaveBeenCalledWith(
          expect.objectContaining({ url: `https://site.example.com${path}` }),
        ),
      )
    },
  )

  it("keeps an explicitly unsupported account-token destination hidden", () => {
    render(
      <AccessTokenVerificationGuide
        message="Enter a token"
        siteUrl="https://site.example.com"
        siteType={SITE_TYPES.ONE_API}
      />,
    )
    expect(
      screen.queryByRole("button", {
        name: "accessTokenVerification.openSecurity",
      }),
    ).not.toBeInTheDocument()
  })

  it("opens the deployment's resolved credential page instead of a fixed security path", async () => {
    const resolve = vi
      .spyOn(siteRouteResolver, "resolveAccountSiteRouteUrl")
      .mockResolvedValue("https://api2.gemai.cc/profile")
    try {
      render(
        <AccessTokenVerificationGuide
          message="Enter a token"
          siteUrl="https://api2.gemai.cc"
          siteType={SITE_TYPES.NEW_API}
        />,
      )
      await userEvent.setup().click(
        screen.getByRole("button", {
          name: "accessTokenVerification.openSecurity",
        }),
      )
      expect(resolve).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: "https://api2.gemai.cc",
          siteType: SITE_TYPES.NEW_API,
        }),
        siteRouteResolver.SITE_ROUTE_KINDS.AccessToken,
      )
      expect(browser.tabs.create).toHaveBeenCalledWith(
        expect.objectContaining({ url: "https://api2.gemai.cc/profile" }),
      )
    } finally {
      resolve.mockRestore()
    }
  })
  it("keeps supported account credential recovery separate from unsupported-site suggestions", () => {
    render(
      <AutoDetectErrorAlert
        error={{
          type: AutoDetectErrorType.INVALID_RESPONSE,
          message: "The key is kept in the form",
          canUseApiCredentialFallback: false,
        }}
        siteUrl="https://app.requesty.ai"
        siteType={SITE_TYPES.REQUESTY}
      />,
    )
    expect(screen.getByText("The key is kept in the form")).toBeVisible()
    expect(
      screen.queryByText("apiCredentialFallback.title"),
    ).not.toBeInTheDocument()
  })
  it("renders the registered verification guide instead of inferring it from the site type", () => {
    const definition = accountSiteDefinitions.getAccountSiteDefinition(
      SITE_TYPES.MODELFLARE,
    )!
    definition.onboarding!.accessTokenVerificationGuide = {
      copy: "laozhang",
      showRotationWarning: true,
    }
    const lookup = vi
      .spyOn(accountSiteDefinitions, "getAccountSiteDefinition")
      .mockReturnValue(definition)
    try {
      render(
        <AccessTokenVerificationGuide
          message="Enter a credential"
          siteType={SITE_TYPES.MODELFLARE}
          siteUrl="https://site.example.com"
        />,
      )

      expect(
        screen.getByText("accessTokenVerification.laozhang.generateStep"),
      ).toBeVisible()
      expect(
        screen.getByRole("button", {
          name: "accessTokenVerification.laozhang.openProfile",
        }),
      ).toBeVisible()
      expect(
        screen.getByText("accessTokenVerification.rotationWarning"),
      ).toBeVisible()
    } finally {
      lookup.mockRestore()
    }
  })

  it.each([SITE_TYPES.RIX_API, SITE_TYPES.MODELFLARE])(
    "preserves generic security guidance without a rotation warning for %s",
    (siteType) => {
      render(
        <AccessTokenVerificationGuide
          message="Enter a credential"
          siteType={siteType}
          siteUrl="https://site.example.com"
        />,
      )
      expect(
        screen.getByText("accessTokenVerification.generateStep"),
      ).toBeVisible()
      expect(
        screen.getByRole("button", {
          name: "accessTokenVerification.openSecurity",
        }),
      ).toBeVisible()
      expect(
        screen.queryByText("accessTokenVerification.rotationWarning"),
      ).not.toBeInTheDocument()
    },
  )

  it.each([
    "https://api.laozhang.ai",
    "https://api2.laozhang.ai",
    "https://api-vip.laozhang.ai",
    "https://api-cf.laozhang.ai",
  ])(
    "guides LaoZhang System token setup on the selected origin %s",
    async (siteUrl) => {
      const user = userEvent.setup()
      const onPrepareAccessTokenInput = vi.fn()
      render(
        <AutoDetectErrorAlert
          error={{
            type: AutoDetectErrorType.ACCESS_TOKEN_VERIFICATION_REQUIRED,
            message: "Enter a System token",
          }}
          siteUrl={siteUrl}
          siteType={SITE_TYPES.LAOZHANG}
          onPrepareAccessTokenInput={onPrepareAccessTokenInput}
        />,
      )
      expect(
        screen.getByText("accessTokenVerification.laozhang.generateStep"),
      ).toBeVisible()
      expect(
        screen.queryByText("accessTokenVerification.generateStep"),
      ).not.toBeInTheDocument()
      await user.click(
        screen.getByRole("button", {
          name: "accessTokenVerification.laozhang.openProfile",
        }),
      )
      expect(onPrepareAccessTokenInput).toHaveBeenCalledOnce()
      expect(browser.tabs.create).toHaveBeenCalledWith({
        url: `${siteUrl}/account/profile`,
        active: true,
      })
    },
  )

  it("keeps LaoZhang manual profile instructions when opening its profile fails", async () => {
    const user = userEvent.setup()
    vi.mocked(browser.tabs.create).mockRejectedValueOnce(
      new Error("Tab unavailable"),
    )
    render(
      <AutoDetectErrorAlert
        error={{
          type: AutoDetectErrorType.ACCESS_TOKEN_VERIFICATION_REQUIRED,
          message: "Enter a System token",
        }}
        siteUrl="https://api2.laozhang.ai"
        siteType={SITE_TYPES.LAOZHANG}
      />,
    )
    await user.click(
      screen.getByRole("button", {
        name: "accessTokenVerification.laozhang.openProfile",
      }),
    )
    expect(
      await screen.findByText(
        "accessTokenVerification.laozhang.openProfileFailed",
      ),
    ).toHaveAttribute("role", "alert")
  })
  it.each([
    [AutoDetectErrorType.NETWORK_ERROR, "bg-destructive-soft"],
    [AutoDetectErrorType.TIMEOUT, "bg-destructive-soft"],
    [AutoDetectErrorType.UNAUTHORIZED, "bg-warning-soft"],
    [AutoDetectErrorType.CURRENT_TAB_RELOAD_REQUIRED, "bg-warning-soft"],
  ])(
    "distinguishes detection failure from an unmet prerequisite: %s",
    (type, surface) => {
      render(
        <AutoDetectErrorAlert
          error={{ type, message: "Detection feedback" }}
        />,
      )
      expect(screen.getByRole("alert")).toHaveClass(surface)
    },
  )
  beforeEach(() => {
    clearSiteRouteFactsCacheForTests()
    server.use(
      http.get("*/", () => HttpResponse.html("<title>New API</title>")),
    )
    server.use(
      http.get("*/api/status", () =>
        HttpResponse.json({ success: true, data: {} }),
      ),
    )
    openLoginTabMock.mockReset()
    reloadCurrentTabMock.mockReset()
    openApiCredentialProfilesPageMock.mockReset()
    openSiteSupportRequestPageMock.mockReset()
    trackProductAnalyticsEventMock.mockReset()
    trackProductAnalyticsEventMock.mockResolvedValue(true)
    ;(browser.tabs as any).create = vi.fn()
  })

  it("keeps access-token recovery in the popup until the user continues in a persistent view", async () => {
    const user = userEvent.setup()
    const onContinue = vi.fn()

    render(
      <AutoDetectErrorAlert
        error={{
          type: AutoDetectErrorType.ACCESS_TOKEN_VERIFICATION_REQUIRED,
          message: "Complete security verification on the site",
        }}
        siteUrl="https://site.example.com"
        siteType={SITE_TYPES.NEW_API}
        manualAddGuideAnchor={ACCOUNT_SITE_MANUAL_ADD_GUIDE_ANCHORS.NewApi}
        accessTokenContinuation={{
          onContinue,
          isPending: false,
          sidePanelSupported: true,
        }}
      />,
    )

    expect(screen.getByText("accessTokenVerification.title")).toBeVisible()
    expect(screen.getByText("accessTokenVerification.popupHint")).toBeVisible()
    expect(
      screen.queryByRole("button", {
        name: "accessTokenVerification.openSecurity",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "actions.openManualAddGuide" }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("apiCredentialFallback.title"),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "accessTokenVerification.continueInSidePanel",
      }),
    )

    expect(onContinue).toHaveBeenCalledTimes(1)
    expect(browser.tabs.create).not.toHaveBeenCalled()
  })

  it("opens the New API access-token location from a persistent view and explains token rotation", async () => {
    server.use(
      http.get("*/api/status", () =>
        HttpResponse.json({ success: true, data: { theme: "default" } }),
      ),
    )
    const user = userEvent.setup()
    render(
      <AutoDetectErrorAlert
        error={{
          type: AutoDetectErrorType.ACCESS_TOKEN_VERIFICATION_REQUIRED,
          message: "Verify on the site",
        }}
        siteUrl="http://local.example.test/new-api"
        siteType={SITE_TYPES.NEW_API}
        manualAddGuideAnchor={ACCOUNT_SITE_MANUAL_ADD_GUIDE_ANCHORS.NewApi}
      />,
    )
    expect(
      screen.getByText("accessTokenVerification.generateStep"),
    ).toBeVisible()
    expect(screen.getByText("accessTokenVerification.pasteStep")).toBeVisible()
    expect(
      screen.getByText("accessTokenVerification.rotationWarning"),
    ).toBeVisible()
    await user.click(
      screen.getByRole("button", {
        name: "accessTokenVerification.openSecurity",
      }),
    )
    await waitFor(() =>
      expect(browser.tabs.create).toHaveBeenCalledWith({
        url: "http://local.example.test/new-api/security#security-access",
        active: true,
      }),
    )
    expect(
      screen.getByRole("button", { name: "actions.openManualAddGuide" }),
    ).toBeVisible()
    expect(
      screen.queryByText("apiCredentialFallback.title"),
    ).not.toBeInTheDocument()
  })

  it("guides APIyi verification to System token in the profile and prepares manual entry", async () => {
    const user = userEvent.setup()
    const onPrepareAccessTokenInput = vi.fn()
    render(
      <AutoDetectErrorAlert
        error={{
          type: AutoDetectErrorType.ACCESS_TOKEN_VERIFICATION_REQUIRED,
          message: "Verify on the site",
        }}
        siteUrl="https://api.apiyi.com"
        siteType={SITE_TYPES.APIYI}
        onPrepareAccessTokenInput={onPrepareAccessTokenInput}
      />,
    )

    expect(
      screen.getByText("accessTokenVerification.apiyi.generateStep"),
    ).toBeVisible()
    expect(
      screen.queryByText("accessTokenVerification.rotationWarning"),
    ).not.toBeInTheDocument()
    await user.click(
      screen.getByRole("button", {
        name: "accessTokenVerification.apiyi.openProfile",
      }),
    )

    expect(onPrepareAccessTokenInput).toHaveBeenCalledTimes(1)
    expect(browser.tabs.create).toHaveBeenCalledWith({
      url: "https://api.apiyi.com/account/profile",
      active: true,
    })
  })

  it("gives the APIyi profile location when opening the page fails", async () => {
    const user = userEvent.setup()
    vi.mocked(browser.tabs.create).mockRejectedValueOnce(
      new Error("Tab unavailable"),
    )
    render(
      <AutoDetectErrorAlert
        error={{
          type: AutoDetectErrorType.ACCESS_TOKEN_VERIFICATION_REQUIRED,
          message: "Verify on the site",
        }}
        siteUrl="https://api.apiyi.com"
        siteType={SITE_TYPES.APIYI}
      />,
    )

    await user.click(
      screen.getByRole("button", {
        name: "accessTokenVerification.apiyi.openProfile",
      }),
    )

    expect(
      await screen.findByText(
        "accessTokenVerification.apiyi.openProfileFailed",
      ),
    ).toHaveAttribute("role", "alert")
  })

  it("prepares the token input even when opening the security page fails and allows retry", async () => {
    const user = userEvent.setup()
    const onPrepareAccessTokenInput = vi.fn()
    vi.mocked(browser.tabs.create).mockRejectedValueOnce(
      new Error("Tab unavailable"),
    )
    render(
      <AutoDetectErrorAlert
        error={{
          type: AutoDetectErrorType.ACCESS_TOKEN_VERIFICATION_REQUIRED,
          message: "Verify on the site",
        }}
        siteUrl="https://site.example.com"
        siteType={SITE_TYPES.NEW_API}
        onPrepareAccessTokenInput={onPrepareAccessTokenInput}
      />,
    )
    const openSecurity = screen.getByRole("button", {
      name: "accessTokenVerification.openSecurity",
    })

    await user.click(openSecurity)

    expect(
      await screen.findByText("accessTokenVerification.openSecurityFailed"),
    ).toHaveAttribute("role", "alert")
    expect(onPrepareAccessTokenInput).toHaveBeenCalledTimes(1)
    expect(onPrepareAccessTokenInput.mock.invocationCallOrder[0]).toBeLessThan(
      atIndex(vi.mocked(browser.tabs.create).mock.invocationCallOrder, 0),
    )
    await user.click(openSecurity)
    expect(onPrepareAccessTokenInput).toHaveBeenCalledTimes(2)
    expect(
      screen.queryByText("accessTokenVerification.openSecurityFailed"),
    ).not.toBeInTheDocument()
  })

  it("shows only the message when no action or help recovery is available", () => {
    render(
      <AutoDetectErrorAlert
        error={{
          type: AutoDetectErrorType.NETWORK_ERROR,
          message: "Detection failed",
        }}
      />,
    )

    expect(screen.getByText("Detection failed")).toBeInTheDocument()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("prefers custom action and help handlers over default recovery behavior", () => {
    const onActionClick = vi.fn()
    const onHelpClick = vi.fn()

    render(
      <AutoDetectErrorAlert
        error={{
          type: AutoDetectErrorType.UNAUTHORIZED,
          message: "Please log in",
          actionText: "Retry login",
          helpDocUrl: "https://docs.example.com/autodetect",
        }}
        siteUrl="https://site.example.com"
        onActionClick={onActionClick}
        onHelpClick={onHelpClick}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Retry login" }))
    fireEvent.click(
      screen.getByRole("button", {
        name: "actions.helpDocument",
      }),
    )

    expect(onActionClick).toHaveBeenCalledTimes(1)
    expect(onHelpClick).toHaveBeenCalledTimes(1)
    expect(openLoginTabMock).not.toHaveBeenCalled()
    expect(reloadCurrentTabMock).not.toHaveBeenCalled()
    expect(browser.tabs.create).not.toHaveBeenCalled()
  })

  it("uses the default login redirect for unauthorized errors when a site URL is available", () => {
    render(
      <AutoDetectErrorAlert
        error={{
          type: AutoDetectErrorType.UNAUTHORIZED,
          message: "Please log in",
          actionText: "Retry login",
        }}
        siteUrl="https://site.example.com"
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Retry login" }))

    expect(openLoginTabMock).toHaveBeenCalledWith(
      "https://site.example.com",
      undefined,
    )
    expect(reloadCurrentTabMock).not.toHaveBeenCalled()
  })

  it("passes the current site type hint to the default login redirect", () => {
    render(
      <AutoDetectErrorAlert
        error={{
          type: AutoDetectErrorType.UNAUTHORIZED,
          message: "Please log in",
          actionText: "Retry login",
        }}
        siteUrl="https://site.example.com"
        siteType={SITE_TYPES.NEW_API}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Retry login" }))

    expect(openLoginTabMock).toHaveBeenCalledWith(
      "https://site.example.com",
      SITE_TYPES.NEW_API,
    )
  })

  it("does nothing for unauthorized recovery when the site URL is missing", () => {
    render(
      <AutoDetectErrorAlert
        error={{
          type: AutoDetectErrorType.UNAUTHORIZED,
          message: "Please log in",
          actionText: "Retry login",
        }}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Retry login" }))

    expect(openLoginTabMock).not.toHaveBeenCalled()
    expect(reloadCurrentTabMock).not.toHaveBeenCalled()
  })

  it("reloads the current tab for reload-required errors", () => {
    render(
      <AutoDetectErrorAlert
        error={{
          type: AutoDetectErrorType.CURRENT_TAB_RELOAD_REQUIRED,
          message: "Reload required",
          actionText: "Reload this page",
        }}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Reload this page" }))

    expect(reloadCurrentTabMock).toHaveBeenCalledTimes(1)
    expect(openLoginTabMock).not.toHaveBeenCalled()
  })

  it("opens the help document in a new tab when no custom help handler is provided", () => {
    render(
      <AutoDetectErrorAlert
        error={{
          type: AutoDetectErrorType.UNKNOWN,
          message: "Need help",
          helpDocUrl: "https://docs.example.com/autodetect",
        }}
      />,
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "actions.helpDocument",
      }),
    )

    expect(browser.tabs.create).toHaveBeenCalledWith({
      url: "https://docs.example.com/autodetect",
      active: true,
    })
  })

  it("offers the site-specific manual completion guide after detection fails", () => {
    render(
      <AutoDetectErrorAlert
        error={{
          type: AutoDetectErrorType.INVALID_RESPONSE,
          message: "Detection stopped before all fields were available",
        }}
        siteUrl="https://relay.example.invalid"
        siteType={SITE_TYPES.NEW_API}
        manualAddGuideAnchor={ACCOUNT_SITE_MANUAL_ADD_GUIDE_ANCHORS.NewApi}
      />,
    )

    expect(screen.getByText("manualAddRecovery.title")).toBeInTheDocument()
    expect(
      screen.getByText("manualAddRecovery.description"),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "actions.openManualAddGuide",
      }),
    )

    expect(browser.tabs.create).toHaveBeenCalledTimes(1)
    const createdUrl = new URL(
      atIndex(vi.mocked(browser.tabs.create).mock.calls, 0)[0].url!,
    )
    expect(createdUrl.pathname).toContain("/en/add-account")
    expect(createdUrl.hash).toBe("#manual-new-api")
  })

  it("opens a prefilled site-support request from auto-detect failures", () => {
    render(
      <AutoDetectErrorAlert
        error={{
          type: AutoDetectErrorType.NOT_FOUND,
          message: "Site was not recognized",
        }}
        siteUrl="https://relay.example.com/console"
      />,
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "actions.reportUnsupportedSite",
      }),
    )

    expect(openSiteSupportRequestPageMock).toHaveBeenCalledWith({
      siteUrl: "https://relay.example.com/console",
      errorType: AutoDetectErrorType.NOT_FOUND,
      errorMessage: "Site was not recognized",
    })
  })

  it.each([
    AutoDetectErrorType.INVALID_RESPONSE,
    AutoDetectErrorType.NOT_FOUND,
    AutoDetectErrorType.FORBIDDEN,
    AutoDetectErrorType.UNKNOWN,
  ])("shows API credential recovery for %s auto-detect failures", (type) => {
    render(
      <AutoDetectErrorAlert
        error={{
          type,
          message: "Detection failed",
        }}
        siteUrl="https://relay.example.com/console"
      />,
    )

    expect(
      screen.getByText("apiCredentialFallback.apiCredentials.description"),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "actions.openApiCredentialProfiles",
      }),
    ).toBeInTheDocument()
  })

  it("guides users to API credential profiles after detection failures with a site URL", () => {
    render(
      <AutoDetectErrorAlert
        error={{
          type: AutoDetectErrorType.INVALID_RESPONSE,
          message: "Unexpected site response",
        }}
        siteUrl="https://relay.example.com/console"
      />,
    )

    expect(
      screen.getByText("apiCredentialFallback.siteSupport.description"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("apiCredentialFallback.apiCredentials.description"),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "actions.openApiCredentialProfiles",
      }),
    )

    expect(openApiCredentialProfilesPageMock).toHaveBeenCalledTimes(1)
    expect(trackProductAnalyticsEventMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.OpenUnifiedApiGuidanceAction,
        surface_id:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountDialogAutoDetectRecovery,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        target_kind: PRODUCT_ANALYTICS_TARGET_KINDS.OptionsPage,
        target_page_id: "apiCredentialProfiles",
        guidance_action_kind:
          PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_ACTION_KINDS.SaveApiCredentialRecovery,
      },
    )
    expect(
      vi.mocked(trackProductAnalyticsEventMock).mock.calls.at(-1)?.[1],
    ).not.toHaveProperty("guidance_status")
  })

  it("prefers a custom API credential profiles handler when provided", () => {
    const onApiCredentialProfilesClick = vi.fn()

    render(
      <AutoDetectErrorAlert
        error={{
          type: AutoDetectErrorType.INVALID_RESPONSE,
          message: "Unexpected site response",
        }}
        siteUrl="https://relay.example.com/console"
        onApiCredentialProfilesClick={onApiCredentialProfilesClick}
      />,
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "actions.openApiCredentialProfiles",
      }),
    )

    expect(onApiCredentialProfilesClick).toHaveBeenCalledTimes(1)
    expect(openApiCredentialProfilesPageMock).not.toHaveBeenCalled()
    expect(trackProductAnalyticsEventMock).not.toHaveBeenCalled()
  })

  it("keeps the existing primary action before API credential recovery", () => {
    render(
      <AutoDetectErrorAlert
        error={{
          type: AutoDetectErrorType.FORBIDDEN,
          message: "Detection was forbidden",
          actionText: "Retry detection",
          helpDocUrl: "https://docs.example.invalid/autodetect",
        }}
        siteUrl="https://relay.example.invalid/console"
      />,
    )

    const alert = screen.getByText("Detection was forbidden").closest("div")

    expect(
      within(alert as HTMLElement)
        .getAllByRole("button")
        .map((action) => action.textContent),
    ).toEqual(["Retry detection", "actions.helpDocument"])
    expect(
      screen.getByRole("button", {
        name: "actions.openApiCredentialProfiles",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "actions.reportUnsupportedSite",
      }),
    ).toBeInTheDocument()
  })

  it("does not replace unauthorized login recovery with API credential recovery", () => {
    render(
      <AutoDetectErrorAlert
        error={{
          type: AutoDetectErrorType.UNAUTHORIZED,
          message: "Please log in",
          actionText: "Retry login",
        }}
        siteUrl="https://site.example.com"
      />,
    )

    expect(
      screen.queryByText("apiCredentialFallback.apiCredentials.description"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "actions.openApiCredentialProfiles",
      }),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Retry login" }))

    expect(openLoginTabMock).toHaveBeenCalledWith(
      "https://site.example.com",
      undefined,
    )
    expect(openApiCredentialProfilesPageMock).not.toHaveBeenCalled()
  })

  it("renders the exact-match duplicate warning for numeric user ids and stringifies missing usernames", () => {
    const onCancel = vi.fn()
    const onContinue = vi.fn()
    const onDisableWarningAndContinue = vi.fn()

    render(
      <DuplicateAccountWarningDialog
        isOpen
        siteUrl="https://site.example.com"
        existingAccountsCount={2}
        existingUserId={42}
        existingUsername={null}
        onCancel={onCancel}
        onContinue={onContinue}
        onDisableWarningAndContinue={onDisableWarningAndContinue}
      />,
    )

    expect(
      screen.getByText(
        JSON.stringify({
          key: "accountDialog:warnings.duplicateAccount.descriptionExact",
          options: {
            siteUrl: "https://site.example.com",
            userId: "42",
            username: "",
          },
        }),
      ),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "common:actions.cancel",
      }),
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "accountDialog:warnings.duplicateAccount.actions.continue",
      }),
    )

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onContinue).toHaveBeenCalledTimes(1)
    expect(onDisableWarningAndContinue).not.toHaveBeenCalled()
  })

  it("offers a secondary action that disables future duplicate warnings and continues", () => {
    const onDisableWarningAndContinue = vi.fn()

    render(
      <DuplicateAccountWarningDialog
        isOpen
        siteUrl="https://site.example.com"
        existingAccountsCount={2}
        onCancel={vi.fn()}
        onContinue={vi.fn()}
        onDisableWarningAndContinue={onDisableWarningAndContinue}
      />,
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "accountDialog:warnings.duplicateAccount.actions.disableAndContinue",
      }),
    )

    expect(onDisableWarningAndContinue).toHaveBeenCalledTimes(1)
  })

  it("renders managed-site setup guidance, its deployment docs, and wires both actions", () => {
    const onClose = vi.fn()
    const onOpenSettings = vi.fn()

    render(
      <ManagedSiteConfigPromptDialog
        isOpen
        managedSiteLabel="New API"
        managedSiteType={SITE_TYPES.NEW_API}
        missingMessage="Please configure New API first"
        onClose={onClose}
        onOpenSettings={onOpenSettings}
      />,
    )

    expect(
      screen.getByText(
        JSON.stringify({
          key: "accountDialog:warnings.managedSiteConfig.title",
          options: {
            managedSite: "New API",
          },
        }),
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        JSON.stringify({
          key: "accountDialog:warnings.managedSiteConfig.alertTitle",
          options: {
            managedSite: "New API",
          },
        }),
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        JSON.stringify({
          key: "accountDialog:warnings.managedSiteConfig.description",
          options: {
            message: "Please configure New API first",
          },
        }),
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        JSON.stringify({
          key: "accountDialog:warnings.managedSiteConfig.benefit",
          options: {
            managedSite: "New API",
          },
        }),
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        JSON.stringify({
          key: "accountDialog:warnings.managedSiteConfig.nextSteps",
          options: {
            managedSite: "New API",
          },
        }),
      ),
    ).toBeInTheDocument()

    // Users who do not run a managed site yet must be able to reach its
    // official deployment docs, without claiming the settings search anchor.
    const deploymentDocsLink = screen.getByRole("link")
    expect(deploymentDocsLink).toHaveAttribute(
      "href",
      "https://docs.newapi.ai/en/docs/installation",
    )
    expect(deploymentDocsLink).not.toHaveAttribute("id")

    fireEvent.click(
      screen.getByRole("button", {
        name: "accountDialog:warnings.managedSiteConfig.actions.later",
      }),
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "accountDialog:warnings.managedSiteConfig.actions.openSettings",
      }),
    )

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })

  it("omits the deployment docs link when no managed site type is resolved", () => {
    render(
      <ManagedSiteConfigPromptDialog
        isOpen
        managedSiteLabel="New API"
        managedSiteType={null}
        missingMessage="Please configure New API first"
        onClose={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    )

    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })

  it("renders the exact-match duplicate warning for non-empty string user ids", () => {
    render(
      <DuplicateAccountWarningDialog
        isOpen
        siteUrl="https://site.example.com"
        existingAccountsCount={5}
        existingUserId="user-7"
        existingUsername="alice"
        onCancel={vi.fn()}
        onContinue={vi.fn()}
        onDisableWarningAndContinue={vi.fn()}
      />,
    )

    expect(
      screen.getByText(
        JSON.stringify({
          key: "accountDialog:warnings.duplicateAccount.descriptionExact",
          options: {
            siteUrl: "https://site.example.com",
            userId: "user-7",
            username: "alice",
          },
        }),
      ),
    ).toBeInTheDocument()
  })

  it("falls back to the generic duplicate warning when the existing user id is blank", () => {
    render(
      <DuplicateAccountWarningDialog
        isOpen
        siteUrl="https://site.example.com"
        existingAccountsCount={3}
        existingUserId="   "
        existingUsername="alice"
        onCancel={vi.fn()}
        onContinue={vi.fn()}
        onDisableWarningAndContinue={vi.fn()}
      />,
    )

    expect(
      screen.getByText(
        JSON.stringify({
          key: "accountDialog:warnings.duplicateAccount.description",
          options: {
            siteUrl: "https://site.example.com",
            count: 3,
          },
        }),
      ),
    ).toBeInTheDocument()
  })
})
