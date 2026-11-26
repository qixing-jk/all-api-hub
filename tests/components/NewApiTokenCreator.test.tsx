import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, it, vi } from "vitest"

import { NewApiTokenCreator } from "~/features/AccountManagement/components/AccountDialog/newApiToken/NewApiTokenCreator"
import { resolveAccountSiteRouteUrl } from "~/services/accounts/utils/siteRouteResolver"
import { openNewApiAccessTokenCreation } from "~/services/apiService/newApiFamily/accessTokens/client"
import {
  NewApiTokenCreationUncertainError,
  type NewApiAccessTokenCreation,
} from "~/services/apiService/newApiFamily/accessTokens/creation"
import { createTokenIssuanceJournal } from "~/services/apiService/newApiFamily/accessTokens/issuanceJournal"
import {
  NewApiTokenSessionError,
  NEW_API_TOKEN_SESSION_ERRORS as SESSION_ERRORS,
} from "~/services/apiService/newApiFamily/accessTokens/sessionError"
import { ApiError } from "~/services/apiTransport/errors"
import { createTab, getCurrentTab, getTab } from "~/utils/browser/tabs"
import { createDeferred } from "~~/tests/test-utils/deferred"

const { reloadSite, focusSite } = vi.hoisted(() => ({
  reloadSite: vi.fn(),
  focusSite: vi.fn(),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock("~/services/apiService/newApiFamily/accessTokens/client", () => ({
  openNewApiAccessTokenCreation: vi.fn(),
  reloadNewApiTokenTab: reloadSite,
  focusNewApiTokenTab: focusSite,
}))
vi.mock(
  "~/services/accounts/utils/siteRouteResolver",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/accounts/utils/siteRouteResolver")
    >()),
    resolveAccountSiteRouteUrl: vi.fn(),
  }),
)
vi.mock("~/utils/browser/tabs", () => ({
  createTab: vi.fn(),
  getCurrentTab: vi.fn(),
  getActiveTab: vi.fn(),
  getTab: vi.fn(),
}))

const selfHostedSite = "https://self-hosted-new-api.example.invalid"

function renderCreator(siteUrl = selfHostedSite, footer?: HTMLElement) {
  const onReturnToAccount = vi.fn()
  render(
    <NewApiTokenCreator
      siteUrl={siteUrl}
      userId="42"
      footer={footer ?? null}
      onBusyChange={vi.fn()}
      onCreated={vi.fn()}
      onReturnToAccount={onReturnToAccount}
    />,
  )
  return onReturnToAccount
}

function mockSession(methods = [{ method: "password", available: true }]) {
  const flow = {
    load: vi.fn().mockResolvedValue({
      catalog: {
        default_expiry_days: 30,
        groups: [
          {
            resources: [{ resource: "profile", actions: [{ action: "read" }] }],
          },
        ],
      },
      verification: { methods, oauth_providers: [] },
    }),
    create: vi.fn(),
    reconnect: vi.fn(),
  }
  vi.mocked(openNewApiAccessTokenCreation).mockResolvedValueOnce({
    flow: flow as unknown as NewApiAccessTokenCreation,
    cancel: vi.fn(),
  })
  return flow
}

it("counts the full wait across the website session and token options", async () => {
  vi.useFakeTimers()
  try {
    const { promise, resolve } =
      createDeferred<
        Awaited<ReturnType<typeof openNewApiAccessTokenCreation>>
      >()
    vi.mocked(openNewApiAccessTokenCreation).mockReturnValueOnce(promise)
    renderCreator()
    await act(() => vi.advanceTimersByTimeAsync(2000))
    await act(() =>
      resolve({
        flow: {
          load: () => new Promise(() => {}),
        } as unknown as NewApiAccessTokenCreation,
        cancel: vi.fn(),
      }),
    )
    expect(screen.getByRole("status")).toHaveAccessibleName(
      "common:status.loading",
    )
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(
      screen.getByRole("button", { name: "tokenCreation.createOnSite" }),
    ).toBeVisible()
  } finally {
    vi.useRealTimers()
  }
})

