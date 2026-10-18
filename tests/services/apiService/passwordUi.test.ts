// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://gateway.example/login"}
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { BROWSER_LOGIN_SESSION_MODES } from "~/constants/browserLogin"
import { PASSWORD_UI_PHASES } from "~/services/accountLogin/passwordUiProtocol"
import type { PasswordUiReply } from "~/services/accountLogin/passwordUiProtocol"
import { handleNewApiPasswordUi } from "~/services/apiService/newApiFamily/passwordUi"
import { SUB2API_AUTH_STORAGE_KEYS } from "~/services/apiService/sub2api/auth/browserSession"
import { handleSub2ApiPasswordUi } from "~/services/apiService/sub2api/auth/passwordUi"

const fetchMock = vi.fn<typeof fetch>()
const request = {
  origin: "https://gateway.example",
  requestId: "ui-1",
  expectedIdentity: "17",
  credentials: { username: "alice", password: " secret " },
}
function invoke(details = {}) {
  return new Promise<PasswordUiReply>((resolve) =>
    handleNewApiPasswordUi({ ...request, ...details }, resolve),
  )
}
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  document.body.innerHTML = ""
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
it.each([handleNewApiPasswordUi, handleSub2ApiPasswordUi])(
  "keeps an unrecognized login choice in native UI instead of invoking API fallback (%#)",
  async (handler) => {
    vi.useFakeTimers()
    document.body.innerHTML =
      '<button type="button">Continue with GitHub</button><button type="button">Custom password login label</button>'
    fetchMock.mockImplementation(async (path) =>
      path === "/api/status"
        ? Response.json({ success: true, data: {} })
        : path === "/api/v1/settings/public"
          ? Response.json({ code: 0, data: {} })
          : new Response(null, { status: 401 }),
    )
    const result = new Promise((resolve) =>
      handler({ ...request, phase: PASSWORD_UI_PHASES.Prepare }, resolve),
    )
    await vi.advanceTimersByTimeAsync(3_500)
    await expect(result).resolves.toEqual({ kind: "manual" })
  },
)

it.each([
  "使用 邮箱或用户名 登录",
  "Sign in with Email or Username",
  "使用 信箱或使用者名 登錄",
  "メールアドレスまたはユーザー名でログイン",
  "Connectez-vous avec votre e-mail ou votre nom d'utilisateur",
  "Войти с email или именем пользователя",
  "Đăng nhập bằng Email hoặc Tên người dùng",
])(
  "opens New API's native password choice %s before submitting the form",
  async (label) => {
    document.body.innerHTML = `<button type="button">Continue with GitHub</button><button type="button" id="password-entry"><span>${label}</span></button>`
    let opened = 0
    const submitted = vi.fn((event: Event) => event.preventDefault())
    document.querySelector("#password-entry")!.addEventListener("click", () => {
      opened++
      document.body.innerHTML =
        '<form><input name="username"><input name="password" type="password"><button type="submit">继续</button><button type="button">忘记密码？</button></form>'
      document.querySelector("form")!.addEventListener("submit", submitted)
    })
    fetchMock.mockImplementation(async (path) =>
      path === "/api/status"
        ? Response.json({ success: true, data: {} })
        : new Response(null, { status: 401 }),
    )
    await expect(
      invoke({ phase: PASSWORD_UI_PHASES.Prepare }),
    ).resolves.toEqual({
      kind: "ready",
    })
    await expect(invoke({ phase: PASSWORD_UI_PHASES.Submit })).resolves.toEqual(
      {
        kind: "submitted",
      },
    )
    expect(opened).toBe(1)
    expect(submitted).toHaveBeenCalledTimes(1)
    expect(
      document.querySelector<HTMLInputElement>('[name="username"]')!.value,
    ).toBe("alice")
    expect(
      fetchMock.mock.calls.some(([path]) => path === "/api/user/login"),
    ).toBe(false)
  },
)

