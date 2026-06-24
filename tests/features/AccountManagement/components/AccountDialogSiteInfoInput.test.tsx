import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"
import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import SiteInfoInput from "~/features/AccountManagement/components/AccountDialog/SiteInfoInput"
import { getAccountDialogSitePolicy } from "~/features/AccountManagement/components/AccountDialog/sitePolicy"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { AuthTypeEnum } from "~/types"
import { fireEvent, render, screen } from "~~/tests/test-utils/render"

describe("AccountDialog SiteInfoInput", () => {
  type AddModeSiteInfoInputProps = Extract<
    ComponentProps<typeof SiteInfoInput>,
    { showAuthTypeSelector: true }
  > & {
    testSiteType?: AccountSiteType
  }

  const createAddModeProps = (): AddModeSiteInfoInputProps => ({
    url: "https://api.example.com",
    onUrlChange: vi.fn(),
    isDetected: false,
    onClearUrl: vi.fn(),
    testSiteType: SITE_TYPES.NEW_API,
    sitePolicy: getAccountDialogSitePolicy(SITE_TYPES.NEW_API),
    authType: AuthTypeEnum.AccessToken,
    onAuthTypeChange: vi.fn(),
    onRequestCookieAuthPermissions: vi.fn(),
    showAuthTypeSelector: true,
    currentTabUrl: "https://current.example.com",
    isCurrentSiteAdded: false,
    detectedAccount: null,
    onUseCurrentTab: vi.fn(),
    onEditAccount: vi.fn(),
  })

  const withSitePolicy = (
    props: ComponentProps<typeof SiteInfoInput> & {
      testSiteType?: AccountSiteType
    },
  ): ComponentProps<typeof SiteInfoInput> => {
    const { testSiteType, ...componentProps } = props

    return {
      ...componentProps,
      sitePolicy: getAccountDialogSitePolicy(
        testSiteType ?? SITE_TYPES.UNKNOWN,
      ),
    }
  }

  it("propagates URL edits, clears the field, and reuses the current tab URL", async () => {
    const user = userEvent.setup()
    const props = createAddModeProps()

    render(<SiteInfoInput {...withSitePolicy(props)} />)

    const urlInput = await screen.findByLabelText(
      "accountDialog:siteInfo.siteUrl",
    )
    expect(urlInput).toBeEnabled()
    expect(screen.getByText("https://current.example.com")).toBeInTheDocument()

    fireEvent.change(urlInput, {
      target: { value: "https://updated.example.com" },
    })
    expect(props.onUrlChange).toHaveBeenLastCalledWith(
      "https://updated.example.com",
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.clear" }),
    )
    expect(props.onClearUrl).toHaveBeenCalledTimes(1)

    const useCurrentButton = screen.getByRole("button", {
      name: "accountDialog:siteInfo.useCurrent",
    })
    expect(useCurrentButton).toBeEnabled()

    await user.click(useCurrentButton)
    expect(props.onUseCurrentTab).toHaveBeenCalledTimes(1)
  })

  it("lets users choose auth type before entering the form", async () => {
    const user = userEvent.setup()
    const props = createAddModeProps()

    render(<SiteInfoInput {...withSitePolicy(props)} />)

    expect(
      await screen.findByLabelText("accountDialog:siteInfo.authMethod"),
    ).toBeEnabled()
    expect(
      screen.getByRole("button", {
        name: "accountDialog:siteInfo.cookieWarning",
      }),
    ).toBeInTheDocument()

    await user.click(
      await screen.findByTestId("account-management-auth-type-trigger"),
    )
    await user.click(
      await screen.findByRole("option", {
        name: "accountDialog:siteInfo.authType.cookieAuth",
      }),
    )

    expect(props.onAuthTypeChange).toHaveBeenCalledWith(AuthTypeEnum.Cookie)
  })

  it("shows one pre-detection cookie permission action when cookie auth is selected", async () => {
    const user = userEvent.setup()
    const props = createAddModeProps()
    props.authType = AuthTypeEnum.Cookie
    props.cookieAuthPermissionsGranted = false

    render(<SiteInfoInput {...withSitePolicy(props)} />)

    expect(
      await screen.findByText(
        "accountDialog:form.cookiePermissionRecommendationDesc",
      ),
    ).toBeInTheDocument()

    await user.click(
      screen.getByTestId(
        ACCOUNT_MANAGEMENT_TEST_IDS.cookiePermissionGrantButton,
      ),
    )

    expect(props.onRequestCookieAuthPermissions).toHaveBeenCalledTimes(1)
  })

  it("hides the cookie permission action for Sub2API even when stale cookie auth is selected", async () => {
    const props = createAddModeProps()
    props.testSiteType = SITE_TYPES.SUB2API
    props.authType = AuthTypeEnum.Cookie
    props.cookieAuthPermissionsGranted = false

    render(<SiteInfoInput {...withSitePolicy(props)} />)

    expect(
      await screen.findByText("accountDialog:siteInfo.sub2apiHint"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(
        "accountDialog:form.cookiePermissionRecommendationDesc",
      ),
    ).not.toBeInTheDocument()
  })

  it("stacks auth above the URL before switching to a wide two-column layout", async () => {
    const props = createAddModeProps()

    render(<SiteInfoInput {...withSitePolicy(props)} />)

    const urlInput = await screen.findByLabelText(
      "accountDialog:siteInfo.siteUrl",
    )
    const authTypeTrigger = screen.getByTestId(
      "account-management-auth-type-trigger",
    )

    const container = authTypeTrigger.closest(
      "[data-layout='site-auth-url-container']",
    )
    const layout = authTypeTrigger.closest(
      "[data-layout='site-auth-url-layout']",
    )
    expect(container).toHaveClass("[container-type:inline-size]")
    expect(layout).toHaveClass(
      "grid",
      "[@container(min-width:28rem)]:grid-cols-[minmax(0,1fr)_auto]",
    )
    expect(
      authTypeTrigger.closest("[data-layout='auth-type-field']"),
    ).toHaveClass(
      "order-1",
      "max-w-full",
      "[@container(min-width:28rem)]:order-2",
    )
    expect(urlInput.closest("[data-layout='site-url-field']")).toHaveClass(
      "order-2",
      "w-full",
      "min-w-0",
      "[@container(min-width:28rem)]:order-1",
    )
    expect(authTypeTrigger).toHaveAttribute("data-size", "default")
    expect(authTypeTrigger).toHaveClass("data-[size=default]:h-9")
  })

  it("shows the generic already-added warning and disables current-tab reuse when the tab URL is unavailable", async () => {
    const props = createAddModeProps()
    props.currentTabUrl = null
    props.isCurrentSiteAdded = true

    render(<SiteInfoInput {...withSitePolicy(props)} />)

    expect(
      await screen.findByText("accountDialog:siteInfo.alreadyAdded"),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "accountDialog:siteInfo.editNow",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText("accountDialog:siteInfo.unknown"),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "accountDialog:siteInfo.useCurrent",
      }),
    ).toBeDisabled()
  })

  it("locks the site fields for detected Sub2API sites and hides the add-mode current-tab helper", async () => {
    const props = createAddModeProps()
    props.isDetected = true
    props.testSiteType = SITE_TYPES.SUB2API

    render(<SiteInfoInput {...withSitePolicy(props)} />)

    expect(
      await screen.findByText("accountDialog:siteInfo.sub2apiHint"),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText("accountDialog:siteInfo.siteUrl"),
    ).toBeDisabled()
    expect(
      screen.queryByRole("button", { name: "common:actions.clear" }),
    ).toBeNull()
    expect(
      screen.queryByRole("button", {
        name: "accountDialog:siteInfo.useCurrent",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId("account-management-auth-type-trigger"),
    ).not.toBeInTheDocument()
  })

  it("keeps the entry auth selector visible but locked for add-mode Sub2API", async () => {
    const props = createAddModeProps()
    props.testSiteType = SITE_TYPES.SUB2API

    render(<SiteInfoInput {...withSitePolicy(props)} />)

    expect(
      await screen.findByText("accountDialog:siteInfo.sub2apiHint"),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText("accountDialog:siteInfo.authMethod"),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", {
        name: "accountDialog:siteInfo.sub2apiAuthOnly",
      }),
    ).toBeInTheDocument()
  })

  it("shows the current-login warning and forwards edit requests for the detected account", async () => {
    const user = userEvent.setup()
    const props = createAddModeProps()
    const detectedAccount = {
      id: "account-1",
      name: "Existing Account",
      baseUrl: "https://api.example.com",
      username: "alice",
    } as any

    props.isCurrentSiteAdded = true
    props.detectedAccount = detectedAccount

    render(<SiteInfoInput {...withSitePolicy(props)} />)

    expect(
      await screen.findByText(
        "accountDialog:siteInfo.currentLoginAlreadyAdded",
      ),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "accountDialog:siteInfo.editNow",
      }),
    )

    expect(props.onEditAccount).toHaveBeenCalledWith(detectedAccount)
  })

  it("renders the plain URL-only layout when the entry auth selector is disabled", async () => {
    const props: ComponentProps<typeof SiteInfoInput> = {
      url: "https://api.example.com",
      onUrlChange: vi.fn(),
      isDetected: false,
      onClearUrl: vi.fn(),
      sitePolicy: getAccountDialogSitePolicy(SITE_TYPES.NEW_API),
      currentTabUrl: "https://current.example.com",
      isCurrentSiteAdded: false,
      detectedAccount: null,
      onUseCurrentTab: vi.fn(),
      onEditAccount: vi.fn(),
    }

    render(<SiteInfoInput {...withSitePolicy(props)} />)

    const urlInput = await screen.findByLabelText(
      "accountDialog:siteInfo.siteUrl",
    )
    fireEvent.change(urlInput, {
      target: { value: "https://manual.example.com" },
    })

    expect(props.onUrlChange).toHaveBeenLastCalledWith(
      "https://manual.example.com",
    )
    expect(
      screen.queryByTestId("account-management-auth-type-trigger"),
    ).not.toBeInTheDocument()
  })
})
