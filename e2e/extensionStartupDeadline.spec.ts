import { expect, test } from "~~/e2e/fixtures/extensionTest"
import { createTargetCommandSender } from "~~/e2e/utils/cdpTarget"
import { getExtensionServiceWorker } from "~~/e2e/utils/extension"

test("a closed context fails startup without consuming its deadline", async ({
  context,
}) => {
  await context.close()
  const startedAt = Date.now()
  const error = await getExtensionServiceWorker(context, {
    timeoutMs: 5_000,
  }).then(
    () => undefined,
    (caught: unknown) => caught,
  )
  expect(String(error)).toMatch(/closed/)
  expect(String(error)).not.toMatch(/Timed out waiting/)
  expect(Date.now() - startedAt).toBeLessThan(1_000)
})

test("an unresponsive extension worker cannot bypass the startup deadline", async ({
  context,
  extensionId,
}) => {
  const browser = context.browser()
  if (!browser) throw new Error("The startup probe requires Chromium")
  const session = await browser.newBrowserCDPSession()
  let targetSessionId: string | undefined
  try {
    const { targetInfos } = await session.send("Target.getTargets")
    const target = targetInfos.find(
      (candidate) =>
        candidate.type === "service_worker" &&
        candidate.url.startsWith(`chrome-extension://${extensionId}/`),
    )
    if (!target) throw new Error("Missing extension worker")
    const attached = await session.send("Target.attachToTarget", {
      targetId: target.targetId,
      flatten: false,
    })
    targetSessionId = attached.sessionId
    const send = createTargetCommandSender(session, targetSessionId)
    // Debugger.pause alone does not confirm the thread has stopped.
    // Occupy the actual worker thread, then interrupt it through CDP in finally.
    await send("Runtime.enable")
    let workerBusy = false
    const onMessage = (event: { sessionId: string; message: string }) => {
      if (event.sessionId !== targetSessionId) return
      const message = JSON.parse(event.message)
      if (
        message.method === "Runtime.consoleAPICalled" &&
        message.params.args[0]?.value === "startup-deadline-busy"
      )
        workerBusy = true
    }
    session.on("Target.receivedMessageFromTarget", onMessage)
    const blocked = send("Runtime.evaluate", {
      expression: 'console.log("startup-deadline-busy"); while (true) {}',
    }).catch(() => undefined)
    try {
      await expect.poll(() => workerBusy).toBe(true)
      await expect(
        getExtensionServiceWorker(context, { timeoutMs: 100 }),
      ).rejects.toThrow(/browser API probe timed out/)
    } finally {
      await send("Runtime.terminateExecution")
      await blocked
      session.off("Target.receivedMessageFromTarget", onMessage)
    }
    // A late reply must not poison the next readiness check or its cached worker.
    await expect(
      getExtensionServiceWorker(context, { timeoutMs: 5_000 }),
    ).resolves.toBeDefined()
  } finally {
    if (targetSessionId)
      await session.send("Target.detachFromTarget", {
        sessionId: targetSessionId,
      })
    await session.detach()
  }
})
