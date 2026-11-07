import "./copyKeyDialogMocks"

import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import CopyKeyDialog from "~/features/AccountManagement/components/CopyKeyDialog"
import {
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  AccountKeyResourceError,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { AuthTypeEnum } from "~/types"
import { openTargetedOptionsPage } from "~/utils/navigation/optionsPage"
import { render, screen } from "~~/tests/test-utils/render"

import { fetchAccountTokensMock } from "./copyKeyDialogMocks"
import {
  ACCOUNT,
  setupCopyKeyDialogTestDefaults,
  TOKEN,
} from "./copyKeyDialogTestSupport"

vi.mock("~/utils/navigation/optionsPage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/navigation/optionsPage")>()),
  openTargetedOptionsPage: vi.fn().mockResolvedValue(undefined),
}))

const account = {
  ...ACCOUNT,
  siteType: SITE_TYPES.ANYROUTER,
  authType: AuthTypeEnum.Cookie,
  cookieAuthSessionCookie: "session=old",
}

describe("copy key credential recovery guidance", () => {
  beforeEach(setupCopyKeyDialogTestDefaults)

  it.each([
    new ApiError("login rejected", 401, "/api/token/"),
    new AccountKeyResourceError({
      code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.AuthenticationFailed,
      message: "login rejected",
    }),
  ])(
    "offers login configuration after an authentication failure (%s)",
    async (error) => {
      fetchAccountTokensMock.mockRejectedValueOnce(error)
      const user = userEvent.setup()
      const onClose = vi.fn()
      render(<CopyKeyDialog isOpen account={account} onClose={onClose} />)
      expect(
        await screen.findByText("ui:dialog.copyKey.getFailed"),
      ).toBeVisible()
      expect(
        screen.getByRole("button", { name: "ui:dialog.copyKey.retry" }),
      ).toBeVisible()
      await user.click(
        screen.getByRole("button", {
          name: "accountDialog:login.configureRecovery",
        }),
      )
      expect(onClose).toHaveBeenCalledTimes(1)
      expect(openTargetedOptionsPage).toHaveBeenCalledWith(
        expect.objectContaining({
          targetHash: "#account",
          inPageSearchParams: {
            action: "edit",
            accountId: account.id,
            focusSection: "account-login",
          },
        }),
      )
    },
  )

  it.each([
    new ApiError(
      "verification required",
      401,
      "/api/token/",
      API_ERROR_CODES.ROBOT_CHALLENGE,
    ),
    new ApiError(
      "offline",
      undefined,
      "/api/token/",
      API_ERROR_CODES.NETWORK_ERROR,
    ),
  ])(
    "does not offer login recovery for protection or network failure (%s)",
    async (error) => {
      fetchAccountTokensMock.mockRejectedValueOnce(error)
      render(<CopyKeyDialog isOpen account={account} onClose={vi.fn()} />)
      await screen.findByText("ui:dialog.copyKey.getFailed")
      expect(
        screen.queryByRole("button", {
          name: "accountDialog:login.configureRecovery",
        }),
      ).not.toBeInTheDocument()
    },
  )

  it("removes the failure guidance after a successful retry", async () => {
    fetchAccountTokensMock.mockRejectedValueOnce(
      new ApiError("login rejected", 401, "/api/token/"),
    )
    fetchAccountTokensMock.mockResolvedValueOnce([TOKEN])
    const user = userEvent.setup()
    render(<CopyKeyDialog isOpen account={account} onClose={vi.fn()} />)
    await screen.findByRole("button", {
      name: "accountDialog:login.configureRecovery",
    })
    await user.click(
      screen.getByRole("button", { name: "ui:dialog.copyKey.retry" }),
    )
    await screen.findByText("default")
    expect(
      screen.queryByRole("button", {
        name: "accountDialog:login.configureRecovery",
      }),
    ).not.toBeInTheDocument()
  })
})
