import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"
import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import SiteInfoInput from "~/features/AccountManagement/components/AccountDialog/SiteInfoInput"
import { AuthTypeEnum } from "~/types"
import { fireEvent, render, screen } from "~~/tests/test-utils/render"

describe("AccountDialog SiteInfoInput", () => {
  type AddModeSiteInfoInputProps = Extract<
    ComponentProps<typeof SiteInfoInput>,
    { showAuthTypeSelector: true }
  >

  const createAddModeProps = (): AddModeSiteInfoInputProps => ({
    url: "https://api.example.com",
    onUrlChange: vi.fn(),
    isDetected: false,
    onClearUrl: vi.fn(),
    siteType: "new-api",
    authType: AuthTypeEnum.AccessToken,
    onAuthTypeChange: vi.fn(),
    showAuthTypeSelector: true,
    currentTabUrl: "https://current.example.com",
    isCurrentSiteAdded: false,
    detectedAccount: null,
    onUseCurrentTab: vi.fn(),
    onEditAccount: vi.fn(),
  })

  it("propagates URL edits, clears the field, and reuses the current tab URL", async () => {
    const user = userEvent.setup()
    const props = createAddModeProps()

    render(<SiteInfoInput {...props} />)

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

    render(<SiteInfoInput {...props} />)

    expect(
      await screen.findByLabelText("accountDialog:siteInfo.authMethod"),
    ).toBeEnabled()

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

  it("shows the generic already-added warning and disables current-tab reuse when the tab URL is unavailable", async () => {
    const props = createAddModeProps()
    props.currentTabUrl = null
    props.isCurrentSiteAdded = true

    render(<SiteInfoInput {...props} />)

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
    props.siteType = SITE_TYPES.SUB2API

    render(<SiteInfoInput {...props} />)

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
    props.siteType = SITE_TYPES.SUB2API

    render(<SiteInfoInput {...props} />)

    expect(
      await screen.findByText("accountDialog:siteInfo.sub2apiHint"),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText("accountDialog:siteInfo.authMethod"),
    ).toBeDisabled()
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

    render(<SiteInfoInput {...props} />)

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
      siteType: "new-api",
      currentTabUrl: "https://current.example.com",
      isCurrentSiteAdded: false,
      detectedAccount: null,
      onUseCurrentTab: vi.fn(),
      onEditAccount: vi.fn(),
    }

    render(<SiteInfoInput {...props} />)

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
