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
import { expect, it, vi } from "vitest"

import { NewApiAccessTokenForm } from "~/features/AccountManagement/components/AccountDialog/newApiToken/NewApiAccessTokenForm"
import { classifyVerificationError } from "~/features/AccountManagement/components/AccountDialog/newApiToken/tokenCreationFeedback"
import {
  NewApiAccessTokenCreation,
  NewApiTokenCreationUncertainError,
  type NewApiCreatedToken,
  type NewApiTokenVerification,
} from "~/services/apiService/newApiFamily/accessTokens/creation"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { createDeferred } from "~~/tests/test-utils/deferred"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { count?: number }) =>
      key === "tokenCreation.expiryDaysOption" ? `${values?.count} days` : key,
  }),
}))

const expiration = () =>
  screen.getByRole("combobox", { name: "tokenCreation.expiration" })

it.each([
  [
    "locked verification",
    new ApiError(
      "Private message",
      400,
      "/api/verify",
      undefined,
      "SECURITY_VERIFICATION_LOCKED",
    ),
    "locked",
  ],
  [
    "server token cap",
    new ApiError(
      "Private message",
      409,
      "/api/user/access_tokens",
      undefined,
      "ACCESS_TOKEN_LIMIT",
    ),
    "limit",
  ],
  [
    "changed OAuth identity",
    new ApiError(
      "Private message",
      400,
      "/api/verify",
      undefined,
      "OAUTH_ACCOUNT_MISMATCH",
    ),
    "identity",
  ],
  [
    "expired browser session",
    new ApiError("Private message", 401, "/api/verify"),
    "session",
  ],
  [
    "site credential rejection",
    new ApiError("Private message", 422, "/api/verify"),
    "invalidPassword",
  ],
  [
    "provider proxy timeout",
    new ApiError("Private message", 408, "/api/verify"),
    "failed",
  ],
  [
    "client-side protection",
    new ApiError(
      "Private message",
      403,
      "/api/verify",
      API_ERROR_CODES.CONTENT_TYPE_MISMATCH,
    ),
    "failed",
  ],
  [
    "upstream protection code",
    new ApiError(
      "Private message",
      403,
      "/api/verify",
      undefined,
      API_ERROR_CODES.ROBOT_CHALLENGE,
    ),
    "failed",
  ],
  ["native Passkey dismissal", new Error("PASSKEY_CANCELLED"), "cancelled"],
  ["unknown messaging failure", "unstructured message", "failed"],
] as const)(
  "uses actionable verification feedback for %s",
  (_case, error, expected) => {
    expect(classifyVerificationError(error, "password")).toBe(expected)
  },
)

async function selectExpiration(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  await user.click(expiration())
  await user.click(await screen.findByRole("option", { name }))
}

function setupGrantForm(
  includeReserved = true,
  defaultDays = 30,
  method: NewApiTokenVerification["method"] = "password",
  onReconnect?: () => void,
) {
  const resources = [
    {
      resource: "profile",
      actions: includeReserved ? ["read", "write"] : ["read"],
    },
    { resource: "wallet", actions: ["read", "write"] },
    { resource: "api_key", actions: ["read", "write", "reveal"] },
    { resource: "usage", actions: ["read"] },
    ...(includeReserved ? [{ resource: "audit", actions: ["read"] }] : []),
  ]
  const create = vi
    .fn()
    .mockResolvedValue({ verified: true, token: "nap_selected" })
  const cancelVerification = vi.fn()
  const verifyCreated = vi.fn().mockResolvedValue({
    verified: true,
    token: "nap_selected",
  })
  const flow = {
    load: vi.fn().mockResolvedValue({
      catalog: {
        default_expiry_days: defaultDays,
        groups: [
          {
            resources: resources.map(({ resource, actions }) => ({
              resource,
              label_key: resource,
              actions: actions.map((action) => ({ action, label_key: action })),
            })),
          },
        ],
      },
      verification: {
        methods: [{ method, available: true }],
        oauth_providers:
          method === "oauth" ? [{ slug: "github", name: "GitHub" }] : [],
      },
    }),
    create,
    cancelVerification,
    verifyCreated,
    loadRecovery: vi.fn(),
    revokeToken: vi.fn(),
    reviewRecovery: vi.fn(),
    acknowledgeUncertain: vi.fn(),
  } as unknown as NewApiAccessTokenCreation
  const user = userEvent.setup()
  const onCreated = vi.fn()
  render(
    <NewApiAccessTokenForm
      flow={flow}
      onCreated={onCreated}
      onReconnect={onReconnect}
      renderSiteFallback={() => <p>Site fallback</p>}
    />,
  )
  return {
    create,
    cancelVerification,
    verifyCreated,
    onCreated,
    flow,
    user,
    catalogScopes: resources.flatMap(({ resource, actions }) =>
      actions.map((action) => `${resource}:${action}`),
    ),
  }
}

