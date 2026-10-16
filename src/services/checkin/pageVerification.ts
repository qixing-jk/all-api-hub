import {
  TURNSTILE_ASSIST_TURN_WAIT_MS,
  TURNSTILE_AUTO_ASSIST_MS,
  TURNSTILE_CONTAINER_SELECTOR,
  TURNSTILE_IFRAME_SELECTOR,
  TURNSTILE_MANUAL_WAIT_MS,
  TURNSTILE_RESPONSE_FIELD_SELECTOR,
} from "~/constants/turnstile"
import type { PageVerificationResult } from "~/types/turnstile"

import { createVerificationManualWindow } from "./verificationManualWindow"

const APPEARANCE_WAIT_MS = 2_000
const POLL_INTERVAL_MS = 250

// Scripts and page text alone do not establish that this action needs a captcha.
const WIDGETS = [
  {
    provider: "turnstile",
    widget: `${TURNSTILE_CONTAINER_SELECTOR}, ${TURNSTILE_IFRAME_SELECTOR}`,
    response: TURNSTILE_RESPONSE_FIELD_SELECTOR,
  },
  {
    provider: "recaptcha",
    widget:
      '.g-recaptcha, iframe[src*="/recaptcha/api2/anchor"], iframe[src*="/recaptcha/api2/bframe"], iframe[src*="/recaptcha/enterprise/anchor"], iframe[src*="/recaptcha/enterprise/bframe"]',
    response: '[name="g-recaptcha-response"]',
  },
  {
    provider: "hcaptcha",
    widget: '.h-captcha, iframe[src*="hcaptcha.com/captcha"]',
    response: '[name="h-captcha-response"]',
  },
] as const

type ObservedVerification = {
  provider: Exclude<
    PageVerificationResult,
    { status: "not_present" }
  >["provider"]
  isPending: () => boolean
}

/** Ignore detached or explicitly hidden verification UI, including ancestors. */
function isShown(element: Element): boolean {
  if (!element.isConnected) return false
  for (let node: Element | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node)
    if (
      node.hasAttribute("hidden") ||
      node.getAttribute("aria-hidden") === "true" ||
      (node.tagName === "DIALOG" && !node.hasAttribute("open")) ||
      style.display === "none" ||
      style.visibility === "hidden"
    )
      return false
  }
  return true
}

const CAPTCHA_HINT = /captcha|verification\s*code|验证码|驗證碼/i

/** Read semantic labels and resource paths without examining entered answers. */
function hasCaptchaHint(element: Element): boolean {
  return CAPTCHA_HINT.test(
    ["alt", "placeholder", "aria-label", "name", "id", "src"]
      .map((attribute) => element.getAttribute(attribute) ?? "")
      .join(" "),
  )
}

const IMAGE_INSTRUCTION =
  /(?:enter|type).{0,40}(?:image|picture|characters)|(?:select|click).{0,70}(?:image|picture|shapes)|(?:drag|slide).{0,60}(?:puzzle|verify|verification)|rotate.{0,40}(?:image|picture)|图形验证码|圖片驗證碼|图片验证码|(?:输入|輸入).{0,15}(?:图|圖|字符)|(?:点选|點選|点击|點擊|拖动|拖動|滑动|滑動|旋转|旋轉).{0,30}(?:图|圖|验证|驗證)/i

/** Require an image resource, drawing surface or image background. */
function hasChallengeSurface(element: Element): boolean {
  return (
    isShown(element) &&
    (element.tagName === "CANVAS" ||
      (element.tagName === "IMG" && !!element.getAttribute("src")) ||
      getComputedStyle(element).backgroundImage.startsWith("url("))
  )
}

