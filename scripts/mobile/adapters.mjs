import { runDevUi } from "./dev-ui.mjs"
import { waitForStop } from "./lifecycle.mjs"
import { connectCdp, connectRdp } from "./protocol.mjs"

const IDS = [
  "lapnciffpekdengooeolaienkeoilfeo",
  "pcokpjaffghgipcgjhapgdpeddlhblaa",
]
const FIREFOX_ID = "{bc73541a-133d-4b50-b261-36ea20df0d24}"

/** Select a stable context, never an arbitrary unrelated browser tab. */
export function selectTarget(targets, context = "background", targetId) {
  const matches = targets.filter((target) =>
    targetId
      ? target.id === targetId
      : context === "options"
        ? /\/options\.html(?:[?#]|$)/.test(target.url)
        : /\/(?:background(?:\.js|\/)|_generated_background_page\.html)/.test(
            target.url,
          ),
  )
  if (matches.length !== 1)
    throw new Error(
      `Expected one ${context} target, found ${matches.length}. Open the extension or use --target ID from inspect.`,
    )
  return matches[0]
}

/** Connect to verified Chromium extension targets using native CDP. */
export async function chromiumAdapter(connection, { extensionId } = {}) {
  const response = await fetch(`${connection.base}/json/list`, {
    signal: AbortSignal.timeout(5000),
  })
  if (!response.ok) throw new Error(`Target discovery HTTP ${response.status}`)
  const ids = extensionId ? [extensionId] : IDS
  const targets = (await response.json())
    .filter((target) =>
      ids.some((id) => target.url.startsWith(`chrome-extension://${id}/`)),
    )
    .map((target) => ({
      id: target.id,
      type: target.type,
      url: target.url,
      socket: target.webSocketDebuggerUrl,
    }))
  return {
    targets,
    async devUi(target, emit, duration) {
      if (target.type !== "page")
        throw new Error("Dev UI requires a page target")
      const client = await connectCdp(target.socket)
      try {
        await runDevUi(client, emit, duration)
      } finally {
        client.close()
      }
    },
    async evaluate(target, expression) {
      const client = await connectCdp(target.socket)
      try {
        const reply = await client.request("Runtime.evaluate", {
          expression,
          awaitPromise: true,
          returnByValue: true,
          allowUnsafeEvalBlockedByCSP: true,
        })
        if (reply.result.exceptionDetails)
          throw new Error(
            reply.result.exceptionDetails.exception?.description ||
              reply.result.exceptionDetails.text,
          )
        return { value: reply.result.result.value, remote: reply.result.result }
      } finally {
        client.close()
      }
    },
    async logs(target, emit, duration) {
      const client = await connectCdp(target.socket)
      try {
        client.onEvent((message) => {
          if (
            [
              "Runtime.consoleAPICalled",
              "Runtime.exceptionThrown",
              "Log.entryAdded",
            ].includes(message.method)
          )
            emit(message)
        })
        await client.request("Runtime.enable")
        await client.request("Log.enable")
        await waitForStop(duration)
      } finally {
        client.close()
      }
    },
    async reload(target) {
      const client = await connectCdp(target.socket)
      try {
        await client.request("Runtime.evaluate", {
          expression:
            "setTimeout(() => chrome.runtime.reload(), 100); 'reload scheduled'",
          returnByValue: true,
        })
      } finally {
        client.close()
      }
      return { status: "reload-scheduled", changesDeployed: false }
    },
    close() {},
  }
}

/** Follow Firefox addon watchers to discover page and background console actors. */
export async function firefoxAdapter(
  connection,
  { extensionId = FIREFOX_ID } = {},
) {
  const client = await connectRdp(connection.port)
  try {
    const addons = await client.request("root", "listAddons")
    const addon = addons.addons.find((addon) => addon.id === extensionId)
    if (!addon) throw new Error(`Firefox addon ${extensionId} is not installed`)
    const targets = []
    const watcher = await client.request(addon.actor, "getWatcher", {
      isServerTargetSwitchingEnabled: true,
    })
    client.onEvent((event) => {
      if (
        event.from === watcher.actor &&
        event.type === "target-available-form" &&
        !event.target.isFallbackExtensionDocument
      ) {
        const target = event.target
        targets.push({
          id: target.url.split(/[?#]/)[0],
          actor: target.actor,
          type: target.targetType,
          url: target.url,
          consoleActor: target.consoleActor,
        })
      }
      if (event.type === "target-destroyed-form") {
        const index = targets.findIndex(
          (target) => target.actor === event.target.actor,
        )
        if (index >= 0) targets.splice(index, 1)
      }
    })
    await client.request(watcher.actor, "watchTargets", { targetType: "frame" })
    return {
      targets,
      async evaluate(target, expression) {
        let stop
        const events = []
        let accept
        const eventResult = new Promise((resolve) => {
          accept = resolve
        })
        stop = client.onEvent((event) => {
          if (
            event.from === target.consoleActor &&
            event.type === "evaluationResult"
          ) {
            events.push(event)
            accept(event)
          }
        })
        let timer
        try {
          const reply = await client.request(
            target.consoleActor,
            "evaluateJSAsync",
            {
              text: expression,
              eager: false,
              mapped: { await: true },
              disableBreaks: true,
            },
          )
          const result =
            events.find((event) => event.resultID === reply.resultID) ||
            (await Promise.race([
              eventResult,
              new Promise((_, reject) => {
                timer = setTimeout(
                  () => reject(new Error("Firefox evaluation timeout")),
                  10000,
                )
              }),
            ]))
          if (
            result.exception ||
            result.hasException ||
            result.topLevelAwaitRejected
          )
            throw new Error(
              result.exceptionMessage || "Firefox evaluation failed",
            )
          // Object values are actor grips. JSON.stringify(...) yields portable values.
          return { value: result.result, remote: result }
        } finally {
          clearTimeout(timer)
          stop()
        }
      },
      async logs(target, emit, duration) {
        const stop = client.onEvent((event) => {
          if (
            event.from === target.consoleActor &&
            ["consoleAPICall", "pageError"].includes(event.type)
          )
            emit(event)
        })
        try {
          await client.request(target.consoleActor, "startListeners", {
            listeners: ["ConsoleAPI", "PageError"],
          })
          await waitForStop(duration)
        } finally {
          await client
            .request(target.consoleActor, "stopListeners", {
              listeners: ["ConsoleAPI", "PageError"],
            })
            .catch(() => {})
          stop()
        }
      },
      async reload() {
        await client.request(addon.actor, "reload")
        return { status: "reloaded", changesDeployed: false }
      },
      close: () => client.close(),
    }
  } catch (error) {
    client.close()
    throw error
  }
}
