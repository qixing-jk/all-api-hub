import { act, render, screen, waitFor, within } from "@testing-library/react"
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
    scopes: ["profile:read", "__proto__"],
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
  const token = await screen.findByRole("radio", { name: /Attempt to recover/ })
  const permissions = screen.getByText("tokenCreation.permissions (2)")
  const profile = screen.getByText("tokenCreation.profileRead")
  expect(profile).not.toBeVisible()
  await user.click(permissions)
  expect(profile).toBeVisible()
  expect(screen.getByText("__proto__")).toBeVisible()
  expect(token).not.toBeChecked()
  expect(
    screen.queryByRole("button", { name: "tokenCreation.revokeSelected" }),
  ).not.toBeInTheDocument()
  await user.click(token)
  const revoke = screen.getByRole("button", {
    name: "tokenCreation.revokeSelected",
  })
  expect(revoke).toBeDisabled()
  const password = screen.getByLabelText("tokenCreation.password")
  await user.type(password, "secret")
  await user.click(revoke)
  expect(revoke).toHaveAttribute("aria-busy", "true")
  await act(() => attempt.reject(new Error("Rejected")))
  const revokeRegion = screen.getByRole("region", {
    name: "tokenCreation.revokeHeading",
  })
  const revokeError = within(revokeRegion).getByRole("alert")
  expect(revokeError).toHaveTextContent("tokenCreation.recoveryFailed")
  expect(revokeError).toHaveFocus()
  expect(password).toHaveValue("secret")
  expect(revoke).toBeEnabled()
  await user.click(
    screen.getByRole("button", { name: "tokenCreation.cancelTokenSelection" }),
  )
  const confirm = screen.getByRole("button", {
    name: "tokenCreation.reviewComplete",
  })
  await waitFor(() => expect(confirm).toBeEnabled())
  expect(flow.loadRecovery).toHaveBeenCalledTimes(2)
  await user.click(token)
  await user.type(screen.getByLabelText("tokenCreation.password"), "secret")
  await user.click(
    screen.getByRole("button", { name: "tokenCreation.revokeSelected" }),
  )
  await screen.findByText("tokenCreation.revoked")
  expect(
    screen.queryByRole("button", { name: "tokenCreation.revokeSelected" }),
  ).not.toBeInTheDocument()
  expect(revokeToken).toHaveBeenCalledWith(7, {
    method: "password",
    password: "secret",
  })
  expect(reviewed).not.toHaveBeenCalled()
  await user.click(
    screen.getByRole("button", { name: "common:actions.refresh" }),
  )
  expect(screen.queryByText("tokenCreation.revoked")).not.toBeInTheDocument()
  await waitFor(() => expect(confirm).toBeEnabled())
  await user.click(confirm)
  expect(reviewed).toHaveBeenCalledOnce()
})

it("recovers after reconnect and requires a successful server review", async () => {
  const user = userEvent.setup()
  const reconnect = vi.fn()
  const onReviewed = vi.fn()
  const loadRecovery = vi
    .fn()
    .mockRejectedValueOnce(new Error("Session lost"))
    .mockResolvedValue({
      items: [],
      verification: {
        methods: [],
        oauth_providers: [],
        password_encryption_enabled: false,
      },
    })
  const reviewRecovery = vi
    .fn()
    .mockRejectedValueOnce(new Error("Unavailable"))
    .mockResolvedValue(true)
  const flow = {
    loadRecovery,
    reviewRecovery,
  } as unknown as NewApiAccessTokenCreation
  const view = render(
    <NewApiTokenRecovery
      flow={flow}
      onReviewed={onReviewed}
      onReconnect={reconnect}
      sessionRevision={0}
    />,
  )
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "tokenCreation.recoveryFailed",
  )
  await user.click(
    screen.getByRole("button", { name: "tokenCreation.reconnect" }),
  )
  expect(reconnect).toHaveBeenCalledOnce()
  view.rerender(
    <NewApiTokenRecovery
      flow={flow}
      onReviewed={onReviewed}
      onReconnect={reconnect}
      reconnecting
      sessionRevision={0}
    />,
  )
  expect(
    screen.getByRole("button", { name: "tokenCreation.reconnect" }),
  ).toBeDisabled()
  view.rerender(
    <NewApiTokenRecovery
      flow={flow}
      onReviewed={onReviewed}
      onReconnect={reconnect}
      sessionRevision={1}
    />,
  )
  expect(await screen.findByText("tokenCreation.noTokens")).toBeVisible()
  const done = screen.getByRole("button", {
    name: "tokenCreation.reviewComplete",
  })
  await user.click(done)
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "tokenCreation.recoveryFailed",
  )
  expect(done).toBeDisabled()
  expect(onReviewed).not.toHaveBeenCalled()
  await user.click(
    screen.getByRole("button", { name: "common:actions.refresh" }),
  )
  expect(await screen.findByText("tokenCreation.noTokens")).toBeVisible()
  await user.click(done)
  expect(onReviewed).toHaveBeenCalledExactlyOnceWith(true)
})
