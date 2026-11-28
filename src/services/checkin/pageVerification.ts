import {
  TURNSTILE_ASSIST_TURN_WAIT_MS,
  TURNSTILE_CONTAINER_SELECTOR,
  TURNSTILE_DEFAULT_WAIT_TIMEOUT_MS,
  TURNSTILE_IFRAME_SELECTOR,
  TURNSTILE_RESPONSE_FIELD_SELECTOR,
  VERIFICATION_AUTO_WAIT_MS,
  VERIFICATION_REMINDER_WAIT_MS,
} from "~/constants/turnstile"
import { isCheckInElementShown } from "~/services/checkin/discovery/evidence/visibility"
import {
  PAGE_VERIFICATION_PROVIDERS,
  PAGE_VERIFICATION_STATUSES,
  type PageVerificationResult,
} from "~/types/turnstile"

import {
  observeTurnstileInteraction,
  shouldRequestVerificationAssist,
  VERIFICATION_INTERACTION_STATES,
  type VerificationInteractionState,
} from "./turnstile/interaction"
import { createVerificationManualWindow } from "./verificationManualWindow"

const APPEARANCE_WAIT_MS = 2_000
const POLL_INTERVAL_MS = 250
const ALTCHA_STATES = {
  Unverified: "unverified",
  Verifying: "verifying",
  Verified: "verified",
} as const

// Scripts and page text alone do not establish that this action needs a captcha.
const WIDGETS = [
  {
    provider: PAGE_VERIFICATION_PROVIDERS.Turnstile,
    widget: `${TURNSTILE_CONTAINER_SELECTOR}, ${TURNSTILE_IFRAME_SELECTOR}`,
    response: TURNSTILE_RESPONSE_FIELD_SELECTOR,
  },
  {
    provider: PAGE_VERIFICATION_PROVIDERS.Recaptcha,
    widget:
      '.g-recaptcha, iframe[src*="/recaptcha/api2/anchor"], iframe[src*="/recaptcha/api2/bframe"], iframe[src*="/recaptcha/enterprise/anchor"], iframe[src*="/recaptcha/enterprise/bframe"]',
    response: '[name="g-recaptcha-response"]',
  },
  {
    provider: PAGE_VERIFICATION_PROVIDERS.Hcaptcha,
    widget: '.h-captcha, iframe[src*="hcaptcha.com/captcha"]',
    response: '[name="h-captcha-response"]',
  },
] as const

type ObservedVerification = {
  provider: Exclude<
    PageVerificationResult,
    { status: typeof PAGE_VERIFICATION_STATUSES.NotPresent }
  >["provider"]
  isPending: () => boolean
  interactionState?: () => VerificationInteractionState
  tryAutoVerify?: () => void
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
    isCheckInElementShown(element) &&
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
    if (!isCheckInElementShown(scope)) continue
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
    ).filter((input) => isCheckInElementShown(input) && !input.disabled)
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
      return {
        provider: PAGE_VERIFICATION_PROVIDERS.Image,
        isPending: () => isCheckInElementShown(scope),
      }
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
      ).some(isCheckInElementShown)
    ) {
      return {
        provider: PAGE_VERIFICATION_PROVIDERS.Interactive,
        isPending: () => isCheckInElementShown(scope),
      }
    }
  }
  return undefined
}

/** Only visible, interactive vendor widgets can require user intervention. */
function shownVendorWidgets(selector: string): Element[] {
  return Array.from(document.querySelectorAll(selector)).filter(
    (element) =>
      isCheckInElementShown(element) &&
      !element.closest('.grecaptcha-badge, [data-size="invisible"]') &&
      !/[?&]size=invisible\b/i.test(element.getAttribute("src") ?? ""),
  )
}

const VERIFICATION_DIALOG_SELECTOR = 'dialog, [role="dialog"]'