it("offers the website by default after a slow load and resolves its token page on click", async () => {
  vi.useFakeTimers()
  try {
    vi.mocked(openNewApiAccessTokenCreation).mockReturnValueOnce(
      new Promise(() => {}),
    )
    vi.mocked(getCurrentTab).mockResolvedValueOnce({
      windowId: 5,
      cookieStoreId: "firefox-container-2",
    } as Awaited<ReturnType<typeof getCurrentTab>>)
    vi.mocked(resolveAccountSiteRouteUrl).mockResolvedValueOnce(
      `${selfHostedSite}/profile`,
    )
    const returnToAccount = renderCreator()

    expect(screen.getByRole("status")).toHaveAccessibleName(
      "common:status.loading",
    )
    await act(() => vi.advanceTimersByTimeAsync(2999))
    expect(
      screen.queryByRole("button", { name: "tokenCreation.createOnSite" }),
    ).not.toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(screen.getByRole("status")).toHaveAccessibleName(
      "tokenCreation.slowLoading",
    )
    const siteAction = screen.getByRole("button", {
      name: "tokenCreation.createOnSite",
    })
    expect(siteAction).toHaveAccessibleDescription(
      "tokenCreation.siteFallbackSlow",
    )
    expect(createTab).not.toHaveBeenCalled()
    expect(resolveAccountSiteRouteUrl).not.toHaveBeenCalled()
    vi.useRealTimers()
    await userEvent.setup().click(siteAction)
    expect(createTab).toHaveBeenCalledWith(`${selfHostedSite}/profile`, true, {
      windowId: 5,
      cookieStoreId: "firefox-container-2",
    })
    expect(returnToAccount).toHaveBeenCalledOnce()
  } finally {
    vi.useRealTimers()
  }
})

function renderWithFooter() {
  const { container } = render(<footer />)
  const footer = container.querySelector("footer")!
  const onReturnToAccount = renderCreator(selfHostedSite, footer)
  return { footer: within(footer), onReturnToAccount }
}

it("cancels a site session that finishes opening after the user leaves creation", async () => {
  const pending =
    createDeferred<Awaited<ReturnType<typeof openNewApiAccessTokenCreation>>>()
  vi.mocked(openNewApiAccessTokenCreation).mockReturnValueOnce(pending.promise)
  const session = {
    flow: { load: vi.fn() } as unknown as NewApiAccessTokenCreation,
    cancel: vi.fn(),
  }
  const { unmount } = render(
    <NewApiTokenCreator
      siteUrl={selfHostedSite}
      userId="42"
      onCreated={vi.fn()}
      onReturnToAccount={vi.fn()}
      footer={null}
      onBusyChange={vi.fn()}
    />,
  )
  await waitFor(() =>
    expect(openNewApiAccessTokenCreation).toHaveBeenCalledOnce(),
  )
  unmount()
  await act(() => pending.resolve(session))
  expect(session.cancel).toHaveBeenCalledOnce()
  expect(session.flow.load).not.toHaveBeenCalled()
})

it("reconnects a creator without discarding the draft already entered", async () => {
  const flow = mockSession()
  flow.create.mockRejectedValueOnce(new ApiError("Session expired", 401))
  const candidate = mockSession()
  const user = userEvent.setup()
  renderCreator()
  const password = await screen.findByLabelText("tokenCreation.password")
  const name = screen.getByLabelText("tokenCreation.name")
  await user.clear(name)
  await user.type(name, "Keep this token name")
  await user.type(password, "secret")
  await user.click(screen.getByRole("button", { name: "tokenCreation.create" }))
  await user.click(
    await screen.findByRole("button", { name: "tokenCreation.reconnect" }),
  )
  await waitFor(() =>
    expect(flow.reconnect).toHaveBeenCalledExactlyOnceWith(candidate),
  )
  expect(name).toHaveValue("Keep this token name")
  expect(openNewApiAccessTokenCreation).toHaveBeenCalledTimes(2)
})

