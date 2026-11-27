import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { expect, it, vi } from "vitest"

import { NewApiTokenVerificationFields } from "~/features/AccountManagement/components/AccountDialog/newApiToken/NewApiTokenVerificationFields"
import type { NewApiTokenVerification } from "~/services/apiService/newApiFamily/accessTokens/creation"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

it("lets the user select icon-assisted verification methods by keyboard or click", async () => {
  function Fields() {
    const [method, setMethod] =
      useState<NewApiTokenVerification["method"]>("password")
    const [provider, setProvider] = useState("linuxdo")
    const [secret, setSecret] = useState("")
    return (
      <NewApiTokenVerificationFields
        verification={{
          scope: "access_token.generate",
          password_encryption_enabled: false,
          methods: [
            { method: "password", available: true },
            { method: "oauth", available: true },
            { method: "passkey", available: false, reason: "No passkey" },
          ],
          oauth_providers: [
            { slug: "linuxdo", name: "Linux DO" },
            { slug: "github", name: "GitHub" },
          ],
        }}
        method={method}
        setMethod={setMethod}
        provider={provider}
        setProvider={setProvider}
        secret={secret}
        setSecret={setSecret}
        disabled={false}
      />
    )
  }
  const user = userEvent.setup()
  render(<Fields />)
  const options = screen.getByRole("radiogroup", {
    name: "tokenCreation.verification",
  })
  const password = within(options).getByRole("radio", {
    name: "tokenCreation.methodPassword",
  })
  expect(password).toHaveClass("sr-only")
  expect(
    password.closest("label")?.querySelector(".lucide-lock"),
  ).toBeInTheDocument()
  expect(
    within(options).getByRole("radio", { name: /No passkey/ }),
  ).toBeDisabled()
  const secretInput = screen.getByLabelText<HTMLInputElement>(
    "tokenCreation.password",
  )
  expect(secretInput.labels?.item(0)).not.toHaveClass("sr-only")
  expect(secretInput.closest(".grid")).toHaveClass("sm:grid-cols-2")
  expect(
    screen.queryByText("tokenCreation.passwordHelp"),
  ).not.toBeInTheDocument()
  await user.type(secretInput, "old secret")
  await user.click(password)
  await user.keyboard("{ArrowRight}")
  expect(within(options).getByRole("radio", { name: "Linux DO" })).toBeChecked()
  await user.click(screen.getByRole("radio", { name: "GitHub" }))
  expect(screen.getByRole("radio", { name: "GitHub" })).toBeChecked()
  expect(screen.queryByLabelText("tokenCreation.password")).toBeNull()
  await user.click(
    screen.getByRole("radio", { name: "tokenCreation.methodPassword" }),
  )
  expect(screen.getByLabelText("tokenCreation.password")).toHaveValue("")
})

it("shows a revealable password with its icon and no choice for a single method", async () => {
  const user = userEvent.setup()
  render(
    <NewApiTokenVerificationFields
      verification={{
        scope: "access_token.generate",
        password_encryption_enabled: false,
        methods: [{ method: "password", available: true }],
        oauth_providers: [],
      }}
      method="password"
      setMethod={vi.fn()}
      provider=""
      setProvider={vi.fn()}
      secret=""
      setSecret={vi.fn()}
      disabled={false}
    />,
  )
  expect(screen.queryByRole("radiogroup")).toBeNull()
  expect(screen.queryByRole("radio")).toBeNull()
  const password = screen.getByLabelText<HTMLInputElement>(
    "tokenCreation.password",
  )
  const heading = screen.getByRole("heading", {
    name: "tokenCreation.verification",
  })
  const helper = screen.getByText("tokenCreation.passwordHelp")
  expect(heading.nextElementSibling).toBe(helper)
  expect(helper).toHaveClass("text-xs", "text-muted-foreground")
  expect(password).toHaveAccessibleDescription("tokenCreation.passwordHelp")
  expect(password.labels?.item(0)).toHaveClass("sr-only")
  expect(password.closest(".grid")).toHaveClass("sm:grid-cols-2")
  expect(password).toHaveAttribute("type", "password")
  expect(password).toHaveAttribute("autocomplete", "current-password")
  expect(password).toHaveAttribute(
    "placeholder",
    "tokenCreation.passwordPlaceholder",
  )
  expect(
    password.parentElement?.querySelector(".lucide-lock"),
  ).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "login.showPassword" }))
  expect(password).toHaveAttribute("type", "text")
  await user.click(screen.getByRole("button", { name: "login.hidePassword" }))
  expect(password).toHaveAttribute("type", "password")
})

it("keeps the sole 2FA input labeled with a muted helper under the identity heading", () => {
  render(
    <NewApiTokenVerificationFields
      verification={{
        scope: "access_token.generate",
        password_encryption_enabled: false,
        methods: [{ method: "2fa", available: true }],
        oauth_providers: [],
      }}
      method="2fa"
      setMethod={vi.fn()}
      provider=""
      setProvider={vi.fn()}
      secret=""
      setSecret={vi.fn()}
      disabled={false}
    />,
  )
  expect(screen.queryByRole("radio")).not.toBeInTheDocument()
  const heading = screen.getByRole("heading", {
    name: "tokenCreation.verification",
  })
  const helper = screen.getByText("tokenCreation.codeHelp")
  const code = screen.getByRole<HTMLInputElement>("textbox", {
    name: "tokenCreation.code",
  })
  expect(heading.nextElementSibling).toBe(helper)
  expect(helper).toHaveClass("text-xs", "text-muted-foreground")
  expect(code.labels?.item(0)).toHaveClass("sr-only")
  expect(code).toHaveAccessibleDescription("tokenCreation.codeHelp")
  expect(code.closest(".grid")).toHaveClass("sm:grid-cols-2")
})

it("confirms the named provider when OAuth is the only available option", () => {
  render(
    <NewApiTokenVerificationFields
      verification={{
        scope: "access_token.generate",
        password_encryption_enabled: false,
        methods: [{ method: "oauth", available: true }],
        oauth_providers: [{ slug: "linuxdo", name: "Linux DO" }],
      }}
      method="oauth"
      setMethod={vi.fn()}
      provider="linuxdo"
      setProvider={vi.fn()}
      secret=""
      setSecret={vi.fn()}
      disabled={false}
    />,
  )
  expect(screen.queryByRole("radio")).toBeNull()
  expect(screen.getByText("tokenCreation.oauthConfirmation")).toBeVisible()
})
