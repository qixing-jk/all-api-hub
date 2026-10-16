import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { handleTriggerCheckinPageAction } from "~/entrypoints/content/messageHandlers/handlers/turnstileGuard"
import { showTurnstileManualAssistToast } from "~/entrypoints/content/shieldBypassAssist/utils/shieldBypassToasts"
import {
  onRuntimeMessage,
  sendRuntimeMessage,
} from "~/utils/browser/runtimeMessages"

vi.mock("~/utils/browser/runtimeMessages", () => ({
  sendRuntimeMessage: vi.fn(async () => ({ presented: true })),
  onRuntimeMessage: vi.fn(() => vi.fn()),
}))
vi.mock(
  "~/entrypoints/content/shieldBypassAssist/utils/shieldBypassToasts",
  () => ({ showTurnstileManualAssistToast: vi.fn() }),
)

describe("native check-in verification", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    document.body.innerHTML = '<button id="checkin">签到</button>'
    globalThis.__aahTurnstilePreTriggerState = undefined
  })
  afterEach(() => vi.useRealTimers())

  it("returns a verification result when displaying the reminder fails", async () => {
    vi.mocked(showTurnstileManualAssistToast).mockRejectedValueOnce(
      new Error("UI unavailable"),
    )
    document
      .querySelector("button")!
      .addEventListener("click", () =>
        document.body.insertAdjacentHTML(
          "beforeend",
          '<div class="cf-turnstile"></div>',
        ),
      )
    const response = vi.fn()
    handleTriggerCheckinPageAction(
      {
        requestId: "failed-reminder",
        trigger: { kind: "clickSelector", selector: "#checkin" },
      },
      response,
    )
    await vi.advanceTimersByTimeAsync(6_000)
    expect(response).toHaveBeenCalledWith(
      expect.objectContaining({
        verification: { status: "required", provider: "turnstile" },
      }),
    )
  })

  it("detects a pre-rendered widget when the click makes it visible", async () => {
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div hidden><div class="cf-turnstile"></div></div>',
    )
    document
      .querySelector("button")!
      .addEventListener("click", () =>
        document.querySelector("[hidden]")?.removeAttribute("hidden"),
      )
    const response = vi.fn()
    handleTriggerCheckinPageAction(
      {
        requestId: "revealed-vendor",
        trigger: { kind: "clickSelector", selector: "#checkin" },
      },
      response,
    )
    await vi.advanceTimersByTimeAsync(6_000)
    expect(sendRuntimeMessage).toHaveBeenCalledOnce()
    document.querySelector(".cf-turnstile")!.setAttribute("hidden", "")
    await vi.advanceTimersByTimeAsync(500)
    expect(response).toHaveBeenCalledWith(
      expect.objectContaining({
        verification: { status: "completed", provider: "turnstile" },
      }),
    )
  })

  it("ignores an unchanged vendor widget from an unrelated form", async () => {
    document.body.insertAdjacentHTML(
      "beforeend",
      '<form><div class="cf-turnstile"></div></form>',
    )
    const response = vi.fn()
    handleTriggerCheckinPageAction(
      {
        requestId: "existing-vendor",
        trigger: { kind: "clickSelector", selector: "#checkin" },
      },
      response,
    )
    await vi.advanceTimersByTimeAsync(6_000)
    expect(response).toHaveBeenCalledWith(
      expect.objectContaining({ verification: { status: "not_present" } }),
    )
    expect(sendRuntimeMessage).not.toHaveBeenCalled()
  })

  it("finishes observing the new widget when it closes while an unrelated widget remains", async () => {
    document.body.insertAdjacentHTML(
      "beforeend",
      '<form><div class="cf-turnstile"></div></form>',
    )
    document.querySelector("button")!.addEventListener("click", () => {
      if (!document.querySelector("#new-widget"))
        document.body.insertAdjacentHTML(
          "beforeend",
          '<div id="new-widget" class="cf-turnstile"></div>',
        )
    })
    const response = vi.fn()
    handleTriggerCheckinPageAction(
      {
        requestId: "closed-vendor",
        trigger: { kind: "clickSelector", selector: "#checkin" },
      },
      response,
    )
    await vi.advanceTimersByTimeAsync(6_000)
    document.querySelector("#new-widget")!.remove()
    await vi.advanceTimersByTimeAsync(500)
    expect(response).toHaveBeenCalledWith(
      expect.objectContaining({
        verification: { status: "completed", provider: "turnstile" },
      }),
    )
  })

  it.each([
    '<div hidden><div class="cf-turnstile"></div></div>',
    '<textarea name="g-recaptcha-response" hidden></textarea>',
    '<div class="grecaptcha-badge"><iframe src="https://www.google.com/recaptcha/api2/anchor?size=invisible"></iframe></div>',
    '<div class="h-captcha" data-size="invisible"></div>',
  ])("ignores non-actionable vendor evidence: %s", async (html) => {
    document.querySelector("button")!.addEventListener("click", () => {
      document.body.insertAdjacentHTML("beforeend", html)
    })
    const response = vi.fn()
    handleTriggerCheckinPageAction(
      {
        requestId: "hidden-vendor",
        trigger: { kind: "clickSelector", selector: "#checkin" },
      },
      response,
    )
    await vi.advanceTimersByTimeAsync(6_000)
    expect(response).toHaveBeenCalledWith(
      expect.objectContaining({ verification: { status: "not_present" } }),
    )
    expect(sendRuntimeMessage).not.toHaveBeenCalled()
  })

  it.each(["another-request", "bounded-open"])(
    "isolates and bounds reminder extension: %s",
    async (openedRequestId) => {
      document.querySelector("button")!.addEventListener("click", () => {
        if (!document.querySelector(".cf-turnstile"))
          document.body.insertAdjacentHTML(
            "beforeend",
            '<div class="cf-turnstile"></div>',
          )
      })
      const response = vi.fn()
      handleTriggerCheckinPageAction(
        {
          requestId: "bounded-open",
          trigger: { kind: "clickSelector", selector: "#checkin" },
        },
        response,
      )
      await vi.advanceTimersByTimeAsync(6_000)
      await vi.dynamicImportSettled()
      await vi.advanceTimersByTimeAsync(34_000)
      const listener = vi.mocked(onRuntimeMessage).mock.calls.at(-1)![0]
      listener(
        { action: "verificationAssistOpened", requestId: openedRequestId },
        {},
        vi.fn(),
      )
      await vi.advanceTimersByTimeAsync(20_000)
      if (openedRequestId === "another-request") {
        expect(response).toHaveBeenCalledWith(
          expect.objectContaining({
            verification: { status: "required", provider: "turnstile" },
          }),
        )
      } else {
        expect(response).not.toHaveBeenCalled()
        listener(
          { action: "verificationAssistOpened", requestId: openedRequestId },
          {},
          vi.fn(),
        )
        await vi.advanceTimersByTimeAsync(26_000)
        expect(response).toHaveBeenCalledWith(
          expect.objectContaining({
            verification: { status: "required", provider: "turnstile" },
          }),
        )
      }
    },
  )

  it("gives a full manual window after opening a late reminder and removes its listener", async () => {
    document.querySelector("button")!.addEventListener("click", () => {
      document.body.insertAdjacentHTML(
        "beforeend",
        '<div class="cf-turnstile"></div>',
      )
    })
    const response = vi.fn()
    handleTriggerCheckinPageAction(
      {
        requestId: "late-open",
        trigger: { kind: "clickSelector", selector: "#checkin" },
      },
      response,
    )
    await vi.advanceTimersByTimeAsync(6_000)
    await vi.dynamicImportSettled()
    await vi.advanceTimersByTimeAsync(34_000)
    const listener = vi.mocked(onRuntimeMessage).mock.calls.at(-1)?.[0]
    expect(listener).toBeDefined()
    listener!(
      { action: "verificationAssistOpened", requestId: "late-open" },
      {},
      vi.fn(),
    )
    await vi.advanceTimersByTimeAsync(30_000)
    expect(response).not.toHaveBeenCalled()
    document
      .querySelectorAll(".cf-turnstile")
      .forEach((element) => element.remove())
    await vi.advanceTimersByTimeAsync(500)
    expect(response).toHaveBeenCalledWith(
      expect.objectContaining({
        verification: { status: "completed", provider: "turnstile" },
      }),
    )
    expect(
      vi.mocked(onRuntimeMessage).mock.results.at(-1)?.value,
    ).toHaveBeenCalledOnce()
  })

  it.each([
    '<section><h2>图形验证码</h2><canvas></canvas><input aria-label="请输入图片中的字符"></section>',
    '<section><h2>Captcha</h2><p>Type the characters in the image</p><canvas></canvas><input placeholder="Type the characters in the image"></section>',
    '<div role="dialog"><h2>Security verification</h2><p>Drag the slider to complete the puzzle</p><canvas></canvas><div role="slider" tabindex="0"></div></div>',
    '<div role="dialog"><p>Select the matching shapes in the image in order</p><div role="group" tabindex="0"><img src="challenge.png" alt="Challenge"></div></div>',
    '<form><img src="/captcha/image"><label for="answer">验证码</label><input id="answer"></form>',
  ])(
    "recognizes verification semantics without vendor classes: %s",
    async (html) => {
      document.querySelector("button")!.addEventListener("click", () => {
        document.body.insertAdjacentHTML("beforeend", html)
      })
      const response = vi.fn()
      handleTriggerCheckinPageAction(
        {
          requestId: "native-generic",
          trigger: { kind: "clickSelector", selector: "#checkin" },
        },
        response,
      )
      await vi.advanceTimersByTimeAsync(6_000)
      expect(sendRuntimeMessage).toHaveBeenCalledTimes(1)
      expect(response).not.toHaveBeenCalled()
      document.querySelector("section, [role=dialog], form")!.remove()
      await vi.advanceTimersByTimeAsync(500)
      expect(response).toHaveBeenCalledWith(
        expect.objectContaining({
          verification: expect.objectContaining({ status: "completed" }),
        }),
      )
    },
  )

  it.each([
    '<section><h2>Image editor</h2><p>Select image to upload</p><img src="preview.png"><button>Upload</button></section>',
    '<form><img src="logo.png" alt="Site logo"><input autocomplete="one-time-code" placeholder="Email verification code"><button>Verify</button></form>',
    '<section><h2>Image editor</h2><canvas></canvas><input type="range"><button>Rotate</button></section>',
    '<div role="dialog"><h2>Human verification required</h2><img src="logo.png" alt="Site logo"><button>Continue</button></div>',
    '<div role="dialog"><img src="logo.png" alt="Site logo"><input placeholder="Email verification code"></div>',
    '<div role="dialog"><h2>Check-in verification</h2><p role="alert">Neither today nor yesterday has usage exceeding 0.4 credits.</p></div>',
    '<div role="dialog"><div class="captcha-panel">Loading verification</div></div>',
    '<div role="dialog" hidden><img src="captcha.png" alt="验证码"><input placeholder="请输入验证码"></div>',
    '<div role="dialog" style="display:none"><div class="captcha-panel"><canvas></canvas></div></div>',
  ])(
    "does not request intervention without an active challenge: %s",
    async (html) => {
      document.body.insertAdjacentHTML("beforeend", html)
      const response = vi.fn()
      handleTriggerCheckinPageAction(
        {
          requestId: "native-no-challenge",
          trigger: { kind: "clickSelector", selector: "#checkin" },
        },
        response,
      )
      await vi.advanceTimersByTimeAsync(3_000)
      expect(sendRuntimeMessage).not.toHaveBeenCalled()
      expect(response).toHaveBeenCalledWith(
        expect.objectContaining({
          verification: { status: "not_present" },
        }),
      )
    },
  )

  it.each([
    '<div class="captcha-panel captcha-click"><div class="gc-picture" style="background-image:url(test.png)"></div></div>',
    '<div class="captcha-panel"><canvas></canvas><input type="range"></div>',
    '<div class="geetest_panel"><canvas></canvas></div>',
  ])(
    "requests intervention for an interactive image challenge: %s",
    async (html) => {
      document.querySelector("button")!.addEventListener("click", () => {
        document.body.insertAdjacentHTML(
          "beforeend",
          `<div role="dialog">${html}</div>`,
        )
      })
      const response = vi.fn()
      handleTriggerCheckinPageAction(
        {
          requestId: "native-interactive",
          trigger: { kind: "clickSelector", selector: "#checkin" },
        },
        response,
      )
      await vi.advanceTimersByTimeAsync(6_000)
      expect(sendRuntimeMessage).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(49_000)
      expect(response).toHaveBeenCalledWith(
        expect.objectContaining({
          verification: { status: "required", provider: "interactive" },
        }),
      )
    },
  )

  it("requests intervention for an image captcha and does not treat typed text as completion", async () => {
    document.querySelector("button")!.addEventListener("click", () => {
      document.body.insertAdjacentHTML(
        "beforeend",
        '<div role="dialog"><img src="data:image/png;base64,AA" alt="Verification Code"><input placeholder="Please enter verification code"></div>',
      )
    })
    const response = vi.fn()
    handleTriggerCheckinPageAction(
      {
        requestId: "native-image",
        trigger: { kind: "clickSelector", selector: "#checkin" },
      },
      response,
    )
    await vi.advanceTimersByTimeAsync(6_000)
    expect(sendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.TurnstileRequestUserAssist,
      requestId: "native-image",
    })
    ;(document.querySelector("input") as HTMLInputElement).value = "ABCD"
    await vi.advanceTimersByTimeAsync(1_000)
    expect(response).not.toHaveBeenCalled()
    document.querySelector('[role="dialog"]')!.remove()
    await vi.advanceTimersByTimeAsync(500)
    expect(response).toHaveBeenCalledWith(
      expect.objectContaining({
        verification: { status: "completed", provider: "image" },
      }),
    )
  })

  it("notifies for a challenge rendered after the click and waits for completion", async () => {
    document.querySelector("button")!.addEventListener("click", () => {
      setTimeout(() => {
        document.body.insertAdjacentHTML(
          "beforeend",
          '<div class="cf-turnstile"><input name="cf-turnstile-response"></div>',
        )
      }, 500)
    })
    const response = vi.fn()
    handleTriggerCheckinPageAction(
      {
        requestId: "native-delayed",
        trigger: { kind: "clickSelector", selector: "#checkin" },
      },
      response,
    )
    await vi.advanceTimersByTimeAsync(6_000)
    expect(sendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.TurnstileRequestUserAssist,
      requestId: "native-delayed",
    })
    expect(response).not.toHaveBeenCalled()
    ;(document.querySelector("input") as HTMLInputElement).value =
      "solved-token"
    await vi.advanceTimersByTimeAsync(500)
    expect(response).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        clicked: true,
        verification: { status: "completed", provider: "turnstile" },
      }),
    )
  })

  it.each([
    [
      "recaptcha",
      '<div class="g-recaptcha"><textarea name="g-recaptcha-response"></textarea></div>',
    ],
    [
      "hcaptcha",
      '<div class="h-captcha"><textarea name="h-captcha-response"></textarea></div>',
    ],
  ])(
    "keeps an unresolved %s challenge classified as requiring verification",
    async (provider, html) => {
      document.querySelector("button")!.addEventListener("click", () => {
        document.body.insertAdjacentHTML("beforeend", html)
      })
      const response = vi.fn()
      handleTriggerCheckinPageAction(
        {
          requestId: `native-${provider}`,
          trigger: { kind: "clickSelector", selector: "#checkin" },
        },
        response,
      )
      await vi.advanceTimersByTimeAsync(6_000)
      await vi.dynamicImportSettled()
      await vi.advanceTimersByTimeAsync(49_000)
      expect(response).toHaveBeenCalledWith(
        expect.objectContaining({
          verification: { status: "required", provider },
        }),
      )
      expect(sendRuntimeMessage).toHaveBeenCalledTimes(1)
    },
  )

  it("does not notify just because a captcha script was loaded", async () => {
    document.body.insertAdjacentHTML(
      "beforeend",
      '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>',
    )
    const response = vi.fn()
    handleTriggerCheckinPageAction(
      {
        requestId: "native-script-only",
        trigger: { kind: "clickSelector", selector: "#checkin" },
      },
      response,
    )
    await vi.advanceTimersByTimeAsync(3_000)
    expect(response).toHaveBeenCalledWith(
      expect.objectContaining({ verification: { status: "not_present" } }),
    )
    expect(sendRuntimeMessage).not.toHaveBeenCalled()
  })

  it("returns for status readback when the native callback consumes the token and removes its widget", async () => {
    document.querySelector("button")!.addEventListener("click", () => {
      document.body.insertAdjacentHTML(
        "beforeend",
        '<div class="cf-turnstile"></div>',
      )
      setTimeout(() => document.querySelector(".cf-turnstile")!.remove(), 1_000)
    })
    const response = vi.fn()
    handleTriggerCheckinPageAction(
      {
        requestId: "native-callback",
        trigger: { kind: "clickSelector", selector: "#checkin" },
      },
      response,
    )
    await vi.advanceTimersByTimeAsync(2_000)
    expect(response).toHaveBeenCalledWith(
      expect.objectContaining({
        verification: { status: "completed", provider: "turnstile" },
      }),
    )
    expect(sendRuntimeMessage).not.toHaveBeenCalled()
  })

  it("keeps polling while presentation is queued and gives the user a full manual wait", async () => {
    vi.mocked(sendRuntimeMessage).mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ presented: true }), 30_000),
        ),
    )
    document.querySelector("button")!.addEventListener("click", () => {
      document.body.insertAdjacentHTML(
        "beforeend",
        '<div class="cf-turnstile"><input name="cf-turnstile-response"></div>',
      )
    })
    const response = vi.fn()
    handleTriggerCheckinPageAction(
      {
        requestId: "native-queued",
        trigger: { kind: "clickSelector", selector: "#checkin" },
      },
      response,
    )
    await vi.advanceTimersByTimeAsync(50_000)
    expect(response).not.toHaveBeenCalled()
    ;(document.querySelector("input") as HTMLInputElement).value =
      "solved-after-queue"
    await vi.advanceTimersByTimeAsync(500)
    expect(response).toHaveBeenCalledWith(
      expect.objectContaining({
        verification: { status: "completed", provider: "turnstile" },
      }),
    )
  })

  it("stops after the quiet attempt when reminder delivery is declined", async () => {
    vi.mocked(sendRuntimeMessage).mockResolvedValueOnce({ presented: false })
    document.querySelector("button")!.addEventListener("click", () => {
      document.body.insertAdjacentHTML(
        "beforeend",
        '<div class="cf-turnstile"></div>',
      )
    })
    const response = vi.fn()
    handleTriggerCheckinPageAction(
      {
        requestId: "native-quiet",
        trigger: { kind: "clickSelector", selector: "#checkin" },
      },
      response,
    )
    await vi.advanceTimersByTimeAsync(6_000)
    expect(response).toHaveBeenCalledWith(
      expect.objectContaining({
        verification: { status: "required", provider: "turnstile" },
      }),
    )
  })

  it("requests assistance when a poll runs just after the automatic deadline", async () => {
    document.querySelector("button")!.addEventListener("click", () => {
      document.body.insertAdjacentHTML(
        "beforeend",
        '<div class="cf-turnstile"></div>',
      )
    })
    const response = vi.fn()
    handleTriggerCheckinPageAction(
      {
        requestId: "native-late-poll",
        trigger: { kind: "clickSelector", selector: "#checkin" },
      },
      response,
    )
    await vi.advanceTimersByTimeAsync(3_750)
    vi.setSystemTime(Date.now() + 1_000)
    await vi.advanceTimersByTimeAsync(500)
    expect(sendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.TurnstileRequestUserAssist,
      requestId: "native-late-poll",
    })
    document.querySelector(".cf-turnstile")!.remove()
    await vi.advanceTimersByTimeAsync(500)
  })
})