it("requires explicit review before retrying an uncertain issuance and waits for revocation before reconnecting", async () => {
  const reconnect = vi.fn()
  const { flow, create, user } = setupGrantForm(true, 30, "password", reconnect)
  create.mockRejectedValueOnce(new NewApiTokenCreationUncertainError())
  const token = {
    id: 12,
    name: "Earlier attempt",
    scopes: ["profile:read"],
    created_at: 100,
    expires_at: 200,
    token_hint: "nap_...last",
  }
  const verification = {
    scope: "access_token.revoke" as const,
    methods: [{ method: "password", available: true }],
    oauth_providers: [],
    password_encryption_enabled: false,
  }
  vi.mocked(flow.loadRecovery)
    .mockResolvedValueOnce({ items: [token], verification })
    .mockResolvedValueOnce({ items: [], verification })
  const revocation = createDeferred<boolean>()
  vi.mocked(flow.revokeToken).mockReturnValueOnce(revocation.promise)
  vi.mocked(flow.reviewRecovery).mockResolvedValueOnce(false)
  vi.mocked(flow.acknowledgeUncertain).mockResolvedValueOnce(undefined)

  await user.type(
    await screen.findByLabelText("tokenCreation.password"),
    "secret",
  )
  await user.click(submitButton())
  const allow = await screen.findByRole("button", {
    name: "tokenCreation.allowNewAttempt",
  })
  expect(allow).toBeDisabled()
  expect(submitButton()).toBeDisabled()
  await user.click(
    screen.getByRole("button", { name: "tokenCreation.reviewTokens" }),
  )
  const review = await screen.findByRole("region", {
    name: "tokenCreation.reviewTokens",
  })
  const recovery = within(review)
  await user.click(
    await recovery.findByRole("radio", { name: /Earlier attempt/ }),
  )
  await user.type(
    recovery.getByLabelText("tokenCreation.password"),
    "revoke secret",
  )
  const reconnectButton = screen.getByRole("button", {
    name: "tokenCreation.reconnect",
  })
  await user.click(
    recovery.getByRole("button", { name: "tokenCreation.revokeSelected" }),
  )
  expect(reconnectButton).toBeDisabled()
  await act(() => revocation.resolve(false))
  await recovery.findByText("tokenCreation.revoked")
  expect(reconnectButton).toBeEnabled()
  await user.click(
    recovery.getByRole("button", { name: "tokenCreation.reviewComplete" }),
  )
  expect(allow).toBeEnabled()
  expect(submitButton()).toBeDisabled()
  await user.click(allow)
  expect(submitButton()).toBeEnabled()
  expect(create).toHaveBeenCalledOnce()
})

const submitButton = () =>
  screen.getByRole("button", { name: "tokenCreation.create" })
const pendingButton = () =>
  screen.getByRole("button", { name: "tokenCreation.verifying" })
const queryCancel = () =>
  screen.queryByRole("button", { name: "common:actions.cancel" })

