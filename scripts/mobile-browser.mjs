import { execFile } from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { parseArgs, promisify } from "node:util"

import {
  chromiumAdapter,
  firefoxAdapter,
  selectTarget,
} from "./mobile/adapters.mjs"
import { runMobileDev } from "./mobile/dev.mjs"
import {
  BROWSER_PACKAGES,
  discoverMobileConnection,
  runAdb,
  selectDevice,
} from "./mobile/discovery.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

loadLocalEnv()

const help = `Mobile extension debugging (JSON / JSONL)
  pnpm browser:mobile devices
  pnpm browser:mobile inspect --browser edge|lemur|firefox
  pnpm browser:mobile eval --browser NAME --context options|background --file CODE.js
  pnpm browser:mobile eval --browser NAME --expression 'JSON.stringify(...)'
  pnpm browser:mobile logs --browser NAME --duration 10000
  pnpm browser:mobile reload --browser NAME
  pnpm browser:mobile screenshot --browser NAME --output .scratch/mobile.png
  pnpm browser:mobile dev --browser NAME [--port PORT] [--duration MILLISECONDS]
  pnpm browser:mobile dev-ui --browser edge|lemur --extension DEV_ID [--target ID]
Options: --device SERIAL, --package ANDROID_PACKAGE, --extension EXTENSION_ID,
         --target TARGET_ID, --context options|background (default: background).
Keep the selected browser in the foreground. Firefox needs USB remote debugging.
Reload restarts installed code; it does not deploy checkout changes.
Dev keeps WXT and ADB reverse running; Ctrl+C stops only this session.
Chromium dev prepares a separate CRX for manual installation; Firefox uses web-ext.
`

/** Execute an explicit command surface with scoped connection cleanup. */
async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      browser: { type: "string" },
      device: { type: "string" },
      package: { type: "string" },
      extension: { type: "string" },
      target: { type: "string" },
      context: { type: "string" },
      expression: { type: "string" },
      file: { type: "string" },
      duration: { type: "string" },
      output: { type: "string" },
      port: { type: "string" },
      help: { type: "boolean" },
    },
  })
  const command = positionals[0] || "inspect"
  const emit = (result) => process.stdout.write(`${JSON.stringify(result)}\n`)
  if (values.help) {
    process.stdout.write(help)
    return
  }
  if (
    positionals.length > 1 ||
    ![
      "devices",
      "inspect",
      "eval",
      "logs",
      "reload",
      "screenshot",
      "dev",
      "dev-ui",
    ].includes(command)
  )
    throw new Error(help)
  const devices = await runAdb(["devices", "-l"])
  if (command === "devices") {
    emit({
      devices: devices
        .split(/\r?\n/)
        .filter((row) => /\s(?:device|unauthorized|offline)(?:\s|$)/.test(row)),
    })
    return
  }
  const browser = values.browser
  if (!BROWSER_PACKAGES[browser])
    throw new Error("Specify --browser firefox, edge or lemur")
  if (values.package && !BROWSER_PACKAGES[browser].includes(values.package))
    throw new Error("Package does not belong to selected browser")
  if (values.context && !["options", "background"].includes(values.context))
    throw new Error("Use --context options or background")
  const device = selectDevice(devices, values.device)
  const duration = values.duration
    ? Number(values.duration)
    : command === "logs" || command === "dev-ui"
      ? command === "dev-ui"
        ? 600000
        : 10000
      : undefined
  if (
    duration !== undefined &&
    (!Number.isInteger(duration) || duration < 1 || duration > 600000)
  )
    throw new Error("Duration must be 1..600000 milliseconds")
  const port = values.port ? Number(values.port) : undefined
  if (
    port !== undefined &&
    (!Number.isInteger(port) || port < 1024 || port > 65535)
  )
    throw new Error("Port must be 1024..65535")
  if (command === "dev") {
    await runMobileDev({
      device,
      browser,
      packageName: values.package,
      port,
      duration,
      emit,
    })
    return
  }
  if (command === "dev-ui" && (browser === "firefox" || !values.extension))
    throw new Error(
      "Dev UI requires --browser edge|lemur and --extension DEV_ID",
    )
  if (command === "screenshot") {
    if (!values.output) throw new Error("Specify --output FILE.png")
    const filename = path.resolve(values.output)
    await mkdir(path.dirname(filename), { recursive: true })
    const { stdout } = await promisify(execFile)(
      process.env.ADB_PATH || "adb",
      ["-s", device, "exec-out", "screencap", "-p"],
      {
        encoding: "buffer",
        maxBuffer: 16 * 1024 * 1024,
        timeout: 15000,
        windowsHide: true,
      },
    )
    await writeFile(filename, stdout)
    emit({ device, browser, file: filename, scope: "device-screen" })
    return
  }
  let expression
  if (command === "eval") {
    if (!!values.file === !!values.expression)
      throw new Error("Specify exactly one --file or --expression")
    expression = values.file
      ? await readFile(path.resolve(values.file), "utf8")
      : values.expression
  }
  const connection = await discoverMobileConnection({
    device,
    browser,
    packageName: values.package,
  })
  let adapter
  try {
    adapter = await (browser === "firefox" ? firefoxAdapter : chromiumAdapter)(
      connection,
      { extensionId: values.extension },
    )
    const summary = {
      device,
      browser,
      package: connection.packageName,
      protocol: browser === "firefox" ? "rdp" : "cdp",
    }
    if (command === "inspect") {
      emit({
        ...summary,
        targets: adapter.targets.map(({ id, type, url }) => ({
          id,
          type,
          url,
        })),
        capabilities: {
          evaluate: true,
          logs: true,
          reload: true,
          devInstall: browser === "firefox" ? "web-ext" : "manual-crx",
        },
      })
      return
    }
    const target = selectTarget(
      adapter.targets,
      command === "dev-ui" ? "options" : values.context,
      values.target,
    )
    if (command === "dev-ui")
      await adapter.devUi(
        target,
        (event) => emit({ ...summary, target: target.id, ...event }),
        duration,
      )
    if (command === "eval")
      emit({
        ...summary,
        target: target.id,
        ...(await adapter.evaluate(target, expression)),
      })
    if (command === "reload")
      emit({ ...summary, ...(await adapter.reload(target)) })
    if (command === "logs")
      await adapter.logs(
        target,
        (event) => emit({ ...summary, target: target.id, event }),
        duration,
      )
  } finally {
    adapter?.close()
    await connection.close()
  }
}

await main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ error: error.message })}\n`)
  process.exitCode = 1
})
