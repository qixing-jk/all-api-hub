import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  ACCOUNT_COOKIE_VALIDATION_REASONS,
  ACCOUNT_COOKIE_VALIDATION_STATUS,
} from "~/constants/accountCookieValidation"
import { SITE_TYPES } from "~/constants/siteType"
import { AccountCookieVerification } from "~/features/AccountManagement/components/AccountDialog/form/AccountCookieVerification"
import { atIndex } from "~~/tests/test-utils/indexedAccess"
import { render, screen } from "~~/tests/test-utils/render"

const deps = vi.hoisted(() => ({ verify: vi.fn() }))
vi.mock("~/services/accounts/cookieValidation", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("~/services/accounts/cookieValidation")
  >()),
  validateAccountCookie: deps.verify,
}))
const props = {
  siteType: SITE_TYPES.ANYROUTER,
  siteUrl: "https://anyrouter.top",
  userId: "17",
  cookie: "session=original",
}
const action = () =>
  screen.findByRole("button", { name: "accountDialog:cookieValidation.action" })

it("offers configured login recovery after rejection without starting it during verification", async () => {
  const user = userEvent.setup()
  deps.verify.mockResolvedValue({
    status: ACCOUNT_COOKIE_VALIDATION_STATUS.Invalid,
  })
  const recover = vi.fn()
  render(
    <AccountCookieVerification
      {...props}
      recovery={{
        configured: true,
        pending: false,
        onRecover: recover,
        onConfigure: vi.fn(),
      }}
    />,
  )
  await user.click(await action())
  const recovery = await screen.findByRole("button", {
    name: "accountDialog:cookieValidation.recover",
  })
  expect(recover).not.toHaveBeenCalled()
  await user.click(recovery)
  expect(recover).toHaveBeenCalledOnce()
})

