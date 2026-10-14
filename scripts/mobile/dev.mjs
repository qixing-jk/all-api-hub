import { execFile, spawn } from "node:child_process"
import { createHash, createPublicKey } from "node:crypto"
import { access, mkdir, readFile } from "node:fs/promises"
import net from "node:net"
import path from "node:path"
import { promisify } from "node:util"
import { chromium } from "@playwright/test"

import { BROWSER_PACKAGES, runAdb } from "./discovery.mjs"

/** HTML can precede the manifest/background; accept only complete current output. */
export async function isDevOutputReady(sourceDir, port) {
  try {
    const origin = `http://127.0.0.1:${port}`
    const html = await readFile(path.join(sourceDir, "options.html"), "utf8")
    const manifest = JSON.parse(
      await readFile(path.join(sourceDir, "manifest.json"), "utf8"),
    )
    if (
      !html.includes(origin) ||
      !JSON.stringify(manifest.content_security_policy).includes(origin)
    )
      return false
    const scripts = manifest.background?.scripts || [
      manifest.background?.service_worker,
    ]
    await Promise.all(
      scripts
        .filter(Boolean)
        .map((script) => access(path.join(sourceDir, script))),
    )
    return true
  } catch {
    return false
  }
}

/** Own only newly created reverse mappings, preserving other dev sessions. */
export async function withReversePort(device, port, adb = runAdb) {
  const mappings = await adb(["-s", device, "reverse", "--list"])
  const mapping = mappings
    .split(/\r?\n/)
    .map((row) => row.trim().split(/\s+/))
    .find((row) => row[1] === `tcp:${port}`)
  if (mapping) {
    if (mapping[2] !== `tcp:${port}`)
      throw new Error(`Phone port ${port} is already mapped to ${mapping[2]}`)
    return async () => {}
  }
  await adb(["-s", device, "reverse", "tcp:" + port, "tcp:" + port])
  return async () => {
    await adb(["-s", device, "reverse", "--remove", `tcp:${port}`])
  }
}

/** Acquire a currently free local port; WXT readiness still verifies the chosen port. */
async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}

