import type { BrowserContext, Worker } from "@playwright/test"
import { expect } from "@playwright/test"

import {
  createTargetCommandSender,
  evaluateInTarget,
} from "~~/e2e/utils/cdpTarget"

/**
 * Evaluate callbacks with JSON arguments in the current extension worker.
 * Native permission reloads can replace its execution context without replacing
 * Playwright's Worker object on older Chrome. A fresh CDP attachment evaluates in
 * the target's current default context instead of retaining the destroyed one.
 */
export async function createExtensionWorkerEvaluator(
  context: BrowserContext,
  extensionId: string,
): Promise<Pick<Worker, "evaluate">> {
  const browser = context.browser()
  if (!browser) throw new Error("Extension worker evaluation requires Chromium")

  const evaluate: Worker["evaluate"] = async (
    callback: string | ((arg: any) => any),
    arg?: any,
  ) => {
    const session = await browser.newBrowserCDPSession()
    let targetSessionId: string | undefined
    try {
      const { targetInfos } = await session.send("Target.getTargets")
      const target = targetInfos.find(
        (entry) =>
          entry.type === "service_worker" &&
          entry.url.startsWith(`chrome-extension://${extensionId}/`),
      )
      if (!target) throw new Error("Extension worker target is unavailable")
      const attached = await session.send("Target.attachToTarget", {
        targetId: target.targetId,
        flatten: false,
      })
      targetSessionId = attached.sessionId
      const send = createTargetCommandSender(session, targetSessionId)
      return await evaluateInTarget<any>(
        send,
        typeof callback === "string"
          ? callback
          : `(${callback.toString()})(${JSON.stringify(arg) ?? "undefined"})`,
      )
    } finally {
      if (targetSessionId) {
        await session
          .send("Target.detachFromTarget", { sessionId: targetSessionId })
          .catch(() => undefined)
      }
      await session.detach()
    }
  }

  await expect
    .poll(() =>
      evaluate(() => (globalThis as any).chrome?.runtime?.id).catch(() => null),
    )
    .toBe(extensionId)
  return { evaluate }
}