/** Hidden response fields in visible dialogs can identify widgets outside the light DOM. */
function shownTurnstileDialogFields(
  root: ParentNode = document,
): HTMLInputElement[] {
  return Array.from(
    root.querySelectorAll<HTMLInputElement>(
      `input[type="hidden"]${TURNSTILE_RESPONSE_FIELD_SELECTOR}`,
    ),
  ).filter((field) => {
    const dialog = field.closest(VERIFICATION_DIALOG_SELECTOR)
    return (
      dialog &&
      field.parentElement &&
      isCheckInElementShown(field.parentElement) &&
      !field.closest('[data-size="invisible"]')
    )
  })
}

/** Remember visible vendor UI so unrelated, unchanged widgets are not attributed to a click. */
export function capturePageVerificationWidgets(): ReadonlySet<Element> {
  return new Set([
    ...WIDGETS.flatMap((widget) => shownVendorWidgets(widget.widget)),
    ...shownVendorWidgets("altcha-widget"),
    ...shownTurnstileDialogFields(),
  ])
}

/** Let ALTCHA's own checkbox run its PoW and native callback, without exporting proof. */
function observeAltcha(
  existingWidgets?: ReadonlySet<Element>,
): ObservedVerification | undefined {
  const currentWidgets = () =>
    shownVendorWidgets("altcha-widget").filter(
      (element) => !existingWidgets?.has(element),
    )
  if (!currentWidgets().length) return undefined
  let activated = false
  const root = (element: Element) => element.shadowRoot ?? element
  const state = (element: Element) =>
    root(element)
      .querySelector(".altcha[data-state]")
      ?.getAttribute("data-state")
  return {
    provider: PAGE_VERIFICATION_PROVIDERS.Altcha,
    isPending: () =>
      currentWidgets().some(
        (element) => state(element) !== ALTCHA_STATES.Verified,
      ),
    interactionState: () => {
      const pending = currentWidgets()
        .map(state)
        .filter((value) => value !== ALTCHA_STATES.Verified)
      return pending.length &&
        pending.every((value) => value === ALTCHA_STATES.Verifying)
        ? VERIFICATION_INTERACTION_STATES.Verifying
        : VERIFICATION_INTERACTION_STATES.Unknown
    },
    tryAutoVerify: () => {
      // Multiple new challenges cannot be attributed to one native action.
      // Leave their completion to the existing manual-assistance path.
      const widgets = currentWidgets()
      if (activated || widgets.length !== 1) return
      const element = widgets[0]!
      if (state(element) !== ALTCHA_STATES.Unverified) return
      const checkbox = root(element).querySelector<HTMLInputElement>(
        'input[type="checkbox"]',
      )
      if (
        !checkbox ||
        checkbox.disabled ||
        checkbox.checked ||
        !isCheckInElementShown(checkbox)
      )
        return
      // Native callbacks may replace the widget; that must not authorize replay.
      activated = true
      checkbox.click()
    },
  }
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
  interaction?: ReturnType<typeof observeTurnstileInteraction>,
): ObservedVerification | undefined {
  const altcha = observeAltcha(existingWidgets)
  if (altcha) return altcha
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
        activeWidgets.some(isCheckInElementShown),
      interactionState: () =>
        widget.provider === PAGE_VERIFICATION_PROVIDERS.Turnstile
          ? (interaction?.read(activeWidgets) ??
            VERIFICATION_INTERACTION_STATES.Unknown)
          : VERIFICATION_INTERACTION_STATES.Unknown,
    }
  }

  // Recognizable interactive captcha containers must also have a rendered
  // challenge surface; an empty/loading/error container is insufficient.
  for (const panel of document.querySelectorAll(
    ".captcha-panel, .geetest_panel, .geetest_holder",
  )) {
    if (!isCheckInElementShown(panel)) continue
    const surface = Array.from(
      panel.querySelectorAll("img, canvas, .gc-picture"),
    ).find((element) => hasChallengeSurface(element))
    if (surface)
      return {
        provider: PAGE_VERIFICATION_PROVIDERS.Interactive,
        isPending: () => isCheckInElementShown(panel),
      }
  }

  // Require both the challenge image and its answer field in the same UI.
  // A loaded script, dialog title or error message alone is not evidence.
  for (const scope of document.querySelectorAll(
    '[role="dialog"], dialog, form, [class*="captcha"], [id*="captcha"]',
  )) {
    if (!isCheckInElementShown(scope)) continue
    const images = () =>
      Array.from(scope.querySelectorAll("img")).filter(
        (element) => isCheckInElementShown(element) && hasCaptchaHint(element),
      )
    const inputs = () =>
      Array.from(
        scope.querySelectorAll(
          'input:not([type="hidden"]):not([type="password"]), textarea',
        ),
      ).filter(
        (element) => isCheckInElementShown(element) && hasCaptchaHint(element),
      )
    if (images().length && inputs().length)
      return {
        provider: PAGE_VERIFICATION_PROVIDERS.Image,
        // Typing is not verification. Let the native page submit the answer.
        isPending: () =>
          isCheckInElementShown(scope) &&
          !!(images().length || inputs().length),
      }
  }
  const generic = observeGenericVerification()
  if (generic || !existingWidgets) return generic

  const newFields = shownTurnstileDialogFields().filter(
    (field) => !existingWidgets.has(field),
  )
  const dialog =
    newFields.length === 1 &&
    newFields[0]?.closest(VERIFICATION_DIALOG_SELECTOR)
  if (!dialog) return undefined
  return {
    provider: PAGE_VERIFICATION_PROVIDERS.Turnstile,
    // The site owns submission. A response or closed dialog only ends this wait.
    isPending: () =>
      shownTurnstileDialogFields(dialog).some(
        (field) =>
          field.closest(VERIFICATION_DIALOG_SELECTOR) === dialog &&
          !existingWidgets.has(field) &&
          !field.value.trim(),
      ),
    interactionState: () =>
      interaction?.read(newFields) ?? VERIFICATION_INTERACTION_STATES.Unknown,
  }
}