/** Find local verification UI without requiring a vendor's CSS naming. */
function observeGenericVerification(): ObservedVerification | undefined {
  const scopes = new Set<Element>()
  for (const surface of document.querySelectorAll(
    "img, canvas, [style*='background']",
  )) {
    if (!hasChallengeSurface(surface)) continue
    let scope = surface.parentElement
    for (
      let depth = 0;
      scope && depth < 4;
      depth++, scope = scope.parentElement
    ) {
      if (scope === document.body || scope === document.documentElement) break
      scopes.add(scope)
      if (scope.matches('[role="dialog"], dialog, form, section')) break
    }
  }
  for (const scope of scopes) {
    if (!isShown(scope)) continue
    const text = (scope.textContent ?? "").slice(0, 2_000)
    const instruction = IMAGE_INSTRUCTION.test(text)
    const surfaces = Array.from(
      scope.querySelectorAll("img, canvas, [style*='background']"),
    ).filter(hasChallengeSurface)
    const visualHint = surfaces.some(hasCaptchaHint)
    const inputs = Array.from(
      scope.querySelectorAll<HTMLInputElement>(
        'input:not([type="hidden"]):not([type="password"]):not([type="email"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea',
      ),
    ).filter((input) => isShown(input) && !input.disabled)
    const answer = inputs.some(
      (input) =>
        hasCaptchaHint(input) ||
        Array.from(input.labels ?? []).some((label) =>
          CAPTCHA_HINT.test(label.textContent ?? ""),
        ) ||
        IMAGE_INSTRUCTION.test(
          input.getAttribute("aria-label") ??
            input.getAttribute("placeholder") ??
            "",
        ),
    )
    if (
      surfaces.length &&
      ((visualHint && answer) ||
        (instruction &&
          inputs.length &&
          (answer || /captcha|图形验证码|图片验证码|圖片驗證碼/i.test(text))))
    ) {
      return { provider: "image", isPending: () => isShown(scope) }
    }
    if (
      surfaces.length &&
      instruction &&
      (/captcha|verif|human|security|人机|人機|验证|驗證/i.test(text) ||
        /(?:select|click).{0,70}(?:matching|in order|shown above)|(?:drag|slide).{0,60}puzzle|rotate.{0,40}(?:upright|correct)|按.{0,8}(?:顺序|順序)|拼图|拼圖/i.test(
          text,
        )) &&
      Array.from(
        scope.querySelectorAll(
          '[role="slider"], input[type="range"], [tabindex], [draggable="true"], button',
        ),
      ).some(isShown)
    ) {
      return { provider: "interactive", isPending: () => isShown(scope) }
    }
  }
  return undefined
}

/** Only visible, interactive vendor widgets can require user intervention. */
function shownVendorWidgets(selector: string): Element[] {
  return Array.from(document.querySelectorAll(selector)).filter(
    (element) =>
      isShown(element) &&
      !element.closest('.grecaptcha-badge, [data-size="invisible"]') &&
      !/[?&]size=invisible\b/i.test(element.getAttribute("src") ?? ""),
  )
}

/** Remember visible vendor UI so unrelated, unchanged widgets are not attributed to a click. */
export function capturePageVerificationWidgets(): ReadonlySet<Element> {
  return new Set(WIDGETS.flatMap((widget) => shownVendorWidgets(widget.widget)))
}

/** Accept tokens only from an unambiguous container of the active widgets. */
function hasActiveWidgetResponse(
  widget: (typeof WIDGETS)[number],
  activeWidgets: Element[],
): boolean {
  return activeWidgets.some((element) => {
    for (
      let scope: Element | null = element;
      scope && scope !== document.body && scope !== document.documentElement;
      scope = scope.parentElement
    ) {
      const fields = Array.from(
        scope.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
          widget.response,
        ),
      )
      if (!fields.length) continue
      const containedWidgets = Array.from(scope.querySelectorAll(widget.widget))
      if (scope.matches(widget.widget)) containedWidgets.push(scope)
      return (
        containedWidgets.every((candidate) =>
          activeWidgets.includes(candidate),
        ) && fields.some((field) => !!field.value?.trim())
      )
    }
    return false
  })
}

