import type { CDPSession, ChromiumBrowser } from "@playwright/test"

import { POPUP_PAGE_PATH } from "~/constants/extensionPages"
import {
  ACCOUNT_MANAGEMENT_TEST_IDS,
  getAccountManagementSiteTypeOptionTestId,
} from "~/features/AccountManagement/testIds"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { stubLlmMetadataIndex } from "~~/e2e/utils/commonUserFlows"
import { getExtensionServiceWorker } from "~~/e2e/utils/extension"

type CdpTargetInfo = {
  targetId: string
  url: string
}

type CdpCommandResult = Record<string, unknown>

async function attachToActionPopup(
  session: CDPSession,
  popupUrl: string,
): Promise<string> {
  const deadline = Date.now() + 10_000

  while (Date.now() <= deadline) {
    const { targetInfos } = await session.send("Target.getTargets")
    const popupTarget = (targetInfos as CdpTargetInfo[]).find(
      (target) => target.url === popupUrl,
    )

    if (popupTarget) {
      const { sessionId } = await session.send("Target.attachToTarget", {
        flatten: false,
        targetId: popupTarget.targetId,
      })
      return sessionId as string
    }

    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  throw new Error(`Timed out waiting for action popup target '${popupUrl}'`)
}

function createTargetCommandSender(
  session: CDPSession,
  sessionId: string,
): (
  method: string,
  params?: Record<string, unknown>,
) => Promise<CdpCommandResult> {
  let nextId = 0

  return async (method, params = {}) => {
    nextId += 1
    const commandId = nextId
    let handleMessage:
      | ((event: { message: string; sessionId: string }) => void)
      | undefined
    let handleDetach: ((event: { sessionId: string }) => void) | undefined
    let rejectResponse: ((reason?: unknown) => void) | undefined
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const response = new Promise<CdpCommandResult>((resolve, reject) => {
      rejectResponse = reject
      handleMessage = (event) => {
        if (event.sessionId !== sessionId) return

        const message = JSON.parse(event.message) as {
          id?: number
          error?: { message: string }
          result?: CdpCommandResult
        }
        if (message.id !== commandId) return

        if (message.error) {
          reject(new Error(message.error.message))
        } else {
          resolve(message.result ?? {})
        }
      }
      handleDetach = (event) => {
        if (event.sessionId !== sessionId) return
        reject(new Error(`Action popup target detached during CDP '${method}'`))
      }
      timeoutId = setTimeout(() => {
        reject(new Error(`Timed out waiting for CDP '${method}'`))
      }, 10_000)

      session.on("Target.receivedMessageFromTarget", handleMessage)
      session.on("Target.detachedFromTarget", handleDetach)
    })

    void session
      .send("Target.sendMessageToTarget", {
        message: JSON.stringify({ id: commandId, method, params }),
        sessionId,
      })
      .catch((error) => rejectResponse?.(error))

    try {
      return await response
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId)
      if (handleMessage) {
        session.off("Target.receivedMessageFromTarget", handleMessage)
      }
      if (handleDetach) {
        session.off("Target.detachedFromTarget", handleDetach)
      }
    }
  }
}

async function evaluateInTarget<T>(
  send: ReturnType<typeof createTargetCommandSender>,
  expression: string,
): Promise<T> {
  const response = await send("Runtime.evaluate", {
    awaitPromise: true,
    expression,
    returnByValue: true,
  })
  const exceptionDetails = response["exceptionDetails"] as
    | { text?: string }
    | undefined
  if (exceptionDetails) {
    throw new Error(exceptionDetails.text ?? "Action popup evaluation failed")
  }

  const result = response["result"] as { value?: T } | undefined
  return result?.value as T
}

