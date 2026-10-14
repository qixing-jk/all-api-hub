import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execute = promisify(execFile)
export const BROWSER_PACKAGES = {
  edge: [
    "com.microsoft.emmx",
    "com.microsoft.emmx.beta",
    "com.microsoft.emmx.dev",
    "com.microsoft.emmx.canary",
  ],
  lemur: ["com.lemurbrowser.exts"],
  firefox: [
    "org.mozilla.firefox",
    "org.mozilla.firefox_beta",
    "org.mozilla.fenix",
  ],
}

/** Run ADB without shell interpolation; keep every device operation pinned. */
export async function runAdb(args) {
  const { stdout } = await execute(process.env.ADB_PATH || "adb", args, {
    timeout: 15000,
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  })
  return stdout.trim()
}

/** Select one authorized device, rejecting ambiguous or unauthorized selections. */
export function selectDevice(output, requested) {
  const rows = output
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .filter((row) => ["device", "offline", "unauthorized"].includes(row[1]))
  if (requested) {
    const row = rows.find((row) => row[0] === requested)
    if (!row || row[1] !== "device")
      throw new Error(`Device ${requested}: ${row?.[1] || "not connected"}`)
    return requested
  }
  const ready = rows.filter((row) => row[1] === "device")
  if (ready.length !== 1)
    throw new Error(
      "Connect and authorize one phone, or select it with --device SERIAL",
    )
  return ready[0][0]
}

/** Discover live sockets and verify Chromium identity before returning a connection. */
export async function discoverMobileConnection({
  device,
  browser,
  packageName,
  adb = runAdb,
  readVersion = async (base) => {
    const response = await fetch(`${base}/json/version`, {
      signal: AbortSignal.timeout(3000),
    })
    if (!response.ok) throw new Error(`CDP discovery HTTP ${response.status}`)
    return response.json()
  },
}) {
  const allowed = BROWSER_PACKAGES[browser]
  if (!allowed || (packageName && !allowed.includes(packageName)))
    throw new Error("Unsupported browser/package combination")
  const output = await adb(["-s", device, "shell", "cat", "/proc/net/unix"])
  const sockets = [
    ...new Set(
      output
        .split(/\r?\n/)
        .map((line) => line.trim().split(/\s+/).at(-1))
        .filter((name) =>
          browser === "firefox"
            ? allowed.some((pkg) =>
                name?.endsWith(`${pkg}/firefox-debugger-socket`),
              ) &&
              (!packageName ||
                name.endsWith(`${packageName}/firefox-debugger-socket`))
            : /^@.*devtools_remote(?:_\d+)?$/.test(name || ""),
        ),
    ),
  ]
  const failures = []
  for (const socket of sockets) {
    let port
    const close = async () => {
      if (port) await adb(["-s", device, "forward", "--remove", `tcp:${port}`])
      port = null
    }
    try {
      port = Number(
        await adb([
          "-s",
          device,
          "forward",
          "tcp:0",
          socket.startsWith("@")
            ? `localabstract:${socket.slice(1)}`
            : `localfilesystem:${socket}`,
        ]),
      )
      if (!Number.isInteger(port) || port < 1 || port > 65535)
        throw new Error("ADB returned an invalid forwarded port")
      const base = `http://127.0.0.1:${port}`
      const version = browser === "firefox" ? null : await readVersion(base)
      const actualPackage =
        version?.["Android-Package"] ||
        allowed.find((pkg) => socket.endsWith(`${pkg}/firefox-debugger-socket`))
      if (
        !(packageName
          ? actualPackage === packageName
          : allowed.includes(actualPackage))
      ) {
        await close()
        continue
      }
      return {
        device,
        browser,
        packageName: actualPackage,
        port,
        base,
        socket,
        version,
        close,
      }
    } catch (error) {
      failures.push(error.message)
      await close().catch(() => {})
    }
  }
  throw new Error(
    `No responding ${browser} debugger. Keep the browser in the foreground${browser === "firefox" ? " and enable Remote Debugging via USB in Firefox" : ""}.${failures.length ? ` ${failures.join("; ")}` : ""}`,
  )
}