it.each([
  ["password", false],
  ["password", true],
  ["2fa", false],
] as const)(
  "offers delayed Cancel for %s and preserves issuance uncertainty (%s)",
  async (method, uncertain) => {
    const { user, create, cancelVerification } = setupGrantForm(
      true,
      30,
      method,
    )
    const attempt = createDeferred<NewApiCreatedToken>()
    create.mockReturnValueOnce(attempt.promise)
    cancelVerification.mockImplementation(() =>
      attempt.reject(
        uncertain
          ? new NewApiTokenCreationUncertainError()
          : new DOMException("Cancelled", "AbortError"),
      ),
    )
    const input = await screen.findByLabelText(
      method === "password" ? "tokenCreation.password" : "tokenCreation.code",
    )
    const secret = method === "password" ? "typed secret" : "123456"
    await user.type(input, secret)
    const submit = submitButton()
    vi.useFakeTimers()
    try {
      fireEvent.click(submit)
      expect(pendingButton()).toBeDisabled()
      expect(pendingButton()).toHaveAttribute("aria-busy", "true")
      expect(pendingButton().querySelector("svg")).toHaveClass("animate-spin")
      expect(queryCancel()).not.toBeInTheDocument()
      act(() => vi.advanceTimersByTime(1499))
      expect(queryCancel()).not.toBeInTheDocument()
      act(() => vi.advanceTimersByTime(1))
      const cancel = screen.getByRole("button", {
        name: "common:actions.cancel",
      })
      expect(cancel.nextElementSibling).toBe(submit)
      await act(async () => fireEvent.click(cancel))
      expect(queryCancel()).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
    expect(cancelVerification).toHaveBeenCalledOnce()
    expect(input).toHaveValue(secret)
    expect(screen.queryByText("Site fallback")).not.toBeInTheDocument()
    if (uncertain) {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "tokenCreation.uncertain",
      )
      expect(submit).toBeDisabled()
    } else {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument()
      expect(submit).toBeEnabled()
      await user.click(submit)
      await screen.findByText("tokenCreation.complete")
      expect(create).toHaveBeenLastCalledWith(
        expect.anything(),
        method === "password"
          ? { method, password: secret }
          : { method, code: secret },
      )
    }
  },
)

it.each(["oauth", "passkey"] as const)(
  "offers Cancel immediately for %s and delays it for the readback retry",
  async (method) => {
    const { create, verifyCreated, user, cancelVerification } = setupGrantForm(
      true,
      30,
      method,
    )
    const attempt = createDeferred<NewApiCreatedToken>()
    const retry = createDeferred<NewApiCreatedToken>()
    create.mockReturnValueOnce(attempt.promise)
    verifyCreated.mockReturnValueOnce(retry.promise)
    await user.click(
      await screen.findByRole("button", { name: "tokenCreation.create" }),
    )
    expect(queryCancel()?.nextElementSibling).toBe(pendingButton())
    await act(async () =>
      attempt.resolve({ verified: false, id: 7, token: "nap_issued" }),
    )
    expect(queryCancel()).not.toBeInTheDocument()
    vi.useFakeTimers()
    try {
      fireEvent.click(
        screen.getByRole("button", { name: "tokenCreation.retryValidation" }),
      )
      expect(queryCancel()).not.toBeInTheDocument()
      act(() => vi.advanceTimersByTime(1500))
      expect(queryCancel()?.nextElementSibling).toBe(pendingButton())
      cancelVerification.mockImplementation(() =>
        retry.reject(new DOMException("Cancelled", "AbortError")),
      )
      await act(async () =>
        fireEvent.click(
          screen.getByRole("button", { name: "common:actions.cancel" }),
        ),
      )
      expect(queryCancel()).not.toBeInTheDocument()
      expect(
        screen.getByRole("button", { name: "tokenCreation.retryValidation" }),
      ).toBeEnabled()
      expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  },
)

it("clears the delay when a fast failed request finishes before a second attempt", async () => {
  const { create, user } = setupGrantForm()
  const first = createDeferred<NewApiCreatedToken>()
  const second = createDeferred<NewApiCreatedToken>()
  create.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  await user.type(
    await screen.findByLabelText("tokenCreation.password"),
    "secret",
  )
  vi.useFakeTimers()
  try {
    fireEvent.click(submitButton())
    act(() => vi.advanceTimersByTime(1000))
    await act(async () => first.reject(new Error("Verification failed")))
    fireEvent.click(submitButton())
    act(() => vi.advanceTimersByTime(500))
    expect(queryCancel()).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1000))
    expect(queryCancel()).toBeVisible()
    await act(async () =>
      second.resolve({ verified: true, id: 7, token: "nap_issued" }),
    )
  } finally {
    vi.useRealTimers()
  }
})