it("restores the site-opening actions after focusing the source tab fails", async () => {
  vi.mocked(openNewApiAccessTokenCreation).mockRejectedValueOnce(
    new Error("Site closed"),
  )
  const focus = createDeferred<void>()
  focusSite.mockReturnValueOnce(focus.promise)
  const user = userEvent.setup()
  const { footer } = renderWithFooter()
  const openSite = await footer.findByRole("button", {
    name: "tokenCreation.connection.openSite",
  })
  const retry = footer.getByRole("button", { name: "common:actions.retry" })
  await user.click(openSite)
  expect(retry).toBeDisabled()
  await act(() => focus.reject(new Error("Closed")))
  expect(
    await screen.findByText("tokenCreation.connection.openSiteFailed"),
  ).toBeVisible()
  expect(retry).toBeEnabled()
})

it("keeps site fallback blocked while an earlier extension issuance is uncertain", async () => {
  vi.stubGlobal("navigator", {
    locks: {
      request: async (
        name: string,
        _options: LockOptions,
        work: (lock: object) => Promise<unknown>,
      ) => work({ name }),
    },
  })
  const journal = createTokenIssuanceJournal(selfHostedSite, "42")
  await journal.begin()
  await journal.uncertain()
  try {
    vi.mocked(openNewApiAccessTokenCreation).mockRejectedValueOnce(
      new NewApiTokenSessionError(SESSION_ERRORS.UNSUPPORTED, 9),
    )
    const onReturn = renderCreator()
    const site = await screen.findByRole("button", {
      name: "tokenCreation.createOnSite",
    })
    await userEvent.click(site)
    expect(
      (await screen.findByText("tokenCreation.uncertain")).closest(
        '[role="alert"]',
      ),
    ).toBeVisible()
    expect(site).toBeEnabled()
    expect(createTab).not.toHaveBeenCalled()
    expect(onReturn).not.toHaveBeenCalled()
  } finally {
    await journal.resolved()
    vi.unstubAllGlobals()
  }
})

it("keeps the token setup open when the deployment's website route cannot be resolved", async () => {
  vi.mocked(openNewApiAccessTokenCreation).mockRejectedValueOnce(
    new NewApiTokenSessionError(SESSION_ERRORS.UNSUPPORTED, 9),
  )
  vi.mocked(resolveAccountSiteRouteUrl).mockResolvedValueOnce(null)
  const onReturn = renderCreator()
  const site = await screen.findByRole("button", {
    name: "tokenCreation.createOnSite",
  })
  await userEvent.click(site)
  expect(
    await screen.findByText("accessTokenVerification.openSecurityFailed"),
  ).toBeVisible()
  expect(site).toBeEnabled()
  expect(createTab).not.toHaveBeenCalled()
  expect(onReturn).not.toHaveBeenCalled()
})

it.each([
  [SESSION_ERRORS.UNAVAILABLE, "sessionRequired"],
  [SESSION_ERRORS.IDENTITY_MISMATCH, "identityMismatch"],
] as const)(
  "shows %s guidance with site, retry, and fallback actions",
  async (code, message) => {
    vi.mocked(openNewApiAccessTokenCreation).mockRejectedValueOnce(
      new NewApiTokenSessionError(code, 9),
    )
    const user = userEvent.setup()
    const { footer } = renderWithFooter()
    const alert = await screen.findByRole("alert")
    expect(alert).toHaveAttribute("data-slot", "inline-message")
    expect(alert).toHaveTextContent(`tokenCreation.connection.${message}`)
    const site = footer.getByRole("button", {
      name: "tokenCreation.connection.openSite",
    })
    const retry = footer.getByRole("button", { name: "common:actions.retry" })
    expect(site).toHaveAttribute("data-variant", "outline")
    expect(retry).toHaveAttribute("data-variant", "default")
    await user.click(site)
    expect(focusSite).toHaveBeenCalledWith(selfHostedSite, 9)
    expect(
      screen.getByRole("button", { name: "tokenCreation.createOnSite" }),
    ).toHaveAccessibleDescription("tokenCreation.siteFallbackUnavailable")
    mockSession()
    await user.click(retry)
    expect(await screen.findByLabelText("tokenCreation.password")).toBeVisible()
  },
)