it("fills and submits the native login form without an API login mutation", async () => {
  document.body.innerHTML =
    '<form><input name="username"><input type="password"><button type="submit">Login</button></form>'
  const submitted = vi.fn((event: Event) => event.preventDefault())
  document.querySelector("form")!.addEventListener("submit", submitted)
  fetchMock.mockImplementation(async (path) => {
    if (path === "/api/status")
      return Response.json({ success: true, data: {} })
    return new Response(null, { status: 401 })
  })
  await expect(invoke({ phase: PASSWORD_UI_PHASES.Prepare })).resolves.toEqual({
    kind: "ready",
  })
  await expect(invoke({ phase: PASSWORD_UI_PHASES.Submit })).resolves.toEqual({
    kind: "submitted",
  })
  expect(
    document.querySelector<HTMLInputElement>('[name="username"]')!.value,
  ).toBe("alice")
  expect(
    document.querySelector<HTMLInputElement>('[type="password"]')!.value,
  ).toBe(" secret ")
  expect(submitted).toHaveBeenCalledTimes(1)
  expect(
    fetchMock.mock.calls.some(([path]) => path === "/api/user/login"),
  ).toBe(false)
})

it.each(["legacy", "modern", "sub2api"])(
  "accepts the native %s login agreement once without selecting optional checkboxes",
  async (variant) => {
    const consent =
      variant === "modern"
        ? '<button id="legal-consent" type="button" role="checkbox" aria-checked="false"></button><label for="legal-consent">I agree to the terms</label>'
        : variant === "sub2api"
          ? '<input id="login-agreement-consent" type="checkbox"><label for="login-agreement-consent">I agree</label>'
          : '<label><input id="terms" type="checkbox">I agree to the <a href="/user-agreement">agreement</a> and <a href="/privacy-policy">privacy policy</a></label>'
    document.body.innerHTML = `<form><input name="username"><input type="password">${consent}<label><input id="marketing" type="checkbox">Send offers</label><label><input id="remember" type="checkbox">Remember me</label><button type="submit">Sign in</button></form>`
    const checkbox = document.querySelector<HTMLElement>(
      "#terms, #legal-consent, #login-agreement-consent",
    )!
    const submit = document.querySelector<HTMLButtonElement>('[type="submit"]')!
    if (variant !== "modern") submit.disabled = true
    if (variant === "sub2api") {
      document
        .querySelectorAll<HTMLInputElement>('input:not([type="checkbox"])')
        .forEach((input) => (input.disabled = true))
    }
    const accepted = vi.fn(() => {
      setTimeout(() => {
        checkbox.setAttribute("aria-checked", "true")
        document
          .querySelectorAll<
            HTMLInputElement | HTMLButtonElement
          >("input, button")
          .forEach((control) => (control.disabled = false))
      }, 30)
    })
    checkbox.addEventListener("click", accepted)
    const submitted = vi.fn((event: Event) => event.preventDefault())
    document.querySelector("form")!.addEventListener("submit", submitted)
    fetchMock.mockImplementation(async (path) =>
      path === "/api/status"
        ? Response.json({ success: true, data: {} })
        : path === "/api/v1/settings/public"
          ? Response.json({ code: 0, data: {} })
          : new Response(null, { status: 401 }),
    )
    const call = (phase: string) =>
      variant === "sub2api"
        ? new Promise((resolve) =>
            handleSub2ApiPasswordUi({ ...request, phase }, resolve),
          )
        : invoke({ phase })
    await expect(call(PASSWORD_UI_PHASES.Prepare)).resolves.toEqual({
      kind: "ready",
    })
    await expect(call(PASSWORD_UI_PHASES.Submit)).resolves.toEqual({
      kind: "submitted",
    })
    expect(accepted).toHaveBeenCalledTimes(1)
    expect(submitted).toHaveBeenCalledTimes(1)
    expect(
      document.querySelector<HTMLInputElement>("#marketing")!.checked,
    ).toBe(false)
    expect(document.querySelector<HTMLInputElement>("#remember")!.checked).toBe(
      false,
    )
    await call(PASSWORD_UI_PHASES.Submit)
    expect(accepted).toHaveBeenCalledTimes(1)
    expect(submitted).toHaveBeenCalledTimes(1)
  },
)