it.each([
  ["password", 400, API_ERROR_CODES.HTTP_OTHER, "invalidPassword"],
  ["password", 200, API_ERROR_CODES.BUSINESS_ERROR, "invalidPassword"],
  ["2fa", 403, API_ERROR_CODES.HTTP_403, "invalidCode"],
  ["2fa", 200, API_ERROR_CODES.BUSINESS_ERROR, "invalidCode"],
] as const)(
  "keeps a rejected %s secret editable after /api/verify returns %s %s",
  async (method, status, code, feedback) => {
    const { create, user } = setupGrantForm(true, 30, method)
    create.mockRejectedValueOnce(
      new ApiError("Rejected", status, "/api/verify", code),
    )
    const input = await screen.findByLabelText(
      method === "password" ? "tokenCreation.password" : "tokenCreation.code",
    )
    await user.type(input, "123456{Enter}")
    expect(await screen.findByRole("alert")).toHaveTextContent(
      `tokenCreation.${feedback}`,
    )
    expect(input).toHaveValue("123456")
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(submitButton()).toBeEnabled()
    expect(screen.queryByText("Site fallback")).not.toBeInTheDocument()
    await user.clear(input)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(input).not.toHaveAttribute("aria-invalid", "true")
  },
)

it.each([
  ["passkey", "PASSKEY_CANCELLED"],
  ["oauth", "OAUTH_CANCELLED"],
] as const)(
  "shows a neutral retry status for external %s cancellation",
  async (method, reason) => {
    const { user, create } = setupGrantForm(true, 30, method)
    create.mockRejectedValueOnce(new Error(reason))
    await user.click(
      await screen.findByRole("button", { name: "tokenCreation.create" }),
    )
    const status = await screen.findByRole("status")
    expect(status).toHaveTextContent("tokenCreation.cancelled")
    expect(status).toHaveAttribute("data-tone", "neutral")
    expect(status).toHaveClass("text-xs")
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(screen.queryByText("Site fallback")).not.toBeInTheDocument()
    expect(submitButton()).toBeEnabled()
  },
)

it("shows actionable timeout feedback and the site fallback after OAuth times out", async () => {
  const { user, create } = setupGrantForm(true, 30, "oauth")
  create.mockRejectedValueOnce(new Error("OAUTH_TIMEOUT"))
  await user.click(
    await screen.findByRole("button", { name: "tokenCreation.create" }),
  )
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "tokenCreation.timeout",
  )
  expect(screen.getByText("Site fallback")).toBeVisible()
})