it("keeps the refresh action in the footer while reloading, then reconnects to that tab", async () => {
  vi.mocked(openNewApiAccessTokenCreation).mockRejectedValueOnce(
    new NewApiTokenSessionError(SESSION_ERRORS.RELOAD_REQUIRED, 9),
  )
  const reloading = createDeferred<number>()
  reloadSite.mockReturnValueOnce(reloading.promise)
  const user = userEvent.setup()
  const { footer } = renderWithFooter()
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "tokenCreation.connection.reloadRequired",
  )
  const refresh = footer.getByRole("button", {
    name: "tokenCreation.connection.reloadAndRetry",
  })
  await user.click(refresh)
  expect(refresh).toHaveAttribute("aria-busy", "true")
  expect(reloadSite).toHaveBeenCalledExactlyOnceWith(selfHostedSite, 9)
  expect(openNewApiAccessTokenCreation).toHaveBeenCalledOnce()
  mockSession()
  await act(() => reloading.resolve(11))
  expect(openNewApiAccessTokenCreation).toHaveBeenLastCalledWith(
    selfHostedSite,
    "42",
    11,
  )
  expect(await screen.findByLabelText("tokenCreation.password")).toBeVisible()
})

it("promotes website token creation for unsupported deployments", async () => {
  vi.mocked(openNewApiAccessTokenCreation).mockRejectedValueOnce(
    new NewApiTokenSessionError(SESSION_ERRORS.UNSUPPORTED, 9),
  )
  vi.mocked(resolveAccountSiteRouteUrl).mockResolvedValueOnce(
    `${selfHostedSite}/profile`,
  )
  const siteTab = {
    id: 23,
    url: `${selfHostedSite}/profile`,
    status: "complete",
  } as browser.tabs.Tab
  vi.mocked(createTab).mockResolvedValueOnce(siteTab)
  vi.mocked(getTab).mockResolvedValue(siteTab)
  const sendMessage = vi.spyOn(browser.tabs, "sendMessage")
  sendMessage.mockRejectedValueOnce(new Error("Missing host permission"))
  const { footer, onReturnToAccount } = renderWithFooter()
  const alert = await screen.findByRole("alert")
  expect(alert).toHaveTextContent("tokenCreation.connection.unsupported")
  expect(
    screen.queryByText("tokenCreation.siteFallbackUnavailable"),
  ).not.toBeInTheDocument()
  expect(
    screen.queryByText("tokenCreation.connection.sessionRequired"),
  ).not.toBeInTheDocument()
  expect(
    footer.getByRole("button", { name: "common:actions.retry" }),
  ).toHaveAttribute("data-variant", "outline")
  const siteAction = footer.getByRole("button", {
    name: "tokenCreation.createOnSite",
  })
  expect(siteAction).toHaveAttribute("data-variant", "default")
  await userEvent.setup().click(siteAction)
  expect(createTab).toHaveBeenCalledWith(
    `${selfHostedSite}/profile`,
    true,
    expect.anything(),
  )
  expect(onReturnToAccount).toHaveBeenCalledOnce()
  await waitFor(() =>
    expect(sendMessage).toHaveBeenCalledWith(
      siteTab.id,
      { action: "highlightAccessTokenSection", openedSite: selfHostedSite },
      { frameId: 0 },
    ),
  )
  expect(
    screen.queryByText("accessTokenVerification.openSecurityFailed"),
  ).not.toBeInTheDocument()
  sendMessage.mockRestore()
  vi.mocked(getTab).mockReset()
})

it("offers the website immediately when creation options fail to load", async () => {
  const flow = mockSession()
  flow.load.mockRejectedValueOnce(new Error())
  const { footer } = renderWithFooter()
  expect(await screen.findByText("tokenCreation.unavailable")).toBeVisible()
  expect(
    footer.getByRole("button", { name: "common:actions.retry" }),
  ).toBeVisible()
  expect(
    screen.getByRole("button", { name: "tokenCreation.createOnSite" }),
  ).toHaveAccessibleDescription("tokenCreation.siteFallbackUnavailable")
})