/** Whether the current native page exposes verification that must not be bypassed. */
export function hasPageVerification(): boolean {
  return Boolean(observeVerification())
}

/** Observes native-page verification; the page owns submission and token use. */
export async function waitForPageVerification(params: {
  requestId?: string
  existingWidgets?: ReadonlySet<Element>
  requestAssist: () => Promise<unknown> | unknown
}): Promise<PageVerificationResult> {
  const interaction = observeTurnstileInteraction()
  const manualWindow = createVerificationManualWindow(params.requestId)
  try {
    const appearanceDeadline = Date.now() + APPEARANCE_WAIT_MS
    let observed: ObservedVerification | undefined
    while (Date.now() <= appearanceDeadline) {
      observed = observeVerification(params.existingWidgets, interaction)
      if (observed) break
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }
    if (!observed) return { status: PAGE_VERIFICATION_STATUSES.NotPresent }

    const provider = observed.provider
    const startedAt = Date.now()
    const autoDeadline = startedAt + TURNSTILE_DEFAULT_WAIT_TIMEOUT_MS
    let deadline = autoDeadline
    let assistPendingUntil = 0
    let assistRequested = false
    // Sample state once more after a timer wakes at or beyond the deadline.
    while (true) {
      if (!observed.isPending()) {
        // Disappearance is only a cue to read back status, never proof of success.
        return { status: PAGE_VERIFICATION_STATUSES.Completed, provider }
      }

      observed.tryAutoVerify?.()

      const state =
        observed.interactionState?.() ?? VERIFICATION_INTERACTION_STATES.Unknown
      if (state === VERIFICATION_INTERACTION_STATES.Verifying) {
        deadline = Math.max(deadline, startedAt + VERIFICATION_AUTO_WAIT_MS)
      }
      if (
        !assistRequested &&
        shouldRequestVerificationAssist(state, autoDeadline)
      ) {
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
            if (accepted) deadline = Date.now() + VERIFICATION_REMINDER_WAIT_MS
          })
      }
      if (
        Date.now() >=
        manualWindow.getDeadline(Math.max(deadline, assistPendingUntil))
      )
        break
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }

    return { status: PAGE_VERIFICATION_STATUSES.Required, provider }
  } finally {
    interaction.dispose()
    manualWindow.dispose()
  }
}