it.each([
  new ApiError("Wrong password", 400),
  new Error("Verification failed"),
  new ApiError(
    "Server error",
    500,
    "/api/verify",
    API_ERROR_CODES.BUSINESS_ERROR,
  ),
  new ApiError(
    "Challenge",
    403,
    "/api/verify",
    API_ERROR_CODES.ROBOT_CHALLENGE,
  ),
  new ApiError(
    "Invalid content",
    400,
    "/api/verify",
    API_ERROR_CODES.CONTENT_TYPE_MISMATCH,
  ),
  new ApiError(
    "Invalid JSON",
    400,
    "/api/verify",
    API_ERROR_CODES.JSON_PARSE_ERROR,
  ),
  new ApiError(
    "Network error",
    400,
    "/api/verify",
    API_ERROR_CODES.NETWORK_ERROR,
  ),
  new ApiError("Timed out", 408, "/api/verify", API_ERROR_CODES.HTTP_OTHER),
  new ApiError("Rate limited", 429, "/api/verify", API_ERROR_CODES.HTTP_429),
])(
  "keeps the entered password after a verification failure and clears feedback when edited",
  async (failure) => {
    const { user, create, onCreated } = setupGrantForm()
    create.mockRejectedValueOnce(failure)
    const password = await screen.findByLabelText("tokenCreation.password")
    await user.type(password, "typed secret{Enter}")
    const alert = await screen.findByRole("alert")
    const verification = screen.getByRole("region", {
      name: "tokenCreation.verification",
    })
    expect(verification).toContainElement(alert)
    expect(alert).toHaveClass("text-xs")
    expect(alert).toHaveTextContent("tokenCreation.failed")
    expect(password).toHaveValue("typed secret")
    expect(password).toHaveAttribute("aria-invalid", "true")
    expect(password).toHaveClass("border-destructive-border")
    expect(screen.getByText("Site fallback")).toBeVisible()

    const submit = screen.getByRole("button", { name: "tokenCreation.create" })
    expect(submit).toBeEnabled()
    await user.type(password, "!")
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(screen.queryByText("Site fallback")).not.toBeInTheDocument()
    expect(password).not.toHaveClass("border-destructive-border")
    await user.click(submit)
    await screen.findByText("tokenCreation.complete")
    expect(onCreated).toHaveBeenCalledExactlyOnceWith("nap_selected")
    expect(create).toHaveBeenLastCalledWith(expect.anything(), {
      method: "password",
      password: "typed secret!",
    })
  },
)

it("clears the password after issuance while letting the user retry the token check", async () => {
  const { user, create, verifyCreated } = setupGrantForm()
  create.mockResolvedValueOnce({ verified: false, token: "nap_selected" })
  const password = await screen.findByLabelText("tokenCreation.password")
  await user.type(password, "typed secret{Enter}")
  const retry = await screen.findByRole("button", {
    name: "tokenCreation.retryValidation",
  })
  expect(password).toHaveValue("")
  expect(password).toBeDisabled()
  await user.click(retry)
  await screen.findByText("tokenCreation.complete")
  expect(create).toHaveBeenCalledOnce()
  expect(verifyCreated).toHaveBeenCalledOnce()
})

it("defaults to every visible catalog permission and no expiry, and submits on Enter", async () => {
  const { create, user, catalogScopes } = setupGrantForm()
  const password = await screen.findByLabelText("tokenCreation.password")
  expect(expiration()).toHaveTextContent("tokenCreation.neverExpires")
  expect(screen.queryByLabelText("tokenCreation.days")).not.toBeInTheDocument()
  expect(
    screen.getByRole("button", {
      name: "tokenCreation.presetAll",
      pressed: true,
    }),
  ).toBeVisible()
  expect(
    screen.getByRole("checkbox", { name: /tokenCreation.profileRead/ }),
  ).toBeDisabled()
  const permissions = screen.getAllByRole("checkbox")
  expect(permissions).toHaveLength(catalogScopes.length)
  for (const permission of permissions) {
    expect(permission).toBeVisible()
    expect(permission).toBeChecked()
  }
  expect(screen.getByText("audit · read")).toBeVisible()
  const walletWrite = screen.getByRole("checkbox", {
    name: "tokenCreation.walletWrite",
  })
  const walletHint = screen.getByText("tokenCreation.walletWriteHint")
  expect(walletHint).toBeVisible()
  expect(walletWrite.closest("label")).toContainElement(walletHint)
  expect(walletWrite).toHaveAccessibleDescription(
    "tokenCreation.walletWriteHint",
  )
  expect(
    screen.queryByText("tokenCreation.walletWarning"),
  ).not.toBeInTheDocument()
  expect(
    screen.getAllByRole("note").map((note) => note.dataset.tone),
  ).not.toContain("warning")
  expect(screen.getByText("tokenCreation.reservedWarning")).toBeVisible()

  await user.type(password, "{Enter}")
  expect(create).not.toHaveBeenCalled()
  await user.type(password, "secret{Enter}")
  await screen.findByText("tokenCreation.complete")
  expect(create).toHaveBeenCalledExactlyOnceWith(
    {
      name: "All API Hub",
      scopes: expect.arrayContaining(catalogScopes),
      expires_at: 0,
    },
    { method: "password", password: "secret" },
  )
})