it.each(["checked", "disabled"])(
  "preserves a %s native agreement without toggling it or bypassing it",
  async (state) => {
    document.body.innerHTML = `<form><input name="username"><input type="password"><input id="legal-consent" type="checkbox" ${state}><button type="submit">Sign in</button></form>`
    const consent = document.querySelector<HTMLInputElement>("#legal-consent")!
    const clicked = vi.fn()
    consent.addEventListener("click", clicked)
    const submitted = vi.fn((event: Event) => event.preventDefault())
    document.querySelector("form")!.addEventListener("submit", submitted)
    fetchMock.mockImplementation(async (path) =>
      path === "/api/status"
        ? Response.json({ success: true, data: {} })
        : new Response(null, { status: 401 }),
    )
    await invoke({ phase: PASSWORD_UI_PHASES.Prepare })
    await expect(invoke({ phase: PASSWORD_UI_PHASES.Submit })).resolves.toEqual(
      {
        kind: state === "checked" ? "submitted" : "manual",
      },
    )
    expect(clicked).not.toHaveBeenCalled()
    expect(submitted).toHaveBeenCalledTimes(state === "checked" ? 1 : 0)
    expect(
      fetchMock.mock.calls.some(([path]) => path === "/api/user/login"),
    ).toBe(false)
  },
)