describe("Saved Cookie diagnostic", () => {
  beforeEach(() => {
    deps.verify.mockReset()
  })

  it("refreshes confirmation for the same Cookie after a failed probe and binds it to the identity", async () => {
    const evidence = { ...props }
    const view = render(
      <AccountCookieVerification {...props} verifiedCookie={evidence} />,
    )
    expect(await screen.findByRole("status")).toHaveTextContent(
      "cookieValidation.valid",
    )
    deps.verify.mockResolvedValue({
      status: ACCOUNT_COOKIE_VALIDATION_STATUS.Invalid,
    })
    await userEvent.click(await action())
    expect(await screen.findByRole("status")).toHaveTextContent(
      "cookieValidation.invalid",
    )
    view.rerender(
      <AccountCookieVerification {...props} verifiedCookie={{ ...evidence }} />,
    )
    expect(await screen.findByRole("status")).toHaveTextContent(
      "cookieValidation.valid",
    )
    view.rerender(
      <AccountCookieVerification
        {...props}
        userId="18"
        verifiedCookie={evidence}
      />,
    )
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  it("disables verification and recovery while an imported Cookie is being checked", async () => {
    deps.verify.mockResolvedValue({
      status: ACCOUNT_COOKIE_VALIDATION_STATUS.Invalid,
    })
    const recovery = {
      configured: true,
      pending: false,
      onRecover: vi.fn(),
      onConfigure: vi.fn(),
    }
    const view = render(
      <AccountCookieVerification {...props} recovery={recovery} />,
    )
    await userEvent.click(await action())
    await screen.findByRole("status")
    view.rerender(
      <AccountCookieVerification {...props} recovery={recovery} busy />,
    )
    expect(await action()).toBeDisabled()
    expect(
      screen.getByRole("button", {
        name: "accountDialog:cookieValidation.recover",
      }),
    ).toBeDisabled()
  })

  it("opens login configuration after rejection when no login is configured", async () => {
    deps.verify.mockResolvedValue({
      status: ACCOUNT_COOKIE_VALIDATION_STATUS.Invalid,
    })
    const configure = vi.fn()
    render(
      <AccountCookieVerification
        {...props}
        recovery={{
          configured: false,
          pending: false,
          onRecover: vi.fn(),
          onConfigure: configure,
        }}
      />,
    )
    await userEvent.click(await action())
    await userEvent.click(
      await screen.findByRole("button", {
        name: "accountDialog:login.configureRecovery",
      }),
    )
    expect(configure).toHaveBeenCalledOnce()
  })

  it("does not recommend login recovery for an unconfirmed website challenge", async () => {
    deps.verify.mockResolvedValue({
      status: ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable,
      reason: ACCOUNT_COOKIE_VALIDATION_REASONS.Verification,
    })
    render(
      <AccountCookieVerification
        {...props}
        recovery={{
          configured: true,
          pending: false,
          onRecover: vi.fn(),
          onConfigure: vi.fn(),
        }}
      />,
    )
    await userEvent.click(await action())
    await screen.findByRole("status")
    expect(
      screen.queryByRole("button", {
        name: "accountDialog:cookieValidation.recover",
      }),
    ).not.toBeInTheDocument()
  })

  it("accepts a confirmed imported Cookie without another probe and clears it after editing", async () => {
    const view = render(
      <AccountCookieVerification {...props} verifiedCookie={{ ...props }} />,
    )
    expect(await screen.findByRole("status")).toHaveTextContent(
      "cookieValidation.valid",
    )
    expect(deps.verify).not.toHaveBeenCalled()
    view.rerender(
      <AccountCookieVerification
        {...props}
        cookie="session=edited"
        verifiedCookie={{ ...props }}
      />,
    )
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  it.each([
    ACCOUNT_COOKIE_VALIDATION_STATUS.Valid,
    ACCOUNT_COOKIE_VALIDATION_STATUS.Invalid,
    ACCOUNT_COOKIE_VALIDATION_STATUS.IdentityMismatch,
    ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable,
  ])("runs only on request and displays %s independently", async (status) => {
    const user = userEvent.setup()
    deps.verify.mockResolvedValue({
      status,
      reason: ACCOUNT_COOKIE_VALIDATION_REASONS.Verification,
    })
    render(<AccountCookieVerification {...props} />)
    expect(deps.verify).not.toHaveBeenCalled()
    await user.click(await action())
    expect(await screen.findByRole("status")).toHaveTextContent(
      status === ACCOUNT_COOKIE_VALIDATION_STATUS.IdentityMismatch
        ? "cookieValidation.identityMismatch"
        : `cookieValidation.${status}`,
    )
    expect(atIndex(deps.verify.mock.calls, 0)[0]).toMatchObject({
      cookieAuth: { sessionCookie: props.cookie },
      account_info: { id: props.userId },
      protectionBypassExecution: {
        kind: "user_command",
        command: "detect_account",
      },
    })
    expect(
      atIndex(deps.verify.mock.calls, 0)[0].account_info.access_token,
    ).toBeUndefined()
  })

  it("clears previous evidence after the Cookie is edited", async () => {
    const user = userEvent.setup()
    deps.verify.mockResolvedValue({
      status: ACCOUNT_COOKIE_VALIDATION_STATUS.Invalid,
    })
    const view = render(<AccountCookieVerification {...props} />)
    await user.click(await action())
    await screen.findByRole("status")
    view.rerender(
      <AccountCookieVerification {...props} cookie="session=changed" />,
    )
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  it.each(["cookie", "siteUrl", "userId"])(
    "aborts and ignores stale results when %s changes",
    async (field) => {
      const user = userEvent.setup()
      let finish!: (result: {
        status: typeof ACCOUNT_COOKIE_VALIDATION_STATUS.Valid
      }) => void
      deps.verify.mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve
          }),
      )
      const view = render(<AccountCookieVerification {...props} />)
      await user.click(await action())
      const signal = atIndex(deps.verify.mock.calls, 0)[0].abortSignal
      view.rerender(
        <AccountCookieVerification {...props} {...{ [field]: "changed" }} />,
      )
      expect(signal.aborted).toBe(true)
      finish({ status: ACCOUNT_COOKIE_VALIDATION_STATUS.Valid })
      await Promise.resolve()
      expect(screen.queryByRole("status")).not.toBeInTheDocument()
    },
  )

  it("does not enable verification for an empty Cookie", async () => {
    render(<AccountCookieVerification {...props} cookie="" />)
    expect(await action()).toBeDisabled()
    expect(deps.verify).not.toHaveBeenCalled()
  })

  it.each([
    [ACCOUNT_COOKIE_VALIDATION_REASONS.Permission, "permissionRequired"],
    [ACCOUNT_COOKIE_VALIDATION_REASONS.Unsupported, "unsupported"],
  ])("explains an unavailable %s diagnostic", async (reason, message) => {
    const user = userEvent.setup()
    deps.verify.mockResolvedValue({
      status: ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable,
      reason,
    })
    render(<AccountCookieVerification {...props} />)
    await user.click(await action())
    expect(await screen.findByRole("status")).toHaveTextContent(
      `cookieValidation.${message}`,
    )
  })

  it("prevents duplicate pending checks and allows retry after an unavailable result", async () => {
    const user = userEvent.setup()
    let finish!: (result: {
      status: typeof ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable
      reason: typeof ACCOUNT_COOKIE_VALIDATION_REASONS.Network
    }) => void
    deps.verify.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    render(<AccountCookieVerification {...props} />)
    const button = await action()
    await user.click(button)
    expect(button).toBeDisabled()
    await user.click(button)
    expect(deps.verify).toHaveBeenCalledTimes(1)
    finish({
      status: ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable,
      reason: ACCOUNT_COOKIE_VALIDATION_REASONS.Network,
    })
    await screen.findByRole("status")
    deps.verify.mockResolvedValue({
      status: ACCOUNT_COOKIE_VALIDATION_STATUS.Valid,
    })
    await user.click(await action())
    expect(await screen.findByRole("status")).toHaveTextContent(
      "cookieValidation.valid",
    )
    expect(deps.verify).toHaveBeenCalledTimes(2)
  })

  it("cancels a pending check when its editor closes", async () => {
    const user = userEvent.setup()
    deps.verify.mockImplementation(() => new Promise(() => {}))
    const view = render(<AccountCookieVerification {...props} />)
    await user.click(await action())
    const signal = atIndex(deps.verify.mock.calls, 0)[0].abortSignal
    view.unmount()
    expect(signal.aborted).toBe(true)
  })
})