it.each([30, 90, 45])(
  "lists sorted distinct expiry options and submits a %d-day preset",
  async (preset) => {
    const { user, create } = setupGrantForm(true, 45)
    const password = await screen.findByLabelText("tokenCreation.password")
    await user.click(expiration())
    expect(
      (await screen.findAllByRole("option")).map(
        (option) => option.textContent,
      ),
    ).toEqual([
      "tokenCreation.neverExpires",
      "30 days",
      "45 days",
      "90 days",
      "365 days",
      "tokenCreation.customDays",
    ])
    await user.click(screen.getByRole("option", { name: `${preset} days` }))
    expect(expiration()).toHaveTextContent(`${preset} days`)
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument()
    const earliest = Math.floor(Date.now() / 1000) + preset * 86400
    await user.type(password, "secret{Enter}")
    await screen.findByText("tokenCreation.complete")
    const expiry = create.mock.calls[0]?.[0]?.expires_at
    expect(expiry).toBeGreaterThanOrEqual(earliest)
    expect(expiry).toBeLessThanOrEqual(
      Math.floor(Date.now() / 1000) + preset * 86400,
    )
  },
)

it("keeps the wallet description while presets change its selection and reserved warning", async () => {
  const { user } = setupGrantForm()
  await screen.findByLabelText("tokenCreation.password")
  const profileRead = screen.getByRole("checkbox", {
    name: /tokenCreation.profileRead/,
  })
  const walletWrite = screen.getByRole("checkbox", {
    name: "tokenCreation.walletWrite",
  })
  const profileWrite = screen.getByRole("checkbox", {
    name: "tokenCreation.profileWrite",
  })
  const unknown = screen.getByRole("checkbox", { name: "audit · read" })
  const standard = screen.getByRole("button", {
    name: "tokenCreation.presetStandard",
  })
  const readOnly = screen.getByRole("button", {
    name: "tokenCreation.presetReadOnly",
  })
  const all = screen.getByRole("button", { name: "tokenCreation.presetAll" })

  await user.click(standard)
  expect(standard).toHaveAttribute("aria-pressed", "true")
  expect(walletWrite).toBeChecked()
  expect(profileWrite).not.toBeChecked()
  expect(unknown).not.toBeChecked()
  expect(walletWrite).toHaveAccessibleDescription(
    "tokenCreation.walletWriteHint",
  )
  expect(
    screen.queryByText("tokenCreation.reservedWarning"),
  ).not.toBeInTheDocument()

  await user.click(readOnly)
  expect(readOnly).toHaveAttribute("aria-pressed", "true")
  expect(walletWrite).not.toBeChecked()
  expect(profileRead).toBeChecked()
  expect(profileRead).toBeDisabled()
  expect(walletWrite).toHaveAccessibleDescription(
    "tokenCreation.walletWriteHint",
  )

  await user.click(unknown)
  expect(readOnly).toHaveAttribute("aria-pressed", "false")
  expect(screen.getByText("tokenCreation.reservedWarning")).toBeVisible()
  await user.click(all)
  expect(all).toHaveAttribute("aria-pressed", "true")
  expect(walletWrite).toBeChecked()
  expect(profileWrite).toBeChecked()
})

