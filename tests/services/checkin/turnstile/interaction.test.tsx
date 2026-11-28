import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { TURNSTILE_MESSAGE_EVENTS } from "~/constants/turnstile"
import {
  observeTurnstileInteraction,
  VERIFICATION_INTERACTION_STATES,
} from "~/services/checkin/turnstile/interaction"
import { emitTurnstileEvent } from "~~/tests/test-utils/turnstile"

describe("Turnstile interaction observation", () => {
  let interaction: ReturnType<typeof observeTurnstileInteraction>

  beforeEach(() => {
    document.body.innerHTML =
      '<div class="cf-turnstile"><iframe id="cf-chl-widget-active" src="https://challenges.cloudflare.com/turnstile/widget"></iframe></div>'
    interaction = observeTurnstileInteraction()
  })

  afterEach(() => {
    interaction.dispose()
    document.body.innerHTML = ""
  })

  it("retains an interaction request across an unrecognized message", () => {
    const frame = document.querySelector("iframe")!
    emitTurnstileEvent(frame, TURNSTILE_MESSAGE_EVENTS.InteractiveBegin)
    emitTurnstileEvent(frame, "future-message")
    expect(interaction.read()).toBe(VERIFICATION_INTERACTION_STATES.Required)
  })

  it.each([
    TURNSTILE_MESSAGE_EVENTS.Fail,
    TURNSTILE_MESSAGE_EVENTS.Reject,
    TURNSTILE_MESSAGE_EVENTS.TokenExpired,
    TURNSTILE_MESSAGE_EVENTS.InteractiveTimeout,
  ])(
    "restores unknown state after %s without treating failure as interaction",
    (event) => {
      const frame = document.querySelector("iframe")!
      emitTurnstileEvent(frame, TURNSTILE_MESSAGE_EVENTS.InteractiveBegin)
      emitTurnstileEvent(frame, event)
      expect(interaction.read()).toBe(VERIFICATION_INTERACTION_STATES.Unknown)
    },
  )

  it("scopes progress to selected widgets and ignores detached interaction requests", () => {
    const active = document.querySelector("iframe")!
    const other = document.createElement("iframe")
    other.id = "cf-chl-widget-other"
    other.src = "https://challenges.cloudflare.com/turnstile/other"
    document.body.append(other)
    emitTurnstileEvent(active, TURNSTILE_MESSAGE_EVENTS.Init)
    emitTurnstileEvent(
      other,
      TURNSTILE_MESSAGE_EVENTS.InteractiveBegin,
      "other",
    )

    expect(interaction.read()).toBe(VERIFICATION_INTERACTION_STATES.Required)
    expect(interaction.read([active])).toBe(
      VERIFICATION_INTERACTION_STATES.Verifying,
    )
    other.remove()
    expect(interaction.read()).toBe(VERIFICATION_INTERACTION_STATES.Verifying)
  })

  it("associates a hidden response field with its frame and enclosing widget", () => {
    const frame = document.querySelector("iframe")!
    const container = document.querySelector("div")!
    container.insertAdjacentHTML(
      "beforeend",
      '<input type="hidden" id="cf-chl-widget-active_response">',
    )
    // A child source can be observed before its frame becomes queryable by ID.
    frame.id = ""
    emitTurnstileEvent(frame, TURNSTILE_MESSAGE_EVENTS.Init)
    frame.id = "cf-chl-widget-active"

    expect(interaction.read([container])).toBe(
      VERIFICATION_INTERACTION_STATES.Verifying,
    )
    expect(interaction.read([frame])).toBe(
      VERIFICATION_INTERACTION_STATES.Verifying,
    )
  })

  it("leaves unobserved widgets unknown even when another widget is verifying", () => {
    emitTurnstileEvent(
      document.querySelector("iframe")!,
      TURNSTILE_MESSAGE_EVENTS.Init,
    )
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div class="cf-turnstile"></div>',
    )
    expect(interaction.read()).toBe(VERIFICATION_INTERACTION_STATES.Unknown)
  })

  it("stops accepting widget messages after disposal", () => {
    const frame = document.querySelector("iframe")!
    emitTurnstileEvent(frame, TURNSTILE_MESSAGE_EVENTS.Init)
    interaction.dispose()
    emitTurnstileEvent(frame, TURNSTILE_MESSAGE_EVENTS.InteractiveBegin)
    expect(interaction.read()).toBe(VERIFICATION_INTERACTION_STATES.Verifying)
  })
})