it("does not fall back to API when a visible verification widget is present", async () => {
  document.body.innerHTML =
    '<div class="cf-turnstile"><iframe src="https://challenges.cloudflare.com/widget"></iframe></div>'
  fetchMock.mockImplementation(async (path) =>
    path === "/api/status"
      ? Response.json({ success: true, data: {} })
      : new Response(null, { status: 401 }),
  )
  await expect(invoke({ phase: PASSWORD_UI_PHASES.Prepare })).resolves.toEqual({
    kind: "manual",
  })
})
it("reuses the verified target session for ordinary authentication without logging out", async () => {
  localStorage.setItem("user", JSON.stringify({ id: 17 }))
  fetchMock.mockResolvedValue(
    Response.json({ success: true, data: { id: 17 } }),
  )
  await expect(invoke({ phase: PASSWORD_UI_PHASES.Prepare })).resolves.toEqual({
    status: "authenticated",
    identity: "17",
  })
  expect(fetchMock).toHaveBeenCalledTimes(1)
})
it("does not log out a shared target session even when a fresh login is required", async () => {
  fetchMock.mockResolvedValue(
    Response.json({ success: true, data: { id: 17 } }),
  )
  await expect(
    invoke({
      phase: PASSWORD_UI_PHASES.Prepare,
      sessionMode: BROWSER_LOGIN_SESSION_MODES.Fresh,
      canResetSession: false,
    }),
  ).resolves.toEqual({ kind: "manual", reason: "session" })
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it("requires a fresh native form after isolated logout and verifies the old session is gone", async () => {
  let loggedIn = true
  localStorage.setItem("user", JSON.stringify({ id: 17 }))
  fetchMock.mockImplementation(async (path) => {
    if (path === "/api/user/logout") {
      loggedIn = false
      return Response.json({ success: true })
    }
    if (path === "/api/user/self" && loggedIn)
      return Response.json({ success: true, data: { id: 17 } })
    return new Response(null, { status: 401 })
  })
  await expect(
    invoke({
      phase: PASSWORD_UI_PHASES.Prepare,
      sessionMode: BROWSER_LOGIN_SESSION_MODES.Fresh,
      canResetSession: true,
    }),
  ).resolves.toEqual({ kind: "reload" })
  expect(loggedIn).toBe(false)
  expect(localStorage.getItem("user")).toBeNull()
})
it("does not accept a wrong account after native submission", async () => {
  document.body.innerHTML =
    '<form><input name="username"><input type="password"><button type="submit">Login</button></form>'
  fetchMock.mockImplementation(async (path) =>
    path === "/api/status"
      ? Response.json({ success: true, data: {} })
      : new Response(null, { status: 401 }),
  )
  await invoke({ phase: PASSWORD_UI_PHASES.Prepare })
  fetchMock.mockResolvedValue(
    Response.json({ success: true, data: { id: 18 } }),
  )
  await expect(invoke({ phase: PASSWORD_UI_PHASES.Observe })).resolves.toEqual({
    status: "identity_mismatch",
  })
})
it("uses native login evidence only after the server confirms the same account", async () => {
  document.body.innerHTML =
    '<form><input name="username"><input type="password"><button type="submit">Login</button></form>'
  fetchMock.mockImplementation(async (path) =>
    path === "/api/status"
      ? Response.json({ success: true, data: {} })
      : new Response(null, { status: 401 }),
  )
  await invoke({ phase: PASSWORD_UI_PHASES.Prepare })
  localStorage.setItem("user", JSON.stringify({ id: 17, checked_in: true }))
  fetchMock.mockResolvedValue(
    Response.json({ success: true, data: { id: 17 } }),
  )
  await expect(invoke({ phase: PASSWORD_UI_PHASES.Observe })).resolves.toEqual({
    status: "authenticated",
    identity: "17",
    evidence: { checkedIn: true },
  })
})

it("preserves a newer Sub2API session if it changes during isolated logout", async () => {
  localStorage.setItem(SUB2API_AUTH_STORAGE_KEYS.accessToken, "old")
  localStorage.setItem(SUB2API_AUTH_STORAGE_KEYS.refreshToken, "old-refresh")
  fetchMock.mockImplementation(async (path) => {
    if (path === "/api/v1/auth/me")
      return Response.json({ code: 0, data: { id: 17 } })
    localStorage.setItem(SUB2API_AUTH_STORAGE_KEYS.accessToken, "new")
    localStorage.setItem(SUB2API_AUTH_STORAGE_KEYS.refreshToken, "new-refresh")
    return Response.json({ code: 0 })
  })
  const result = await new Promise((resolve) =>
    handleSub2ApiPasswordUi(
      {
        ...request,
        phase: PASSWORD_UI_PHASES.Prepare,
        sessionMode: BROWSER_LOGIN_SESSION_MODES.Fresh,
        canResetSession: true,
      },
      resolve,
    ),
  )
  expect(result).toEqual({ status: "uncertain" })
  expect(localStorage.getItem(SUB2API_AUTH_STORAGE_KEYS.accessToken)).toBe(
    "new",
  )
  expect(localStorage.getItem(SUB2API_AUTH_STORAGE_KEYS.refreshToken)).toBe(
    "new-refresh",
  )
})

it("uses the native Sub2API email form and verifies its website token without exporting it", async () => {
  document.body.innerHTML =
    '<form><input id="email" type="email" autocomplete="email"><input id="password" type="password" autocomplete="current-password"><button type="button" aria-label="Show password"></button><button type="submit">Sign in</button><button type="button">Sign in with Passkey</button><button type="button">Continue with GitHub</button></form>'
  document.querySelector("form")!.addEventListener("submit", (event) => {
    event.preventDefault()
    localStorage.setItem(SUB2API_AUTH_STORAGE_KEYS.accessToken, "website-token")
  })
  fetchMock.mockImplementation(async (path) =>
    Response.json({
      code: 0,
      data: path === "/api/v1/auth/me" ? { id: 17 } : {},
    }),
  )
  const subInvoke = (phase: string) =>
    new Promise((resolve) =>
      handleSub2ApiPasswordUi(
        {
          ...request,
          credentials: { username: "alice@example.com", password: " secret " },
          phase,
        },
        resolve,
      ),
    )
  await expect(subInvoke(PASSWORD_UI_PHASES.Prepare)).resolves.toEqual({
    kind: "ready",
  })
  await expect(subInvoke(PASSWORD_UI_PHASES.Submit)).resolves.toEqual({
    kind: "submitted",
  })
  expect(document.querySelector<HTMLInputElement>("#email")!.value).toBe(
    "alice@example.com",
  )
  await expect(subInvoke(PASSWORD_UI_PHASES.Observe)).resolves.toEqual({
    status: "authenticated",
    identity: "17",
  })
  expect(
    fetchMock.mock.calls.some(([path]) => path === "/api/v1/auth/login"),
  ).toBe(false)
})

it("does not use API fallback on an existing native second-factor screen", async () => {
  document.body.innerHTML =
    '<form><input autocomplete="one-time-code"><button>Verify</button></form>'
  fetchMock.mockImplementation(async (path) =>
    path === "/api/status"
      ? Response.json({ success: true, data: {} })
      : new Response(null, { status: 401 }),
  )
  await expect(invoke({ phase: PASSWORD_UI_PHASES.Prepare })).resolves.toEqual({
    kind: "manual",
  })
})