it("shows the catalog days when custom expiry is selected and binds the requested date", async () => {
  const { user, create } = setupGrantForm(false)
  const password = await screen.findByLabelText("tokenCreation.password")
  expect(
    screen.queryByRole("button", { name: "tokenCreation.presetStandard" }),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByText("tokenCreation.reservedPermissions"),
  ).not.toBeInTheDocument()
  await user.click(expiration())
  expect(await screen.findAllByRole("option")).toHaveLength(5)
  await user.click(
    screen.getByRole("option", { name: "tokenCreation.customDays" }),
  )
  const days = screen.getByRole("spinbutton", { name: "tokenCreation.days" })
  expect(days).toHaveValue(30)
  expect(days).toHaveAttribute("min", "1")
  expect(days).toHaveAttribute("step", "1")
  expect(expiration().parentElement).toContainElement(days)
  expect(screen.queryByText("tokenCreation.days")).not.toBeInTheDocument()
  expect(screen.getByText("tokenCreation.daysUnit")).toBeVisible()
  await user.clear(days)
  await user.type(password, "secret{Enter}")
  expect(create).not.toHaveBeenCalled()
  const submit = screen.getByRole("button", { name: "tokenCreation.create" })
  expect(submit).toBeDisabled()
  await user.type(days, "1.5")
  expect(submit).toBeDisabled()
  await user.clear(days)
  await user.type(days, "0")
  expect(submit).toBeDisabled()
  await user.clear(days)
  await user.type(days, "14")
  await selectExpiration(user, "90 days")
  expect(days).not.toBeInTheDocument()
  await selectExpiration(user, "tokenCreation.customDays")
  expect(screen.getByRole("spinbutton")).toHaveValue(14)
  const earliest = Math.floor(Date.now() / 1000) + 14 * 86400
  await user.click(screen.getByRole("button", { name: "tokenCreation.create" }))
  const expiry = create.mock.calls[0]?.[0]?.expires_at
  expect(expiry).toBeGreaterThanOrEqual(earliest)
  expect(expiry).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 14 * 86400)
})

it.each(["password", "2fa"])(
  "preserves the grant and clears the secret only when reconnect changes the method to %s",
  async (method) => {
    const capabilities = {
      catalog: {
        default_expiry_days: 30,
        max_tokens: 20,
        groups: [
          {
            group: "personal",
            resources: [
              {
                resource: "profile",
                label_key: "Profile",
                actions: [{ action: "read", label_key: "Read" }],
              },
            ],
          },
        ],
      },
      verification: {
        scope: "access_token.generate",
        methods: [{ method: "password", available: true }],
        oauth_providers: [],
        password_encryption_enabled: false,
      },
    }
    const flow = {
      load: vi.fn().mockResolvedValue(capabilities),
      create: vi.fn().mockRejectedValue(new ApiError("Expired", 401)),
      cancelVerification: vi.fn(),
    } as unknown as NewApiAccessTokenCreation
    const reconnect = vi.fn()
    const user = userEvent.setup()
    const rendered = render(
      <NewApiAccessTokenForm
        flow={flow}
        onCreated={vi.fn()}
        onReconnect={reconnect}
      />,
    )
    await screen.findByLabelText("tokenCreation.password")
    await selectExpiration(user, "tokenCreation.customDays")
    await user.clear(screen.getByLabelText("tokenCreation.days"))
    await user.type(screen.getByLabelText("tokenCreation.days"), "14")
    await user.type(screen.getByLabelText("tokenCreation.password"), "secret")
    await user.click(
      screen.getByRole("button", { name: "tokenCreation.create" }),
    )
    await user.click(
      await screen.findByRole("button", { name: "tokenCreation.reconnect" }),
    )
    expect(reconnect).toHaveBeenCalledOnce()
    expect(screen.getByLabelText("tokenCreation.password")).toHaveValue(
      "secret",
    )
    const renewed = {
      ...flow,
      load: vi.fn().mockResolvedValue({
        ...capabilities,
        verification: {
          ...capabilities.verification,
          methods: [{ method, available: true }],
        },
      }),
    } as unknown as NewApiAccessTokenCreation
    rendered.rerender(
      <NewApiAccessTokenForm
        flow={renewed}
        onCreated={vi.fn()}
        onReconnect={reconnect}
      />,
    )
    await waitFor(() => expect(renewed.load).toHaveBeenCalled())
    const secretInput = await screen.findByLabelText(
      method === "2fa" ? "tokenCreation.code" : "tokenCreation.password",
    )
    expect(secretInput).toHaveValue(method === "2fa" ? "" : "secret")
    expect(screen.getByLabelText("tokenCreation.days")).toHaveValue(14)
  },
)

