import type { CDPSession } from "@playwright/test"

type CdpCommandResult = Record<string, unknown>

/** Send commands to one attached target, rejecting timeouts and detachments. */
export function createTargetCommandSender(
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
        reject(new Error(`CDP target detached during CDP '${method}'`))
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

/** Evaluate JavaScript in the attached target's current default context. */
export async function evaluateInTarget<T>(
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
    throw new Error(exceptionDetails.text ?? "CDP target evaluation failed")
  }

  const result = response["result"] as { value?: T } | undefined
  return result?.value as T
}
