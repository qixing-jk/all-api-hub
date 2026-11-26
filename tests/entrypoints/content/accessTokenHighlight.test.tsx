import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { showAccessTokenCue as handleHighlightAccessTokenSection } from "~/services/browsingContext/newApiAccessTokenPage/cue"

const highlightAttribute = "data-all-api-hub-highlight"

beforeEach(() => {
  vi.useFakeTimers()
  window.history.replaceState(null, "", "/security")
})

afterEach(() => {
  document.body.replaceChildren()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it("scrolls to the modern access-token card ahead of unrelated matches", async () => {
  document.body.innerHTML = `
    <button>Access Token</button>
    <section aria-labelledby="security-access"><h2 id="security-access">Sessions &amp; Access</h2>
      <div data-slot="card"><div data-slot="card-title">Access tokens</div></div>
    </section>
  `
  const section = document.querySelector<HTMLElement>('[data-slot="card"]')!
  const scrollIntoView = vi.fn()
  section.scrollIntoView = scrollIntoView

  await handleHighlightAccessTokenSection(window.location.origin)

  expect(section.getAttribute(highlightAttribute)).toBe("access-token")
  expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({
    block: "center",
    behavior: "smooth",
  })
  expect(
    document.querySelector("button")!.hasAttribute(highlightAttribute),
  ).toBe(false)
  await vi.runOnlyPendingTimersAsync()
})

it("uses the standalone action after SPA normalization when the card wrapper is missing", async () => {
  const disconnect = vi.spyOn(MutationObserver.prototype, "disconnect")
  const pending = handleHighlightAccessTokenSection(window.location.origin)
  document.body.innerHTML = `
    <section aria-labelledby="security-access">
      <h2 id="security-access">Sessions &amp; Access</h2>
      <button>Create access token</button>
    </section>
  `
  window.history.replaceState(null, "", "/security/#security-access")
  const section = document.querySelector("section")!
  const button = section.querySelector("button")!
  button.scrollIntoView = vi.fn()
  await pending

  expect(section).not.toHaveAttribute(highlightAttribute)
  expect(button).toHaveAttribute(highlightAttribute, "access-token")
  expect(document.querySelector("h2")).not.toHaveAttribute(highlightAttribute)
  expect(disconnect).toHaveBeenCalled()
  await vi.runOnlyPendingTimersAsync()
})

it.each([
  "hidden",
  'aria-hidden="true"',
  'style="display: none"',
  'style="visibility: hidden"',
])("waits for a token section to become visible (%s)", async (attributes) => {
  document.body.innerHTML = `
    <div ${attributes}>
      <section aria-labelledby="security-access"><h2 id="security-access">Sessions &amp; Access</h2>
        <div data-slot="card"><div data-slot="card-title">Access tokens</div></div>
      </section>
    </div>
  `
  const section = document.querySelector<HTMLElement>('[data-slot="card"]')!
  section.scrollIntoView = vi.fn()
  const pending = handleHighlightAccessTokenSection(window.location.origin)
  expect(section).not.toHaveAttribute(highlightAttribute)

  const wrapper = document.body.firstElementChild!
  for (const name of wrapper.getAttributeNames()) wrapper.removeAttribute(name)
  await pending

  expect(section).toHaveAttribute(highlightAttribute, "access-token")
  await vi.runOnlyPendingTimersAsync()
})

it("disconnects after the bounded wait when no visible section is found", async () => {
  const disconnect = vi.spyOn(MutationObserver.prototype, "disconnect")
  const pending = handleHighlightAccessTokenSection(window.location.origin)
  await vi.advanceTimersByTimeAsync(5000)
  await pending

  expect(disconnect).toHaveBeenCalledOnce()
})

it.each([
  ["/console/personal", "System Access Token", "Generate Token"],
  ["/personal", "系统访问令牌", "重新生成"],
])(
  "highlights the nested Semi Design card on %s without activating it or reading its value",
  async (path, title, action) => {
    window.history.replaceState(null, "", path)
    document.body.innerHTML = `
    <main><div class="semi-card"><div class="semi-card" id="legacy-token">
      <h6>${title}</h6>
      <button>${action}</button>
      <input value="private-token">
    </div></div></main>
  `
    const group = document.querySelector<HTMLElement>("#legacy-token")!
    const button = document.querySelector("button")!
    const scrollIntoView = vi.fn()
    group.scrollIntoView = scrollIntoView
    const click = vi.spyOn(button, "click")
    const dispatch = vi.spyOn(EventTarget.prototype, "dispatchEvent")
    const read = vi.spyOn(HTMLInputElement.prototype, "value", "get")

    const pending = handleHighlightAccessTokenSection(window.location.origin)
    await vi.advanceTimersByTimeAsync(0)

    expect(group).toHaveAttribute(highlightAttribute, "access-token")
    expect(group.parentElement).not.toHaveAttribute(highlightAttribute)
    expect(button).toHaveAttribute(highlightAttribute, "access-token")
    expect(scrollIntoView).toHaveBeenCalledOnce()
    expect(click).not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalled()
    expect(read).not.toHaveBeenCalled()
    await pending
    await vi.runOnlyPendingTimersAsync()
  },
)

it("highlights an ungrouped token heading without marking the entire page", async () => {
  window.history.replaceState(null, "", "/profile")
  document.body.innerHTML = '<main class="card"><h2>Access Token</h2></main>'
  const heading = document.querySelector("h2")!
  heading.scrollIntoView = vi.fn()

  const pending = handleHighlightAccessTokenSection(window.location.origin)
  await vi.advanceTimersByTimeAsync(0)

  expect(heading).toHaveAttribute(highlightAttribute, "access-token")
  expect(document.querySelector("main")).not.toHaveAttribute(highlightAttribute)
  await pending
  await vi.runOnlyPendingTimersAsync()
})

it("highlights the legacy Security Settings tab when the token card is hidden", async () => {
  window.history.replaceState(null, "", "/console/personal")
  document.body.innerHTML = `
    <div class="semi-card">
      <div role="tablist">
        <div role="tab" data-tabkey="semiTabbinding" aria-selected="true">Account Binding</div>
        <div role="tab" data-tabkey="semiTabsecurity" aria-selected="false">安全设置</div>
      </div>
      <div role="tabpanel" hidden>
        <div class="semi-card"><h6>系统访问令牌</h6><button>生成令牌</button></div>
      </div>
    </div>`
  const securityTab = document.querySelector<HTMLElement>(
    '[data-tabkey="semiTabsecurity"]',
  )!
  securityTab.scrollIntoView = vi.fn()
  const click = vi.fn()
  securityTab.onclick = click
  const pending = handleHighlightAccessTokenSection(window.location.origin)
  await vi.advanceTimersByTimeAsync(0)
  expect(securityTab).toHaveAttribute(highlightAttribute, "access-token")
  expect(securityTab).toHaveAttribute("aria-selected", "false")
  expect(document.querySelector("button")).not.toHaveAttribute(
    highlightAttribute,
  )
  expect(click).not.toHaveBeenCalled()
  await pending
  await vi.runOnlyPendingTimersAsync()
})

it("ignores a request for a different origin before inspecting the document", async () => {
  const query = vi.spyOn(document, "querySelectorAll")
  await handleHighlightAccessTokenSection("https://different-origin.test")

  expect(query).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it("restores host inline styles and extends the cue when triggered again", async () => {
  document.body.innerHTML = `
    <section aria-labelledby="security-access"><div data-slot="card"
      data-all-api-hub-highlight="host-marker"
      style="outline: dashed red; outline-color: navy !important; box-shadow: none !important; border-radius: 8px;">
      <div data-slot="card-title">Access tokens</div>
      <button>Create access token</button>
    </div></section>
  `
  const section = document.querySelector<HTMLElement>('[data-slot="card"]')!
  const button = document.querySelector("button")!
  const originalStyles = section.style.cssText
  section.scrollIntoView = vi.fn()
  await handleHighlightAccessTokenSection(window.location.origin)

  expect(section.style.boxShadow).not.toBe("none")
  await vi.advanceTimersByTimeAsync(2000)
  await handleHighlightAccessTokenSection(window.location.origin)
  await vi.advanceTimersByTimeAsync(1000)
  expect(section).toHaveAttribute(highlightAttribute, "access-token")
  expect(button).toHaveAttribute(highlightAttribute, "access-token")

  await vi.advanceTimersByTimeAsync(2800)
  expect(section).toHaveAttribute(highlightAttribute, "host-marker")
  expect(button).not.toHaveAttribute(highlightAttribute)
  expect(section.style.cssText).toBe(originalStyles)
  expect(button).not.toHaveAttribute("style")
})

it("targets the inner Access tokens card instead of the outer Sessions & Access section containing Login sessions", async () => {
  document.body.innerHTML = `
    <section aria-labelledby="security-access" class="space-y-4">
      <h3 id="security-access">Sessions &amp; Access</h3>
      <div data-slot="card" id="login-sessions-card">
        <div data-slot="card-title">Login sessions</div>
        <button>Sign out other sessions</button>
      </div>
      <div data-slot="card" id="access-tokens-card">
        <div data-slot="card-header">
          <div data-slot="card-title">Access tokens</div>
          <div data-slot="card-action">
            <button>Access records</button>
            <button data-slot="button" id="create-token-btn">Create access token</button>
          </div>
        </div>
      </div>
    </section>
  `
  const outerSection = document.querySelector("section")!
  const sessionsCard = document.querySelector<HTMLElement>(
    "#login-sessions-card",
  )!
  const tokensCard = document.querySelector<HTMLElement>("#access-tokens-card")!
  const createBtn = document.querySelector<HTMLElement>("#create-token-btn")!
  const outerScroll = vi.fn()
  const cardScroll = vi.fn()
  outerSection.scrollIntoView = outerScroll
  tokensCard.scrollIntoView = cardScroll

  await handleHighlightAccessTokenSection(window.location.origin)

  expect(outerSection).not.toHaveAttribute(highlightAttribute)
  expect(sessionsCard).not.toHaveAttribute(highlightAttribute)
  expect(tokensCard).toHaveAttribute(highlightAttribute, "access-token")
  expect(createBtn).toHaveAttribute(highlightAttribute, "access-token")
  expect(outerScroll).not.toHaveBeenCalled()
  expect(cardScroll).toHaveBeenCalledWith({
    block: "center",
    behavior: "smooth",
  })
  await vi.runOnlyPendingTimersAsync()
})

it("waits for the inner Access tokens card to mount inside an already-rendered Sessions & Access section", async () => {
  document.body.innerHTML = `
    <section aria-labelledby="security-access" class="space-y-4">
      <h3 id="security-access">会话与访问</h3>
      <div data-slot="card" id="login-sessions-card">
        <div data-slot="card-title">登录会话</div>
      </div>
    </section>
  `
  const pending = handleHighlightAccessTokenSection(window.location.origin)
  await vi.advanceTimersByTimeAsync(100)
  expect(document.querySelector("section")).not.toHaveAttribute(
    highlightAttribute,
  )

  const tokensCard = document.createElement("div")
  tokensCard.setAttribute("data-slot", "card")
  tokensCard.id = "access-tokens-card"
  tokensCard.innerHTML = `
    <div data-slot="card-title">访问令牌</div>
    <button>访问记录</button>
    <button id="create-zh-btn">创建访问令牌</button>
  `
  const cardScroll = vi.fn()
  tokensCard.scrollIntoView = cardScroll
  document.querySelector("section")!.appendChild(tokensCard)

  await pending

  expect(tokensCard).toHaveAttribute(highlightAttribute, "access-token")
  expect(document.querySelector("#create-zh-btn")).toHaveAttribute(
    highlightAttribute,
    "access-token",
  )
  expect(cardScroll).toHaveBeenCalledWith({
    block: "center",
    behavior: "smooth",
  })
  await vi.runOnlyPendingTimersAsync()
})

it("targets an rc.40 Access Token card and its Regenerate control by card-title without clicking", async () => {
  document.body.innerHTML = `
    <section aria-labelledby="security-access">
      <h3 id="security-access">Sessions &amp; Access</h3>
      <div data-slot="card" id="login-sessions-card">
        <div data-slot="card-title">Login sessions</div>
      </div>
      <div data-slot="card" id="legacy-token-card">
        <h4>Access Token</h4>
        <button id="regen-btn">Regenerate</button>
      </div>
    </section>
  `
  const card = document.querySelector<HTMLElement>("#legacy-token-card")!
  const regen = document.querySelector<HTMLButtonElement>("#regen-btn")!
  card.scrollIntoView = vi.fn()
  const click = vi.spyOn(regen, "click")

  await handleHighlightAccessTokenSection(window.location.origin)

  expect(card).toHaveAttribute(highlightAttribute, "access-token")
  expect(regen).toHaveAttribute(highlightAttribute, "access-token")
  expect(click).not.toHaveBeenCalled()
  await vi.runOnlyPendingTimersAsync()
})

it.each(["wheel", "touchstart", "pointerdown", "keydown"])(
  "re-centers after async expansion and cancels already scheduled recentering on %s",
  async (interaction) => {
    document.body.innerHTML = `
    <section aria-labelledby="security-access">
      <h3 id="security-access">Sessions &amp; Access</h3>
      <div data-slot="card" id="login-sessions-card"></div>
      <div data-slot="card" id="access-tokens-card">
        <div data-slot="card-title">Access tokens</div>
        <button>Create access token</button>
      </div>
    </section>
  `
    const sessionsCard = document.querySelector<HTMLElement>(
      "#login-sessions-card",
    )!
    const tokensCard = document.querySelector<HTMLElement>(
      "#access-tokens-card",
    )!
    const scrollIntoView = vi.fn()
    tokensCard.scrollIntoView = scrollIntoView
    let cardTop = 400
    vi.spyOn(tokensCard, "getBoundingClientRect").mockImplementation(
      () => new DOMRect(0, cardTop, 800, 180),
    )

    await handleHighlightAccessTokenSection(window.location.origin)
    expect(scrollIntoView).toHaveBeenCalledTimes(1)

    // Async login sessions list loads above and pushes the tokens card off-screen.
    cardTop = 1900
    sessionsCard.appendChild(document.createElement("div"))
    await vi.advanceTimersByTimeAsync(200)
    expect(scrollIntoView).toHaveBeenCalledTimes(2)

    // Once the user interacts, do not fight their scrolling.
    cardTop = 2200
    sessionsCard.appendChild(document.createElement("div"))
    await vi.advanceTimersByTimeAsync(1)
    window.dispatchEvent(new Event(interaction))
    await vi.advanceTimersByTimeAsync(200)
    expect(scrollIntoView).toHaveBeenCalledTimes(2)

    await vi.runOnlyPendingTimersAsync()
  },
)

it("scrolls without inheriting CSS smooth scrolling when reduced motion is preferred", async () => {
  document.body.innerHTML = `
    <section aria-labelledby="security-access">
      <div data-slot="card"><div data-slot="card-title">Access tokens</div></div>
    </section>`
  const section = document.querySelector<HTMLElement>('[data-slot="card"]')!
  const scrollIntoView = vi.fn()
  section.scrollIntoView = scrollIntoView
  const matchMedia = vi.fn(() => ({ matches: true }))
  vi.stubGlobal("matchMedia", matchMedia)

  await handleHighlightAccessTokenSection(window.location.origin)

  expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)")
  expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({
    block: "center",
    behavior: "instant",
  })
  await vi.runOnlyPendingTimersAsync()
})

it("keeps an unmatched Sessions & Access group and its sessions card untouched", async () => {
  document.body.innerHTML = `
    <section aria-labelledby="security-access">
      <div data-slot="card"><div data-slot="card-title">Login sessions</div>
        <button>Create session</button>
      </div>
    </section>`
  const pending = handleHighlightAccessTokenSection(window.location.origin)
  await vi.advanceTimersByTimeAsync(5000)
  await pending
  expect(document.querySelector(`[${highlightAttribute}]`)).toBeNull()
})

it("highlights the rc.40 control when its status request renders the button later", async () => {
  document.body.innerHTML = `
    <section aria-labelledby="security-access">
      <div data-slot="card"><h4>Access Token</h4><button>Access records</button></div>
    </section>`
  const card = document.querySelector<HTMLElement>('[data-slot="card"]')!
  card.scrollIntoView = vi.fn()
  const pending = handleHighlightAccessTokenSection(window.location.origin)
  expect(card).toHaveAttribute(highlightAttribute, "access-token")
  const button = document.createElement("button")
  button.textContent = "Generate"
  card.append(button)
  await vi.advanceTimersByTimeAsync(100)
  expect(button).toHaveAttribute(highlightAttribute, "access-token")
  expect(card.querySelector("button")).not.toHaveAttribute(highlightAttribute)
  await pending
  await vi.runOnlyPendingTimersAsync()
})

it("uses the localized upstream action, leaving access records untouched", async () => {
  document.body.innerHTML = `
    <section aria-labelledby="security-access">
      <div data-slot="card"><div data-slot="card-title">存取令牌</div>
        <div data-slot="card-action"><button>存取紀錄</button><button>建立存取令牌</button></div>
      </div>
    </section>`
  const card = document.querySelector<HTMLElement>('[data-slot="card"]')!
  card.scrollIntoView = vi.fn()
  await handleHighlightAccessTokenSection(window.location.origin)
  expect(card).toHaveAttribute(highlightAttribute, "access-token")
  expect(card.querySelector("button:first-child")).not.toHaveAttribute(
    highlightAttribute,
  )
  expect(card.querySelector("button:last-child")).toHaveAttribute(
    highlightAttribute,
    "access-token",
  )
  await vi.runOnlyPendingTimersAsync()
})

it("leaves legacy-like controls on a same-site login route alone", async () => {
  window.history.replaceState(null, "", "/login")
  document.body.innerHTML =
    '<div class="semi-card"><h6>System Access Token</h6><button>Generate Token</button></div>'
  const pending = handleHighlightAccessTokenSection(window.location.origin)
  await vi.advanceTimersByTimeAsync(5000)
  await pending
  expect(document.querySelector(`[${highlightAttribute}]`)).toBeNull()
})

it("retains newer host styles and attributes when the cue expires", async () => {
  document.body.innerHTML = `
    <section aria-labelledby="security-access">
      <div data-slot="card" style="outline: dashed red; color: black">
        <div data-slot="card-title">Access tokens</div>
      </div>
    </section>`
  const card = document.querySelector<HTMLElement>('[data-slot="card"]')!
  card.scrollIntoView = vi.fn()
  await handleHighlightAccessTokenSection(window.location.origin)
  card.style.setProperty("outline-color", "green", "important")
  card.style.setProperty("color", "blue")
  card.setAttribute(highlightAttribute, "host-update")
  await vi.runOnlyPendingTimersAsync()
  expect(card.style.getPropertyValue("outline-color")).toBe("green")
  expect(card.style.getPropertyPriority("outline-color")).toBe("important")
  expect(card.style.color).toBe("blue")
  expect(card).toHaveAttribute(highlightAttribute, "host-update")
})

it("keeps the create action in view when the full token card exceeds the scroll viewport", async () => {
  document.body.innerHTML = `
    <section aria-labelledby="security-access">
      <div data-slot="card">
        <div data-slot="card-title">Access tokens</div>
        <button>Create access token</button>
      </div>
    </section>`
  const card = document.querySelector<HTMLElement>('[data-slot="card"]')!
  const action = card.querySelector("button")!
  action.scrollIntoView = vi.fn()
  card.scrollIntoView = vi.fn()
  vi.spyOn(card, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 800, 700, 2000),
  )
  await handleHighlightAccessTokenSection(window.location.origin)
  expect(card).toHaveAttribute(highlightAttribute, "access-token")
  expect(action).toHaveAttribute(highlightAttribute, "access-token")
  expect(action.scrollIntoView).toHaveBeenCalledOnce()
  expect(card.scrollIntoView).not.toHaveBeenCalled()
  await vi.runOnlyPendingTimersAsync()
})