it("lets the user choose a grant, verify, and return the independently checked token", async () => {
  const origin = "https://token-form.example"
  let creations = 0
  const identities: string[] = []
  server.use(
    http.get(`${origin}/api/user/self`, ({ request }) => {
      const authorization = request.headers.get("Authorization") ?? ""
      identities.push(authorization)
      expect(authorization).toBe(
        creations === 0 ? "Bearer session" : "Bearer nap_checked",
      )
      return HttpResponse.json({ success: true, data: { id: 42 } })
    }),
    http.get(`${origin}/api/user/access_tokens/catalog`, () =>
      HttpResponse.json({
        success: true,
        data: {
          default_expiry_days: 30,
          max_tokens: 20,
          groups: [
            {
              group: "personal",
              resources: [
                {
                  resource: "profile",
                  label_key: "Profile",
                  actions: [{ action: "read", label_key: "Read" }],
                },
              ],
            },
          ],
        },
      }),
    ),
    http.get(`${origin}/api/verify/methods`, () =>
      HttpResponse.json({
        success: true,
        data: {
          scope: "access_token.generate",
          methods: [{ method: "password", available: true }],
          oauth_providers: [],
          password_encryption_enabled: false,
        },
      }),
    ),
    http.post(`${origin}/api/verify`, async ({ request }) => {
      expect(await request.json()).toMatchObject({
        method: "password",
        password: "my password",
        context: { scopes: ["profile:read"] },
      })
      return HttpResponse.json({
        success: true,
        data: {
          proof_token: "proof",
          scope: "access_token.generate",
          method: "password",
          expires_at: Date.now() / 1000 + 300,
        },
      })
    }),
    http.post(`${origin}/api/user/access_tokens`, async ({ request }) => {
      creations++
      const issuedDraft = await request.json()
      expect(issuedDraft).toMatchObject({
        name: "All API Hub",
        scopes: ["profile:read"],
      })
      return HttpResponse.json({
        success: true,
        data: {
          token: "nap_checked",
          item: { id: 7, ...(issuedDraft as object) },
        },
      })
    }),
  )
  const flow = new NewApiAccessTokenCreation(
    {
      baseUrl: origin,
      directRequestReason: "provider_protocol",
      auth: { authType: AuthTypeEnum.AccessToken, accessToken: "session" },
    },
    "42",
  )
  const onCreated = vi.fn()
  const user = userEvent.setup()
  render(<NewApiAccessTokenForm flow={flow} onCreated={onCreated} />)
  await screen.findByLabelText("tokenCreation.password")
  expect(creations).toBe(0)
  await user.type(
    screen.getByLabelText("tokenCreation.password"),
    "my password",
  )
  await user.click(screen.getByRole("button", { name: "tokenCreation.create" }))
  await screen.findByText("tokenCreation.complete")
  expect(onCreated).toHaveBeenCalledWith("nap_checked")
  expect(creations).toBe(1)
  expect(identities.at(-1)).toBe("Bearer nap_checked")
  expect(screen.queryByLabelText("tokenCreation.password")).toBeNull()
})