/** Start WXT, reverse its exact port, then deploy Firefox or prepare a Chromium CRX. */
export async function runMobileDev({
  device,
  browser,
  packageName,
  port: requestedPort,
  duration,
  emit,
}) {
  const port = requestedPort || (await freePort())
  const target = browser === "firefox" ? "firefox" : "chrome"
  const sourceDir = path.resolve(
    `.output/${target}-${target === "firefox" ? "mv2" : "mv3"}-dev`,
  )
  const artifactDir = path.resolve(".scratch/mobile-dev", browser)
  await mkdir(artifactDir, { recursive: true })
  const release = await withReversePort(device, port)
  const children = []
  const webExtForwards = new Set()
  let spawnError
  let stopped = false
  const launch = (script, args) => {
    const child = spawn(process.execPath, [script, ...args], {
      env: { ...process.env, WXT_OPEN_BROWSER: "0", AAH_MOBILE_DEV: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    })
    children.push(child)
    let output = ""
    child.stdout.on("data", (data) => {
      process.stderr.write(data)
      output = (output + data.toString()).slice(-4096)
      // web-ext creates this forward itself but does not remove it on exit.
      for (const match of output.matchAll(
        /You can connect to this Android device on TCP port (\d+)/g,
      ))
        webExtForwards.add(Number(match[1]))
    })
    child.stderr.on("data", (data) => process.stderr.write(data))
    child.on("error", (error) => {
      spawnError = error
    })
    return child
  }
  const stop = () => {
    stopped = true
    for (const child of children) child.kill()
  }
  process.once("SIGINT", stop)
  process.once("SIGTERM", stop)
  try {
    const wxt = launch(path.resolve("node_modules/wxt/bin/wxt.mjs"), [
      "-b",
      target,
      "--port",
      String(port),
    ])
    const until = Date.now() + 120000
    let ready = false
    while (!stopped && Date.now() < until) {
      if (spawnError || wxt.exitCode !== null)
        throw spawnError || new Error(`WXT exited: ${wxt.exitCode}`)
      try {
        if (await isDevOutputReady(sourceDir, port)) {
          const response = await fetch(
            `http://127.0.0.1:${port}/@vite/client`,
            { signal: AbortSignal.timeout(1000) },
          )
          ready = response.ok
        }
      } catch {
        /* Wait for the current build, never accept an older output. */
      }
      if (ready) break
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    if (stopped) return
    if (!ready)
      throw new Error("WXT did not produce a reachable current dev build")
    if (browser === "firefox") {
      const apk = packageName || BROWSER_PACKAGES.firefox[0]
      launch(path.resolve("node_modules/web-ext/bin/web-ext.js"), [
        "run",
        "-t",
        "firefox-android",
        "--adb-device",
        device,
        "--firefox-apk",
        apk,
        "--source-dir",
        sourceDir,
        "--no-input",
      ])
      emit({
        status: "deploying",
        browser,
        device,
        port,
        sourceDir,
        transport: "rdp",
        uiHotUpdate: "pending-validation",
        extensionReload: "web-ext watches source output",
      })
    } else {
      // Chromium's pack mode produces a local CRX; Android browsers own installation.
      const packDir = path.join(artifactDir, "extension")
      const { cp } = await import("node:fs/promises")
      await cp(sourceDir, packDir, { recursive: true })
      await promisify(execFile)(
        chromium.executablePath(),
        [
          `--pack-extension=${packDir}`,
          `--user-data-dir=${path.join(artifactDir, "pack-profile")}`,
          "--no-first-run",
          "--no-message-box",
          ...((await readFile(`${packDir}.pem`)
            .then(() => true)
            .catch(() => false))
            ? [`--pack-extension-key=${packDir}.pem`]
            : []),
        ],
        { windowsHide: true, timeout: 30000 },
      )
      const crx = `${packDir}.crx`
      await readFile(crx)
      const publicKey = createPublicKey(
        await readFile(`${packDir}.pem`),
      ).export({ type: "spki", format: "der" })
      const extensionId = [
        ...createHash("sha256").update(publicKey).digest("hex").slice(0, 32),
      ]
        .map((character) => String.fromCharCode(97 + parseInt(character, 16)))
        .join("")
      const remote = `/sdcard/Download/all-api-hub-${browser}-dev.crx`
      await runAdb(["-s", device, "push", crx, remote])
      emit({
        status: "manual-install-required",
        browser,
        device,
        port,
        sourceDir,
        crx,
        phoneFile: remote,
        extensionId,
        uiHotUpdate: "requires-dev-ui",
        devUiCommand: `node scripts/mobile-browser.mjs dev-ui --browser ${browser} --extension ${extensionId}`,
        extensionReload:
          "Repack/reinstall for packaged background or manifest changes",
        note: "Install this separate dev CRX, open its options page, then run dev-ui to allow WXT scripts for that debugging session. Keep both processes running.",
      })
    }
    await new Promise((resolve, reject) => {
      if (spawnError || children.some((child) => child.exitCode !== null)) {
        reject(spawnError || new Error("Dev process exited before readiness"))
        return
      }
      let timer
      const finish = (error) => {
        clearTimeout(timer)
        process.removeListener("SIGINT", finish)
        process.removeListener("SIGTERM", finish)
        if (error instanceof Error) reject(error)
        else resolve()
      }
      process.once("SIGINT", finish)
      process.once("SIGTERM", finish)
      for (const child of children) {
        child.once("error", finish)
        child.once("exit", (code) => {
          if (!stopped && code !== 0) {
            finish(new Error(`Dev process exited: ${code}`))
          } else finish()
        })
      }
      if (duration) timer = setTimeout(finish, duration)
    })
  } finally {
    stop()
    process.removeListener("SIGINT", stop)
    process.removeListener("SIGTERM", stop)
    await release()
    for (const forwardedPort of webExtForwards)
      await runAdb([
        "-s",
        device,
        "forward",
        "--remove",
        `tcp:${forwardedPort}`,
      ]).catch(() => {})
  }
}
