import { beforeEach, describe, expect, it, vi } from "vitest"

import { discoverNativeCheckInPage } from "~/services/checkin/discovery/nativePageDiscovery"
import {
  inspectCheckinPage,
  triggerCheckinPageAction,
} from "~/services/checkin/pageAction"
import { TURNSTILE_PRE_TRIGGER_KINDS } from "~/types/turnstile"

/**
 * Creates a mock DOM element for tests.
 */
function createMockElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  setup?: (el: HTMLElementTagNameMap[K]) => void,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName)
  setup?.(element)
  return element
}

describe("native check-in page actions", () => {
  it.each([undefined, "", "[", "x".repeat(201)])(
    "preserves optional versus default negative pattern fallback (%s)",
    (negativePattern) => {
      document.body.innerHTML = "<button>Already checked in</button>"
      expect(
        inspectCheckinPage({
          kind: TURNSTILE_PRE_TRIGGER_KINDS.ClickText,
          positivePattern: "checked in",
          negativePattern,
          candidateSelector: " ",
        }).hasTarget,
      ).toBe(true)
      expect(
        inspectCheckinPage({
          kind: TURNSTILE_PRE_TRIGGER_KINDS.CheckinButton,
          positivePattern: "checked in",
          negativePattern,
          candidateSelector: " ",
        }).hasTarget,
      ).toBe(false)
    },
  )

  it.each(["", "[", "x".repeat(201)])(
    "preserves text versus default positive pattern fallback (%s)",
    (positivePattern) => {
      document.body.innerHTML = "<button>Check in</button>"
      expect(
        inspectCheckinPage({
          kind: TURNSTILE_PRE_TRIGGER_KINDS.ClickText,
          positivePattern,
        }).hasTarget,
      ).toBe(false)
      expect(
        inspectCheckinPage({
          kind: TURNSTILE_PRE_TRIGGER_KINDS.CheckinButton,
          positivePattern,
        }).hasTarget,
      ).toBe(true)
    },
  )

  it("uses the grant button beside a clickable check-in section heading", () => {
    document.body.innerHTML = `
      <button id="section-toggle" type="button">
        <h3>Daily Check-in</h3><p>Check in daily to receive points</p>
      </button>
      <button id="grant" type="button">Check in now</button>
    `
    const headingClick = vi.spyOn(
      document.querySelector<HTMLButtonElement>("#section-toggle")!,
      "click",
    )
    const grantClick = vi.spyOn(
      document.querySelector<HTMLButtonElement>("#grant")!,
      "click",
    )
    const trigger = { kind: TURNSTILE_PRE_TRIGGER_KINDS.CheckinButton }

    expect(inspectCheckinPage(trigger)).toMatchObject({ hasTarget: true })
    expect(
      triggerCheckinPageAction({ requestId: "section-and-grant", trigger }),
    ).toMatchObject({ clicked: true, target: { text: "Check in now" } })
    expect(headingClick).not.toHaveBeenCalled()
    expect(grantClick).toHaveBeenCalledOnce()
  })

  it.each([
    "<h3>Daily Check-in</h3>",
    '<span role="heading" aria-level="3">Daily Check-in</span>',
  ])(
    "keeps a section heading as area evidence without clicking it: %s",
    (heading) => {
      document.body.innerHTML = `<button>${heading}</button><button disabled>Check in now</button>`
      const click = vi.spyOn(HTMLElement.prototype, "click")
      const trigger = { kind: TURNSTILE_PRE_TRIGGER_KINDS.CheckinButton }

      expect(inspectCheckinPage(trigger)).toMatchObject({
        hasTarget: false,
        hasCheckInArea: true,
      })
      expect(
        triggerCheckinPageAction({ requestId: "section-only", trigger })
          .clicked,
      ).toBe(false)
      expect(click).not.toHaveBeenCalled()
    },
  )

  it.each([
    '<button id="section-toggle"><h3>Daily Check in</h3></button>',
    '<h3 id="section-toggle" role="button">Daily Check in</h3>',
    '<div id="section-toggle" role="button"><span role="heading">Daily Check in</span></div>',
    '<h3><button id="section-toggle" aria-expanded="false">Daily Check in</button></h3>',
    '<div role="heading"><button id="section-toggle" aria-controls="checkin-panel">Daily Check in</button></div>',
  ])(
    "keeps a heading-only section as evidence, never an action: %s",
    (markup) => {
      document.body.innerHTML = markup
      const headingClick = vi.spyOn(
        document.querySelector<HTMLElement>("#section-toggle")!,
        "click",
      )
      const trigger = { kind: TURNSTILE_PRE_TRIGGER_KINDS.CheckinButton }

      expect(inspectCheckinPage(trigger)).toMatchObject({
        hasTarget: false,
        hasCheckInArea: true,
      })
      expect(
        triggerCheckinPageAction({ requestId: "heading-only", trigger })
          .clicked,
      ).toBe(false)
      expect(headingClick).not.toHaveBeenCalled()

      document.body.insertAdjacentHTML(
        "beforeend",
        '<button id="grant">Check in now</button>',
      )
      const grantClick = vi.spyOn(
        document.querySelector<HTMLButtonElement>("#grant")!,
        "click",
      )
      expect(inspectCheckinPage(trigger)).toMatchObject({ hasTarget: true })
      expect(
        triggerCheckinPageAction({ requestId: "heading-and-grant", trigger })
          .clicked,
      ).toBe(true)
      expect(headingClick).not.toHaveBeenCalled()
      expect(grantClick).toHaveBeenCalledOnce()
    },
  )

  it("preserves explicit selectors and ordinary actions inside heading wrappers", () => {
    document.body.innerHTML =
      '<h3><button id="grant">Check in now</button></h3>'
    const trigger = { kind: TURNSTILE_PRE_TRIGGER_KINDS.CheckinButton }
    expect(inspectCheckinPage(trigger).hasTarget).toBe(true)

    const button = document.querySelector<HTMLButtonElement>("#grant")!
    button.setAttribute("aria-expanded", "false")
    expect(inspectCheckinPage(trigger).hasTarget).toBe(false)
    const click = vi.spyOn(button, "click")
    expect(
      triggerCheckinPageAction({
        requestId: "provider-selector",
        trigger: {
          kind: TURNSTILE_PRE_TRIGGER_KINDS.ClickSelector,
          selector: "#grant",
        },
      }).clicked,
    ).toBe(true)
    expect(click).toHaveBeenCalledOnce()
  })

  it.each([
    "<button disabled>Check in</button>",
    "<fieldset disabled><button>Check in</button></fieldset>",
    '<button aria-disabled="true">Check in</button>',
    "<section hidden><button>Check in</button></section>",
  ])("never dispatches an unavailable explicit target: %s", (markup) => {
    document.body.innerHTML = markup
    const click = vi.spyOn(HTMLElement.prototype, "click")
    expect(
      triggerCheckinPageAction({
        requestId: "unavailable-explicit",
        trigger: {
          kind: TURNSTILE_PRE_TRIGGER_KINDS.ClickSelector,
          selector: "button",
        },
      }).clicked,
    ).toBe(false)
    expect(click).not.toHaveBeenCalled()
  })

  it("rechecks uniqueness at dispatch after a successful inspection", () => {
    document.body.innerHTML = "<button>Check in</button>"
    const trigger = { kind: TURNSTILE_PRE_TRIGGER_KINDS.CheckinButton }
    expect(inspectCheckinPage(trigger).hasTarget).toBe(true)
    document.body.insertAdjacentHTML(
      "beforeend",
      "<button>Special check in</button>",
    )
    const click = vi.spyOn(HTMLElement.prototype, "click")
    expect(
      triggerCheckinPageAction({ requestId: "changed-targets", trigger })
        .clicked,
    ).toBe(false)
    expect(click).not.toHaveBeenCalled()
  })

  it("explores button-role navigation instead of calling the current page a check-in area", async () => {
    const originalUrl = location.href
    const navigate = vi.fn(async (url: string) => {
      history.replaceState(null, "", url)
      document.body.innerHTML =
        new URL(url).pathname === "/invite"
          ? "<button>Check in</button>"
          : '<a role="button" href="/invite">Check in</a>'
    })
    try {
      await navigate(new URL("/profile", originalUrl).href)
      expect(
        await discoverNativeCheckInPage({
          pageUrl: location.href,
          navigate,
          inspect: async () =>
            inspectCheckinPage({
              kind: TURNSTILE_PRE_TRIGGER_KINDS.CheckinButton,
            }),
        }),
      ).toBe(new URL("/invite", originalUrl).href)
    } finally {
      history.replaceState(null, "", originalUrl)
    }
  })
  it.each([
    { kind: TURNSTILE_PRE_TRIGGER_KINDS.CheckinButton },
    { kind: TURNSTILE_PRE_TRIGGER_KINDS.ClickSelector, selector: "button" },
    {
      kind: TURNSTILE_PRE_TRIGGER_KINDS.ClickText,
      positivePattern: "check in",
    },
  ])(
    "refuses ambiguous actions for $kind in both inspection and execution",
    async (trigger) => {
      document.body.innerHTML =
        "<button>Check in</button><button>Special check in</button>"
      const clicked = vi.spyOn(HTMLElement.prototype, "click")
      expect(inspectCheckinPage(trigger).hasTarget).toBe(false)
      expect(
        await discoverNativeCheckInPage({
          pageUrl: location.href,
          navigate: vi.fn(),
          inspect: async () => inspectCheckinPage(trigger),
        }),
      ).toBeNull()
      expect(
        triggerCheckinPageAction({ requestId: "ambiguous", trigger }).clicked,
      ).toBe(false)
      expect(clicked).not.toHaveBeenCalled()
    },
  )
  beforeEach(() => {
    document.body.innerHTML = ""
    globalThis.__aahTurnstilePreTriggerState = undefined
    vi.restoreAllMocks()
  })
  it("recognizes an icon-only checked area through its accessible label without clicking", () => {
    document.body.innerHTML =
      '<button disabled aria-label="Checked in"></button>'
    const click = vi.spyOn(HTMLElement.prototype, "click")
    expect(
      inspectCheckinPage({ kind: TURNSTILE_PRE_TRIGGER_KINDS.CheckinButton }),
    ).toMatchObject({
      hasTarget: false,
      hasCheckInArea: true,
    })
    expect(click).not.toHaveBeenCalled()
  })
  it.each(["Check in", "Checked in", "已签到"])(
    "recognizes a visible disabled %s area without authorizing a click",
    (label) => {
      document.body.innerHTML = `<button disabled>${label}</button>`
      const click = vi.spyOn(HTMLElement.prototype, "click")
      expect(
        inspectCheckinPage({ kind: TURNSTILE_PRE_TRIGGER_KINDS.CheckinButton }),
      ).toMatchObject({
        hasTarget: false,
        hasCheckInArea: true,
      })
      expect(click).not.toHaveBeenCalled()
    },
  )
  it("ignores actions inside hidden ancestors and prefers an available visible action", () => {
    document.body.innerHTML =
      '<div style="display:none"><button>Check in</button></div><a href="/invite">Daily rewards</a>'
    expect(
      inspectCheckinPage({ kind: TURNSTILE_PRE_TRIGGER_KINDS.CheckinButton }),
    ).toMatchObject({
      hasTarget: false,
      candidates: ["/invite"],
    })
    document.body.innerHTML += "<button>Check in today</button>"
    expect(
      inspectCheckinPage({ kind: TURNSTILE_PRE_TRIGGER_KINDS.CheckinButton })
        .hasTarget,
    ).toBe(true)
  })
  it.each(["javascript:void(0)", "javascript:;"])(
    "retains native action anchors with a non-navigating href (%s)",
    (href) => {
      document.body.innerHTML = `<a role="button" href="${href}">Check in</a>`
      const action = document.querySelector("a")!
      const click = vi.spyOn(action, "click").mockImplementation(() => {})
      expect(
        inspectCheckinPage({ kind: TURNSTILE_PRE_TRIGGER_KINDS.CheckinButton })
          .hasTarget,
      ).toBe(true)
      expect(
        triggerCheckinPageAction({
          requestId: "anchor-action",
          trigger: { kind: TURNSTILE_PRE_TRIGGER_KINDS.CheckinButton },
        }),
      ).toMatchObject({ clicked: true })
      expect(click).toHaveBeenCalledOnce()
    },
  )
  it.each([
    '<input type="hidden" name="cf-turnstile-response" value="">',
    '<div hidden><div class="cf-turnstile"></div></div>',
    '<div style="display:none"><iframe src="https://challenges.cloudflare.com/turnstile/test"></iframe></div>',
  ])(
    "does not treat hidden empty verification markup as a usable page (%s)",
    (markup) => {
      document.body.innerHTML = markup + '<a href="/invite">Daily rewards</a>'
      expect(
        inspectCheckinPage(
          { kind: TURNSTILE_PRE_TRIGGER_KINDS.CheckinButton },
          true,
        ),
      ).toMatchObject({ hasTarget: false, candidates: ["/invite"] })
    },
  )
  it.each([
    '<div class="cf-turnstile"></div>',
    '<input type="hidden" name="cf-turnstile-response" value="usable-token">',
  ])(
    "keeps a rendered widget or usable token on the default page (%s)",
    (markup) => {
      document.body.innerHTML = markup + '<a href="/invite">Daily rewards</a>'
      expect(
        inspectCheckinPage(
          { kind: TURNSTILE_PRE_TRIGGER_KINDS.CheckinButton },
          true,
        ),
      ).toMatchObject({ hasTarget: true, candidates: [] })
    },
  )
  it("marks navigation evidence incomplete when links exceed the scan budget", () => {
    document.body.innerHTML =
      '<a href="/daily">Daily rewards</a>' +
      '<a href="/other">Other</a>'.repeat(300)
    expect(
      inspectCheckinPage({ kind: TURNSTILE_PRE_TRIGGER_KINDS.CheckinButton }),
    ).toMatchObject({
      hasTarget: false,
      candidatesComplete: false,
    })
  })
  it("inspects the native action and same-site welfare links without clicking", () => {
    document.body.innerHTML =
      '<a href="/invite">Welfare</a><a href="https://elsewhere.test/daily">Check in</a><a href="/api/checkin">Check in</a>'
    const click = vi.spyOn(HTMLElement.prototype, "click")
    expect(
      inspectCheckinPage({ kind: TURNSTILE_PRE_TRIGGER_KINDS.CheckinButton }),
    ).toEqual({
      success: true,
      hasTarget: false,
      pageUrl: location.href,
      candidates: ["/invite"],
    })
    expect(click).not.toHaveBeenCalled()
    document.body.innerHTML += "<button>Check in today</button>"
    expect(
      inspectCheckinPage({ kind: TURNSTILE_PRE_TRIGGER_KINDS.CheckinButton })
        .hasTarget,
    ).toBe(true)
    expect(click).not.toHaveBeenCalled()
  })
  describe("triggerCheckinPageAction", () => {
    it("returns error when requestId is missing", async () => {
      const result = triggerCheckinPageAction({
        requestId: "   ",
        trigger: { kind: TURNSTILE_PRE_TRIGGER_KINDS.CheckinButton },
      })

      expect(result).toMatchObject({
        status: "error",
        clicked: false,
        reason: "missingRequestId",
      })
    })

    it("clicks the default check-in button and returns a serializable clicked result", async () => {
      const button = createMockElement("button", (el) => {
        el.textContent = "签到"
        el.click = vi.fn()
      })
      document.body.appendChild(button)

      const result = triggerCheckinPageAction({
        requestId: "req-native-click",
        trigger: { kind: TURNSTILE_PRE_TRIGGER_KINDS.CheckinButton },
      })

      expect(result).toMatchObject({
        status: "clicked",
        clicked: true,
        reason: "clicked",
      })
      expect(result.target?.text).toBe("签到")
      expect(result.detection.hasTurnstile).toBe(false)
      expect(button.click).toHaveBeenCalledTimes(1)
    })

    it("returns target_not_found when the trigger is disabled", async () => {
      const result = triggerCheckinPageAction({
        requestId: "req-native-disabled",
        trigger: { kind: TURNSTILE_PRE_TRIGGER_KINDS.None },
      })

      expect(result).toMatchObject({
        status: "target_not_found",
        clicked: false,
        reason: "disabled",
      })
    })

    it("returns target_not_found when no configured trigger exists", async () => {
      const result = triggerCheckinPageAction({
        requestId: "req-native-missing",
        trigger: {
          kind: TURNSTILE_PRE_TRIGGER_KINDS.ClickSelector,
          selector: ".missing-checkin-button",
        },
      })

      expect(result).toMatchObject({
        status: "target_not_found",
        clicked: false,
        reason: "noTarget",
      })
    })

    it("returns throttled when the same request clicks too frequently", async () => {
      const button = createMockElement("button", (el) => {
        el.textContent = "Check in"
        el.click = vi.fn()
      })
      document.body.appendChild(button)

      const trigger = {
        kind: TURNSTILE_PRE_TRIGGER_KINDS.CheckinButton,
        throttle: { maxAttempts: 2, minIntervalMs: 1200 },
      } as const

      const first = triggerCheckinPageAction({
        requestId: "req-native-throttle",
        trigger,
      })
      const second = triggerCheckinPageAction({
        requestId: "req-native-throttle",
        trigger,
      })

      expect(first.status).toBe("clicked")
      expect(second).toMatchObject({
        status: "throttled",
        clicked: false,
        reason: "throttled",
      })
      expect(button.click).toHaveBeenCalledTimes(1)
    })

    it("returns throttled when the attempt limit is reached", async () => {
      const button = createMockElement("button", (el) => {
        el.textContent = "Check in"
        el.click = vi.fn()
      })
      document.body.appendChild(button)

      const trigger = {
        kind: TURNSTILE_PRE_TRIGGER_KINDS.CheckinButton,
        throttle: { maxAttempts: 1, minIntervalMs: 0 },
      } as const

      const first = triggerCheckinPageAction({
        requestId: "req-native-max-attempts",
        trigger,
      })
      const second = triggerCheckinPageAction({
        requestId: "req-native-max-attempts",
        trigger,
      })

      expect(first.status).toBe("clicked")
      expect(second).toMatchObject({
        status: "throttled",
        clicked: false,
        reason: "maxAttempts",
      })
      expect(button.click).toHaveBeenCalledTimes(1)
    })

    it("keeps the default negative label filter for completed buttons", async () => {
      const completed = createMockElement("button", (el) => {
        el.textContent = "已签到"
        el.click = vi.fn()
      })
      const actionable = createMockElement("button", (el) => {
        el.textContent = "签到"
        el.click = vi.fn()
      })
      document.body.appendChild(completed)
      document.body.appendChild(actionable)

      const result = triggerCheckinPageAction({
        requestId: "req-native-negative-filter",
        trigger: { kind: TURNSTILE_PRE_TRIGGER_KINDS.CheckinButton },
      })

      expect(result.status).toBe("clicked")
      expect(completed.click).not.toHaveBeenCalled()
      expect(actionable.click).toHaveBeenCalledTimes(1)
    })
  })
})
