import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"
import { describe, expect, it, vi } from "vitest"

import { SUB2API } from "~/constants/siteType"
import SiteInfoInput from "~/features/AccountManagement/components/AccountDialog/SiteInfoInput"
import { AuthTypeEnum } from "~/types"
import { fireEvent, render, screen } from "~~/tests/test-utils/render"

describe("AccountDialog SiteInfoInput", () => {
  const createProps = (): ComponentProps<typeof SiteInfoInput> => ({
    url: "https://api.example.com",
    onUrlChange: vi.fn(),
    isDetected: false,
    onClearUrl: vi.fn(),
    siteType: "new-api",
    authType: AuthTypeEnum.AccessToken,
    onAuthTypeChange: vi.fn(),
    currentTabUrl: "https://current.example.com",
    isCurrentSiteAdded: false,
    detectedAccount: null,
    onUseCurrentTab: vi.fn(),
    onEditAccount: vi.fn(),
  })

  it("propagates URL edits, clears the field, changes auth type, and reuses the current tab URL", async () => {
    const user = userEvent.setup()
    const props = createProps()

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

    await user.click(
      screen.getByRole("combobox", {
        name: "accountDialog:siteInfo.authMethod",
      }),
    )
    await user.click(
      await screen.findByRole("option", {
        name: "accountDialog:siteInfo.authType.cookieAuth",
      }),
    )
    expect(props.onAuthTypeChange).toHaveBeenCalledWith(AuthTypeEnum.Cookie)

    const useCurrentButton = screen.getByRole("button", {
      name: "accountDialog:siteInfo.useCurrent",
    })
    expect(useCurrentButton).toBeEnabled()

    await user.click(useCurrentButton)
    expect(props.onUseCurrentTab).toHaveBeenCalledTimes(1)
  })

  it("shows the generic already-added warning and disables current-tab reuse when the tab URL is unavailable", async () => {
    const props = createProps()
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
    const props = createProps()
    props.isDetected = true
    props.siteType = SUB2API

    render(<SiteInfoInput {...props} />)

    expect(
      await screen.findByText("accountDialog:siteInfo.sub2apiHint"),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText("accountDialog:siteInfo.siteUrl"),
    ).toBeDisabled()
    expect(
      screen.getByRole("combobox", {
        name: "accountDialog:siteInfo.authMethod",
      }),
    ).toBeDisabled()
    expect(
      screen.queryByRole("button", { name: "common:actions.clear" }),
    ).toBeNull()
    expect(
      screen.queryByRole("button", {
        name: "accountDialog:siteInfo.useCurrent",
      }),
    ).not.toBeInTheDocument()
  })

  it("shows the current-login warning and forwards edit requests for the detected account", async () => {
    const user = userEvent.setup()
    const props = createProps()
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
})
