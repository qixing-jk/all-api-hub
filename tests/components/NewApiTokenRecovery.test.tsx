import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, it, vi } from "vitest"

import { NewApiTokenRecovery } from "~/features/AccountManagement/components/AccountDialog/newApiToken/NewApiTokenRecovery"
import type { NewApiAccessTokenCreation } from "~/services/apiService/newApiFamily/accessTokens/creation"
import { createDeferred } from "~~/tests/test-utils/deferred"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

it("requires an explicit token selection and fresh verification before revoking", async () => {
  const item = {
    id: 7,
    name: "Attempt to recover",
    created_at: 100,
    expires_at: 0,
    scopes: ["profile:read"],
  }
  let items = [item]
  const attempt = createDeferred<boolean>()
  const revokeToken = vi
    .fn(async () => {
      items = []
      return false
    })
    .mockImplementationOnce(() => attempt.promise)
  const flow = {
    loadRecovery: vi.fn(async () => ({
      items,
      verification: {
        methods: [{ method: "password", available: true }],
        oauth_providers: [],
        password_encryption_enabled: false,
      },
    })),
    revokeToken,
    reviewRecovery: vi.fn().mockResolvedValue(false),
  } as unknown as NewApiAccessTokenCreation
  const reviewed = vi.fn()
  const user = userEvent.setup()
  render(<NewApiTokenRecovery flow={flow} onReviewed={reviewed} />)
  const revoke = await screen.findByRole("button", {
    name: "tokenCreation.revokeSelected",
  })
  expect(revoke).toBeDisabled()
  await user.click(screen.getByRole("radio", { name: /Attempt to recover/ }))
  expect(revoke).toBeDisabled()
  const password = screen.getByLabelText("tokenCreation.password")
  await user.type(password, "secret")
  await user.click(revoke)
  expect(revoke).toHaveAttribute("aria-busy", "true")
  await act(() => attempt.reject(new Error("Rejected")))
  expect(screen.getByRole("alert")).toHaveTextContent(
    "tokenCreation.recoveryFailed",
  )
  expect(password).toHaveValue("secret")
  expect(revoke).toBeEnabled()
  await user.click(revoke)
  await screen.findByText("tokenCreation.revoked")
  expect(revokeToken).toHaveBeenCalledWith(7, {
    method: "password",
    password: "secret",
  })
  expect(reviewed).not.toHaveBeenCalled()
  await user.click(
    screen.getByRole("button", { name: "tokenCreation.reviewComplete" }),
  )
  expect(reviewed).toHaveBeenCalledOnce()
})