/** Prefer explicit widget evidence, then recognize unfamiliar verification UI. */
function observeVerification(
  existingWidgets?: ReadonlySet<Element>,
): ObservedVerification | undefined {
  const widget = WIDGETS.find((candidate) =>
    shownVendorWidgets(candidate.widget).some(
      (element) => !existingWidgets?.has(element),
    ),
  )
  if (widget) {
    const activeWidgets = shownVendorWidgets(widget.widget).filter(
      (element) => !existingWidgets?.has(element),
    )
    return {
      provider: widget.provider,
      isPending: () =>
        !hasActiveWidgetResponse(widget, activeWidgets) &&
        activeWidgets.some(isShown),
    }
  }

  // Recognizable interactive captcha containers must also have a rendered
  // challenge surface; an empty/loading/error container is insufficient.
  for (const panel of document.querySelectorAll(
    ".captcha-panel, .geetest_panel, .geetest_holder",
  )) {
    if (!isShown(panel)) continue
    const surface = Array.from(
      panel.querySelectorAll("img, canvas, .gc-picture"),
    ).find((element) => hasChallengeSurface(element))
    if (surface)
      return {
        provider: "interactive",
        isPending: () => isShown(panel),
      }
  }

  // Require both the challenge image and its answer field in the same UI.
  // A loaded script, dialog title or error message alone is not evidence.
  for (const scope of document.querySelectorAll(
    '[role="dialog"], dialog, form, [class*="captcha"], [id*="captcha"]',
  )) {
    if (!isShown(scope)) continue
    const images = () =>
      Array.from(scope.querySelectorAll("img")).filter(
        (element) => isShown(element) && hasCaptchaHint(element),
      )
    const inputs = () =>
      Array.from(
        scope.querySelectorAll(
          'input:not([type="hidden"]):not([type="password"]), textarea',
        ),
      ).filter((element) => isShown(element) && hasCaptchaHint(element))
    if (images().length && inputs().length)
      return {
        provider: "image",
        // Typing is not verification. Let the native page submit the answer.
        isPending: () =>
          isShown(scope) && !!(images().length || inputs().length),
      }
  }
  return observeGenericVerification()
}

/** Observes native-page verification; the page owns submission and token use. */
export async function waitForPageVerification(params: {
  requestId?: string
  existingWidgets?: ReadonlySet<Element>
  requestAssist: () => Promise<unknown> | unknown
}): Promise<PageVerificationResult> {
  const appearanceDeadline = Date.now() + APPEARANCE_WAIT_MS
  let observed: ObservedVerification | undefined
  while (Date.now() <= appearanceDeadline) {
    observed = observeVerification(params.existingWidgets)
    if (observed) break
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
  if (!observed) return { status: "not_present" }

  const provider = observed.provider
  const autoDeadline = Date.now() + TURNSTILE_AUTO_ASSIST_MS
  let deadline = autoDeadline
  let assistPendingUntil = 0
  let assistRequested = false
  const manualWindow = createVerificationManualWindow(params.requestId)

  try {
    // A real timer can wake after the automatic deadline; still admit the one
    // assist attempt before deciding that the wait has expired.
    while (
      !assistRequested ||
      Date.now() <=
        Math.max(deadline, assistPendingUntil, manualWindow.getDeadline())
    ) {
      if (!observed.isPending()) {
        // Disappearance is only a cue to read back status, never proof of success.
        return { status: "completed", provider }
      }

      if (!assistRequested && Date.now() >= autoDeadline) {
        assistRequested = true
        assistPendingUntil = Date.now() + TURNSTILE_ASSIST_TURN_WAIT_MS
        void Promise.resolve()
          .then(() => params.requestAssist())
          .then(
            (accepted) => accepted !== false,
            () => false,
          )
          .then((accepted) => {
            assistPendingUntil = 0
            if (accepted) deadline = Date.now() + TURNSTILE_MANUAL_WAIT_MS
          })
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }

    return { status: "required", provider }
  } finally {
    manualWindow.dispose()
  }
}
