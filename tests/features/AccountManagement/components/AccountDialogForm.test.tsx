import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"
import { describe, expect, it, vi } from "vitest"

import { SUB2API, UNKNOWN_SITE } from "~/constants/siteType"
import AccountForm from "~/features/AccountManagement/components/AccountDialog/AccountForm"
import { createEmptyAccountDialogDraft } from "~/features/AccountManagement/components/AccountDialog/models"
import { AuthTypeEnum, type CheckInConfig } from "~/types"
import { fireEvent, render, screen } from "~~/tests/test-utils/render"

vi.mock("~/features/AccountManagement/components/TagPicker", () => ({
  TagPicker: ({
    selectedTagIds,
    onSelectedTagIdsChange,
    placeholder,
  }: {
    selectedTagIds: string[]
    onSelectedTagIdsChange: (value: string[]) => void
    placeholder: string
  }) => (
    <button
      type="button"
      onClick={() => onSelectedTagIdsChange([...selectedTagIds, "tag-1"])}
    >
      {placeholder}
    </button>
  ),
}))

vi.mock("~/utils/core/formatters", () => ({
  formatLocaleDateTime: vi.fn(() => "formatted-expiry"),
}))

describe("AccountDialog AccountForm", () => {
  const createCheckIn = (
    overrides: Partial<CheckInConfig> = {},
  ): CheckInConfig =>
    ({
      enableDetection: false,
      autoCheckInEnabled: undefined,
      customCheckIn: undefined,
      ...overrides,
    }) as CheckInConfig

  const createProps = (): ComponentProps<typeof AccountForm> => ({
    draft: {
      ...createEmptyAccountDialogDraft(),
      authType: AuthTypeEnum.AccessToken,
      siteName: "Example Site",
      username: "alice",
      userId: "12",
      accessToken: "secret-token",
      exchangeRate: "7.2",
      manualBalanceUsd: "",
      notes: "existing note",
      tagIds: [],
      excludeFromTotalBalance: false,
      cookieAuthSessionCookie: "",
      sub2apiUseRefreshToken: false,
      sub2apiRefreshToken: "",
      sub2apiTokenExpiresAt: null,
      siteType: UNKNOWN_SITE,
      checkIn: createCheckIn(),
    },
    isManualBalanceUsdInvalid: false,
    showAccessToken: false,
    isImportingCookies: false,
    showCookiePermissionWarning: false,
    isImportingSub2apiSession: false,
    onSiteNameChange: vi.fn(),
    onUsernameChange: vi.fn(),
    onUserIdChange: vi.fn(),
    onAccessTokenChange: vi.fn(),
    onExchangeRateChange: vi.fn(),
    onManualBalanceUsdChange: vi.fn(),
    onToggleShowAccessToken: vi.fn(),
    onNotesChange: vi.fn(),
    onSelectedTagIdsChange: vi.fn(),
    onExcludeFromTotalBalanceChange: vi.fn(),
    onCookieAuthSessionCookieChange: vi.fn(),
    onImportCookieAuthSessionCookie: vi.fn(),
    onOpenCookiePermissionSettings: vi.fn(),
    onSub2apiUseRefreshTokenChange: vi.fn(),
    onSub2apiRefreshTokenChange: vi.fn(),
    onImportSub2apiSession: vi.fn(),
    tags: [],
    tagCountsById: {},
    createTag: vi.fn(),
    renameTag: vi.fn(),
    deleteTag: vi.fn(),
    onSiteTypeChange: vi.fn(),
    onCheckInChange: vi.fn(),
  })

  it("propagates core field edits, exposes access-token controls, and surfaces validation states", async () => {
    const user = userEvent.setup()
    const props = createProps()
    props.draft.exchangeRate = "0"
    props.draft.manualBalanceUsd = "-1"
    props.isManualBalanceUsdInvalid = true

    render(<AccountForm {...props} />)

    const accessTokenInput = await screen.findByDisplayValue("secret-token")
    expect(accessTokenInput).toHaveAttribute("type", "password")
    expect(
      screen.getByText("accountDialog:form.validRateError"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("accountDialog:form.manualBalanceUsdError"),
    ).toBeInTheDocument()

    fireEvent.change(await screen.findByDisplayValue("Example Site"), {
      target: { value: "Example Site Updated" },
    })
    fireEvent.change(screen.getByDisplayValue("alice"), {
      target: { value: "alice cooper" },
    })
    fireEvent.change(
      screen.getByPlaceholderText("accountDialog:form.userIdNumber"),
      {
        target: { value: "77" },
      },
    )
    fireEvent.change(accessTokenInput, {
      target: { value: "secret-token next" },
    })
    await user.click(
      screen.getByRole("button", {
        name: "accountDialog:form.toggleAccessTokenVisibility",
      }),
    )
    fireEvent.change(
      screen.getByPlaceholderText("accountDialog:form.exchangeRatePlaceholder"),
      { target: { value: "8.8" } },
    )
    fireEvent.change(
      screen.getByPlaceholderText(
        "accountDialog:form.manualBalanceUsdPlaceholder",
      ),
      { target: { value: "12.5" } },
    )
    await user.click(
      screen.getByRole("switch", {
        name: "accountDialog:form.excludeFromTotalBalance",
      }),
    )
    await user.click(
      screen.getByRole("button", {
        name: "accountDialog:form.tagsPlaceholder",
      }),
    )
    fireEvent.change(
      screen.getByPlaceholderText("accountDialog:form.notesPlaceholder"),
      {
        target: { value: "existing note updated" },
      },
    )

    expect(props.onSiteNameChange).toHaveBeenLastCalledWith(
      "Example Site Updated",
    )
    expect(props.onUsernameChange).toHaveBeenLastCalledWith("alice cooper")
    expect(props.onUserIdChange).toHaveBeenLastCalledWith("77")
    expect(props.onAccessTokenChange).toHaveBeenLastCalledWith(
      "secret-token next",
    )
    expect(props.onToggleShowAccessToken).toHaveBeenCalledTimes(1)
    expect(props.onExchangeRateChange).toHaveBeenLastCalledWith("8.8")
    expect(props.onManualBalanceUsdChange).toHaveBeenLastCalledWith("12.5")
    expect(props.onExcludeFromTotalBalanceChange).toHaveBeenCalledWith(true)
    expect(props.onSelectedTagIdsChange).toHaveBeenCalledWith(["tag-1"])
    expect(props.onNotesChange).toHaveBeenLastCalledWith(
      "existing note updated",
    )
  })

  it("shows cookie-auth import fallback UI and permission guidance when cookie auth is selected", async () => {
    const user = userEvent.setup()
    const props = createProps()
    props.draft.authType = AuthTypeEnum.Cookie
    props.draft.cookieAuthSessionCookie = "session=abc"
    props.isImportingCookies = true
    props.showCookiePermissionWarning = true

    render(<AccountForm {...props} />)

    expect(
      await screen.findByText(
        "accountDialog:messages.importCookiesPermissionDenied",
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "accountDialog:messages.importCookiesLoading",
      }),
    ).toBeDisabled()

    await user.click(
      screen.getByRole("button", {
        name: "accountDialog:form.cookiePermissionHelpAction",
      }),
    )
    fireEvent.change(screen.getByDisplayValue("session=abc"), {
      target: { value: "session=abc; Path=/" },
    })

    expect(props.onOpenCookiePermissionSettings).toHaveBeenCalledTimes(1)
    expect(props.onCookieAuthSessionCookieChange).toHaveBeenLastCalledWith(
      "session=abc; Path=/",
    )
  })

  it("renders Sub2API refresh-token controls, visibility toggles, and expiry metadata", async () => {
    const user = userEvent.setup()
    const props = createProps()
    props.draft.siteType = SUB2API
    props.draft.sub2apiUseRefreshToken = true
    props.draft.sub2apiRefreshToken = "refresh-secret"
    props.draft.sub2apiTokenExpiresAt = 1700000000000
    props.isImportingSub2apiSession = true

    render(<AccountForm {...props} />)

    expect(
      await screen.findByText(
        "accountDialog:form.sub2apiRefreshTokenWarningTitle",
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText("accountDialog:form.sub2apiCheckInUnsupported"),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("switch", {
        name: "accountDialog:form.checkInStatus",
      }),
    ).toBeDisabled()
    expect(screen.getByDisplayValue("formatted-expiry")).toBeDisabled()

    const refreshTokenInput = screen.getByDisplayValue("refresh-secret")
    expect(refreshTokenInput).toHaveAttribute("type", "password")

    await user.click(
      screen.getByRole("button", {
        name: "accountDialog:form.toggleRefreshTokenVisibility",
      }),
    )
    expect(screen.getByDisplayValue("refresh-secret")).toHaveAttribute(
      "type",
      "text",
    )

    fireEvent.change(screen.getByDisplayValue("refresh-secret"), {
      target: { value: "refresh-secret-next" },
    })
    await user.click(
      screen.getByRole("switch", {
        name: "accountDialog:form.sub2apiRefreshTokenMode",
      }),
    )

    expect(props.onSub2apiRefreshTokenChange).toHaveBeenLastCalledWith(
      "refresh-secret-next",
    )
    expect(props.onSub2apiUseRefreshTokenChange).toHaveBeenCalledWith(false)
    expect(props.onImportSub2apiSession).not.toHaveBeenCalled()
    expect(
      screen.getByRole("button", {
        name: /accountDialog:form\.sub2apiImportRefreshToken/i,
      }),
    ).toBeDisabled()
  })

  it("updates check-in toggles and custom check-in config with the expected fallback defaults", async () => {
    const user = userEvent.setup()
    const props = createProps()

    const { rerender } = render(<AccountForm {...props} />)

    await user.click(
      await screen.findByRole("switch", {
        name: "accountDialog:form.checkInStatus",
      }),
    )
    expect(props.onCheckInChange).toHaveBeenCalledWith({
      ...props.draft.checkIn,
      enableDetection: true,
      autoCheckInEnabled: true,
    })

    fireEvent.change(screen.getByPlaceholderText("https://cdk.example.com/"), {
      target: { value: "https://check.example.com/" },
    })
    expect(props.onCheckInChange).toHaveBeenLastCalledWith({
      ...props.draft.checkIn,
      customCheckIn: {
        openRedeemWithCheckIn: true,
        url: "https://check.example.com/",
      },
    })

    const nextCheckIn = createCheckIn({
      enableDetection: true,
      autoCheckInEnabled: false,
      customCheckIn: {
        url: "https://check.example.com/",
        openRedeemWithCheckIn: false,
        redeemUrl: "",
      },
    })
    props.draft.checkIn = nextCheckIn

    rerender(<AccountForm {...props} />)

    await user.click(
      screen.getByRole("switch", {
        name: "accountDialog:form.autoCheckInEnabled",
      }),
    )
    expect(props.onCheckInChange).toHaveBeenCalledWith({
      ...nextCheckIn,
      autoCheckInEnabled: true,
    })

    await user.click(
      screen.getByRole("switch", {
        name: "accountDialog:form.openRedeemWithCheckIn",
      }),
    )
    expect(props.onCheckInChange).toHaveBeenCalledWith({
      ...nextCheckIn,
      customCheckIn: {
        ...nextCheckIn.customCheckIn,
        openRedeemWithCheckIn: true,
      },
    })

    fireEvent.change(
      screen.getByPlaceholderText("https://example.com/console/topup"),
      { target: { value: "https://redeem.example.com/" } },
    )
    expect(props.onCheckInChange).toHaveBeenLastCalledWith({
      ...nextCheckIn,
      customCheckIn: {
        ...nextCheckIn.customCheckIn,
        redeemUrl: "https://redeem.example.com/",
      },
    })
  })
})
