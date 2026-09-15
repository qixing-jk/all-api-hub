import { beforeEach, describe, expect, it } from "vitest"

import { runBrowserCheckInStep } from "~/entrypoints/content/messageHandlers/utils/browserCheckIn"
import {
  BROWSER_CHECK_IN_ACTION_KINDS,
  BROWSER_CHECK_IN_STEP_REASONS,
} from "~/types/checkinAutomation"

const successByText = { textPattern: "check-in complete" }

beforeEach(() => {
  document.body.innerHTML = ""
  globalThis.__aahBrowserCheckInActionState?.clear()
})

describe("runBrowserCheckInStep", () => {
  it("reports a configured success condition without clicking anything", () => {
    document.body.innerHTML = '<p class="status">Check-in complete</p>'
    const button = document.createElement("button")
    button.textContent = "Check in"
    button.addEventListener("click", () => {
      throw new Error("success observation must not click")
    })
    document.body.append(button)

    expect(
      runBrowserCheckInStep({
        action: {
          kind: BROWSER_CHECK_IN_ACTION_KINDS.ClickSelector,
          selector: "button",
        },
        success: successByText,
        executeAction: true,
      }),
    ).toMatchObject({
      success: true,
      reason: BROWSER_CHECK_IN_STEP_REASONS.Completed,
      actionTriggered: false,
      matchedCondition: "text",
    })
  })

  it("does not match success text that only appears in inline script source", () => {
    document.body.innerHTML = `
      <button id="check-in">Check in</button>
      <script>const successMessage = "Check-in complete"</script>
    `

    expect(
      runBrowserCheckInStep({
        action: {
          kind: BROWSER_CHECK_IN_ACTION_KINDS.ClickSelector,
          selector: "#check-in",
        },
        success: successByText,
        executeAction: true,
      }),
    ).toMatchObject({
      success: false,
      reason: BROWSER_CHECK_IN_STEP_REASONS.ActionTriggered,
      actionTriggered: true,
    })
  })

  it("clicks only the configured selector and waits for a later success observation", () => {
    document.body.innerHTML = '<button id="check-in">Check in</button>'
    const target = document.querySelector("#check-in") as HTMLButtonElement
    let clicks = 0
    target.addEventListener("click", () => {
      clicks += 1
    })

    const first = runBrowserCheckInStep({
      requestId: "browser-checkin-1",
      action: {
        kind: BROWSER_CHECK_IN_ACTION_KINDS.ClickSelector,
        selector: "#check-in",
      },
      success: successByText,
      executeAction: true,
    })
    const retry = runBrowserCheckInStep({
      requestId: "browser-checkin-1",
      action: {
        kind: BROWSER_CHECK_IN_ACTION_KINDS.ClickSelector,
        selector: "#check-in",
      },
      success: successByText,
      executeAction: true,
    })

    expect(first).toMatchObject({
      success: false,
      reason: BROWSER_CHECK_IN_STEP_REASONS.ActionTriggered,
      actionTriggered: true,
    })
    expect(retry).toMatchObject({
      success: false,
      reason: BROWSER_CHECK_IN_STEP_REASONS.Pending,
      actionTriggered: true,
    })
    expect(clicks).toBe(1)
  })

  it("waits for a logged-in identity and rejects a different identity", () => {
    document.body.innerHTML = '<div class="account">other@example.com</div>'
    const input = {
      action: { kind: BROWSER_CHECK_IN_ACTION_KINDS.PageLoad } as const,
      success: successByText,
      identity: {
        selector: ".account",
        textPattern: "target@example.com",
      },
      executeAction: false,
    }

    expect(runBrowserCheckInStep(input)).toMatchObject({
      success: false,
      reason: BROWSER_CHECK_IN_STEP_REASONS.IdentityMismatch,
    })

    document.body.innerHTML = ""
    expect(runBrowserCheckInStep(input)).toMatchObject({
      success: false,
      reason: BROWSER_CHECK_IN_STEP_REASONS.IdentityMissing,
    })
  })

  it("supports URL success evidence and rejects malformed selectors", () => {
    window.history.replaceState({}, "", "/check-in/success")
    expect(
      runBrowserCheckInStep({
        action: { kind: BROWSER_CHECK_IN_ACTION_KINDS.PageLoad },
        success: { urlPattern: "/check-in/success$" },
        executeAction: false,
      }),
    ).toMatchObject({
      success: true,
      matchedCondition: "url",
    })

    expect(
      runBrowserCheckInStep({
        action: {
          kind: BROWSER_CHECK_IN_ACTION_KINDS.ClickSelector,
          selector: "[",
        },
        success: successByText,
        executeAction: true,
      }),
    ).toMatchObject({
      success: false,
      reason: BROWSER_CHECK_IN_STEP_REASONS.InvalidRequest,
    })
  })
})