async function waitForTargetCondition(
  send: ReturnType<typeof createTargetCommandSender>,
  expression: string,
): Promise<void> {
  const deadline = Date.now() + 10_000

  while (Date.now() <= deadline) {
    if (await evaluateInTarget<boolean>(send, expression)) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  throw new Error(`Timed out waiting for action popup condition: ${expression}`)
}

async function clickTargetElement(
  send: ReturnType<typeof createTargetCommandSender>,
  elementExpression: string,
): Promise<void> {
  await evaluateInTarget(
    send,
    `(() => {
      const element = ${elementExpression}
      if (!(element instanceof HTMLElement)) {
        throw new Error('Target element is not available for pointer input')
      }

      const pointerDefaults = {
        bubbles: true,
        button: 0,
        cancelable: true,
        composed: true,
        isPrimary: true,
        pointerId: 1,
        pointerType: 'mouse',
      }
      element.dispatchEvent(new PointerEvent('pointerdown', {
        ...pointerDefaults,
        buttons: 1,
      }))
      element.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        button: 0,
        buttons: 1,
        cancelable: true,
        composed: true,
      }))
      element.dispatchEvent(new PointerEvent('pointerup', pointerDefaults))
      element.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true,
        button: 0,
        cancelable: true,
        composed: true,
      }))
      element.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        button: 0,
        cancelable: true,
        composed: true,
        detail: 1,
      }))
    })()`,
  )
}

const POPUP_ZOOM_PERCENTAGES = [80, 90, 100, 110, 125, 150, 175, 200]

test.beforeEach(async ({ context }) => {
  await stubLlmMetadataIndex(context)
})

for (const zoomPercentage of POPUP_ZOOM_PERCENTAGES) {
  test(`keeps the action popup select stable at ${zoomPercentage}% zoom`, async ({
    context,
    extensionId,
  }) => {
    const zoomFactor = zoomPercentage / 100
    const serviceWorker = await getExtensionServiceWorker(context)
    const browser = context.browser() as ChromiumBrowser
    const browserSession = await browser.newBrowserCDPSession()
    const popupUrl = `chrome-extension://${extensionId}/${POPUP_PAGE_PATH}`

    const appliedZoom = await serviceWorker.evaluate(async (factor) => {
      const [activeTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      })
      if (activeTab?.id === undefined) {
        throw new Error("No active tab is available for popup zoom testing")
      }

      await chrome.tabs.setZoom(activeTab.id, factor)
      await chrome.action.openPopup({ windowId: activeTab.windowId })
      return await chrome.tabs.getZoom(activeTab.id)
    }, zoomFactor)
    expect(appliedZoom).toBeCloseTo(zoomFactor)

    const popupSessionId = await attachToActionPopup(browserSession, popupUrl)
    const send = createTargetCommandSender(browserSession, popupSessionId)
    await send("Runtime.enable")
    await waitForTargetCondition(
      send,
      `Boolean(document.querySelector('[data-testid="${ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton}"]'))`,
    )

    await clickTargetElement(
      send,
      `document.querySelector('[data-testid="${ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton}"]')`,
    )
    await waitForTargetCondition(
      send,
      `Boolean(document.querySelector('[data-testid="${ACCOUNT_MANAGEMENT_TEST_IDS.siteUrlInput}"]'))`,
    )
    await evaluateInTarget(
      send,
      `(() => {
        const input = document.querySelector('[data-testid="${ACCOUNT_MANAGEMENT_TEST_IDS.siteUrlInput}"]')
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        setter.call(input, 'https://account.example.invalid')
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })()`,
    )
    await waitForTargetCondition(
      send,
      `!document.querySelector('[data-testid="${ACCOUNT_MANAGEMENT_TEST_IDS.manualAddButton}"]').disabled`,
    )
    await clickTargetElement(
      send,
      `document.querySelector('[data-testid="${ACCOUNT_MANAGEMENT_TEST_IDS.manualAddButton}"]')`,
    )
    await waitForTargetCondition(
      send,
      `Boolean(document.querySelector('[data-testid="${ACCOUNT_MANAGEMENT_TEST_IDS.siteTypeTrigger}"]'))`,
    )

    await evaluateInTarget(
      send,
      `(() => {
        const formSection = document.querySelector('[data-testid="${ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionSiteInfo}"]')
        window.__aahActionPopupFormSection = formSection
        window.__aahActionPopupFormLayout = formSection?.getAttribute('data-layout')
        window.__aahActionPopupResizeCount = 0
        window.__aahActionPopupSizes = [window.innerWidth + 'x' + window.innerHeight]
        window.addEventListener('resize', () => {
          window.__aahActionPopupResizeCount += 1
          window.__aahActionPopupSizes.push(window.innerWidth + 'x' + window.innerHeight)
        }, { capture: true })
      })()`,
    )
    await clickTargetElement(
      send,
      `document.querySelector('[data-testid="${ACCOUNT_MANAGEMENT_TEST_IDS.siteTypeTrigger}"]')`,
    )
    await waitForTargetCondition(
      send,
      `Boolean(document.querySelector('[role="listbox"]'))`,
    )

    const observedNativeResize = await evaluateInTarget<boolean>(
      send,
      `new Promise(resolve => {
        if ((window.__aahActionPopupResizeCount ?? 0) > 0) {
          resolve(true)
          return
        }

        const handleResize = () => {
          clearTimeout(timeoutId)
          resolve(true)
        }
        const timeoutId = setTimeout(() => {
          window.removeEventListener('resize', handleResize, true)
          resolve(false)
        }, 750)
        window.addEventListener('resize', handleResize, {
          capture: true,
          once: true,
        })
      })`,
    )
    if (!observedNativeResize) {
      await evaluateInTarget(send, "window.dispatchEvent(new Event('resize'))")
    }
    await evaluateInTarget(
      send,
      `new Promise(resolve => {
        let quietTimeoutId
        const hardTimeoutId = setTimeout(finish, 1500)

        function finish() {
          clearTimeout(quietTimeoutId)
          clearTimeout(hardTimeoutId)
          window.removeEventListener('resize', scheduleFinish, true)
          resolve()
        }

        function scheduleFinish() {
          clearTimeout(quietTimeoutId)
          quietTimeoutId = setTimeout(finish, 250)
        }

        window.addEventListener('resize', scheduleFinish, true)
        scheduleFinish()
      })`,
    )

    const popupState = await evaluateInTarget<{
      bodyOverflowing: boolean
      contentHeight: number
      contentWidth: number
      documentOverflowing: boolean
      formLayout: string | null
      formLayoutStable: boolean
      formSectionPreserved: boolean
      innerHeight: number
      innerWidth: number
      listboxPresent: boolean
      sizes: string[]
    }>(
      send,
      `({
        bodyOverflowing:
          document.body.scrollWidth > document.body.clientWidth ||
          document.body.scrollHeight > document.body.clientHeight,
        contentHeight: document.querySelector('#root')?.firstElementChild?.getBoundingClientRect().height,
        contentWidth: document.querySelector('#root')?.firstElementChild?.getBoundingClientRect().width,
        documentOverflowing:
          document.documentElement.scrollWidth > document.documentElement.clientWidth ||
          document.documentElement.scrollHeight > document.documentElement.clientHeight,
        formLayout:
          document.querySelector('[data-testid="${ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionSiteInfo}"]')?.getAttribute('data-layout') ?? null,
        formLayoutStable:
          window.__aahActionPopupFormLayout ===
          document.querySelector('[data-testid="${ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionSiteInfo}"]')?.getAttribute('data-layout'),
        formSectionPreserved:
          window.__aahActionPopupFormSection ===
          document.querySelector('[data-testid="${ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionSiteInfo}"]'),
        innerHeight: window.innerHeight,
        innerWidth: window.innerWidth,
        listboxPresent: Boolean(document.querySelector('[role="listbox"]')),
        sizes: [...new Set(window.__aahActionPopupSizes)],
      })`,
    )
    expect(popupState.listboxPresent).toBe(true)
    expect(popupState.sizes).toHaveLength(1)
    expect(popupState.documentOverflowing).toBe(false)
    expect(popupState.bodyOverflowing).toBe(false)
    expect(popupState.formLayout).toBe("mobile-collapsible")
    expect(popupState.formLayoutStable).toBe(true)
    expect(popupState.formSectionPreserved).toBe(true)
    expect(popupState.innerWidth).toBeGreaterThanOrEqual(200)
    expect(popupState.innerHeight).toBeGreaterThanOrEqual(200)
    expect(popupState.contentWidth).toBeCloseTo(popupState.innerWidth, 0)
    expect(popupState.contentHeight).toBeCloseTo(popupState.innerHeight, 0)

    await evaluateInTarget(
      send,
      `(() => {
        const option = document.querySelector('[data-testid="${getAccountManagementSiteTypeOptionTestId("new-api")}"]')
        if (!option) throw new Error('new-api option was not rendered')
        option.dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true,
          button: 0,
          pointerType: 'mouse',
        }))
        option.dispatchEvent(new PointerEvent('pointerup', {
          bubbles: true,
          button: 0,
          pointerType: 'mouse',
        }))
      })()`,
    )
    await waitForTargetCondition(
      send,
      `document.querySelector('[data-testid="${ACCOUNT_MANAGEMENT_TEST_IDS.siteTypeTrigger}"]')
        ?.getAttribute('data-site-type') === 'new-api'`,
    )
    await waitForTargetCondition(
      send,
      `!document.querySelector('[role="listbox"]')`,
    )
  })
}