it.each(["https://ai.facai.cloudns.org", "https://api.facai.cloudns.org"])(
  "omits the website fallback for the known unsupported deployment %s",
  async (siteUrl) => {
    const flow = mockSession()
    flow.load.mockRejectedValueOnce(new Error())
    renderCreator(siteUrl)
    expect(await screen.findByText("tokenCreation.unavailable")).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "tokenCreation.createOnSite" }),
    ).not.toBeInTheDocument()
  },
)

it("offers the website when the extension cannot present a verification method", async () => {
  mockSession([])
  renderCreator()
  expect(await screen.findByText("tokenCreation.noMethods")).toBeVisible()
  expect(
    screen.getByRole("button", { name: "tokenCreation.createOnSite" }),
  ).toBeVisible()
})

it("offers the website after a failed verification but prioritizes recovery after uncertain issuance", async () => {
  const flow = mockSession()
  flow.create
    .mockRejectedValueOnce(new Error())
    .mockRejectedValueOnce(new NewApiTokenCreationUncertainError())
  const user = userEvent.setup()
  renderCreator()
  const password = await screen.findByLabelText("tokenCreation.password")
  const create = screen.getByRole("button", { name: "tokenCreation.create" })
  expect(
    screen.queryByRole("button", { name: "tokenCreation.createOnSite" }),
  ).not.toBeInTheDocument()

  await user.type(password, "first attempt")
  await user.click(create)
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "tokenCreation.failed",
  )
  expect(
    screen.getByRole("button", { name: "tokenCreation.createOnSite" }),
  ).toBeVisible()

  await user.type(password, "second attempt")
  await user.click(create)
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "tokenCreation.uncertain",
  )
  expect(
    screen.getByRole("button", { name: "tokenCreation.reviewTokens" }),
  ).toBeVisible()
  expect(
    screen.queryByRole("button", { name: "tokenCreation.createOnSite" }),
  ).not.toBeInTheDocument()
})

it("leaves a newer issuance blocked when acknowledging an older review fails", async () => {
  const session = mockSession()
  session.create.mockRejectedValueOnce(new NewApiTokenCreationUncertainError())
  const acknowledge = vi
    .fn()
    .mockRejectedValueOnce(new Error("Another attempt started"))
    .mockResolvedValueOnce(undefined)
  Object.assign(session, {
    acknowledgeUncertain: acknowledge,
    loadRecovery: vi.fn().mockResolvedValue({
      items: [],
      verification: { methods: [], oauth_providers: [] },
    }),
    reviewRecovery: vi.fn().mockResolvedValue(false),
  })
  const user = userEvent.setup()
  renderCreator()
  const password = await screen.findByLabelText("tokenCreation.password")
  await user.type(password, "test password")
  await user.click(screen.getByRole("button", { name: "tokenCreation.create" }))
  const retry = await screen.findByRole("button", {
    name: "tokenCreation.allowNewAttempt",
  })
  expect(retry).toBeDisabled()
  await user.click(retry)
  expect(acknowledge).not.toHaveBeenCalled()
  const reviewList = async () => {
    await user.click(
      screen.getByRole("button", { name: "tokenCreation.reviewTokens" }),
    )
    await user.click(
      await screen.findByRole("button", {
        name: "tokenCreation.reviewComplete",
      }),
    )
  }
  await reviewList()
  await user.click(retry)
  expect(acknowledge).toHaveBeenCalledOnce()
  expect(screen.getByRole("alert")).toHaveTextContent("tokenCreation.uncertain")
  expect(session.create).toHaveBeenCalledOnce()
  expect(retry).toBeDisabled()
  await reviewList()
  await user.click(retry)
  await waitFor(() => expect(retry).not.toBeInTheDocument())
  expect(screen.getByLabelText("tokenCreation.password")).toBeEnabled()
})
