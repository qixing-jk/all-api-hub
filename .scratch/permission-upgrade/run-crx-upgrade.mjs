import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { createHash, generateKeyPairSync } from "node:crypto"
import fs from "node:fs/promises"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { chromium, expect } from "@playwright/test"

const runFile = promisify(execFile)
const browserLabel = process.argv[2] ?? "chromium"
const reportDir = path.resolve(
  ".scratch/permission-upgrade",
  `crx-${browserLabel}`,
)
await fs.mkdir(reportDir, { recursive: true })
const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aah-crx-upgrade-"))
const statePath = path.join(reportDir, "active-profile.json")
const source = path.resolve(".output/chrome-mv3")
const manifest = JSON.parse(
  await fs.readFile(path.join(source, "manifest.json"), "utf8"),
)
const baseline = JSON.parse(
  await fs.readFile("e2e/fixtures/permission-warnings-baseline.json", "utf8"),
)
const name = "All API Hub CRX upgrade test"
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 })
const pub = keys.publicKey.export({ type: "spki", format: "der" })
const id = [...createHash("sha256").update(pub).digest().subarray(0, 16)]
  .map((x) => String.fromCharCode(97 + (x >> 4), 97 + (x & 15)))
  .join("")
await fs.writeFile(
  path.join(dir, "key.pem"),
  keys.privateKey.export({ type: "pkcs8", format: "pem" }),
)
let latest = "4.3.0"
const report = {
  browserLabel,
  id,
  sourceManifest: manifest,
  approvedBaselineManifest: baseline,
  scope:
    "Current production build repackaged with baseline, candidate, and positive-control permission sets; test-only versions and local update URL; not historical release binaries or store delivery.",
  requests: [],
  states: {},
  nativeDialogs: {},
}
const server = http.createServer(async (req, res) => {
  try {
    report.requests.push({
      method: req.method,
      url: req.url,
      servingVersion: latest,
    })
    if (req.url.startsWith("/update")) {
      res.setHeader("Content-Type", "application/xml")
      res.end(
        `<?xml version="1.0"?><gupdate xmlns="http://www.google.com/update2/response" protocol="2.0"><app appid="${id}"><updatecheck codebase="${origin}/extension.crx" version="${latest}" /></app></gupdate>`,
      )
    } else if (req.url.startsWith("/extension.crx")) {
      res.setHeader("Content-Type", "application/x-chrome-extension")
      res.end(await fs.readFile(path.join(dir, `${latest}.crx`)))
    } else {
      res.setHeader("Content-Type", "text/html")
      res.end('<a href="/extension.crx">Install test CRX</a>')
    }
  } catch (error) {
    res.statusCode = 500
    res.end(String(error))
  }
})
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
const origin = `http://127.0.0.1:${server.address().port}`
let context
let policy
let page
const native = async (button, dialog) => {
  const args = [
    "-NoProfile",
    "-File",
    path.resolve(".scratch/permission-upgrade/native-ui.ps1"),
    "-StatePath",
    statePath,
  ]
  if (button) args.push("-InvokeName", button)
  if (dialog) args.push("-DialogName", dialog)
  return (
    await runFile("powershell.exe", args, {
      timeout: 12000,
      maxBuffer: 512000,
      windowsHide: true,
    })
  ).stdout
}
const confirm = async (button, dialog, accepted) => {
  let result
  await expect
    .poll(
      async () => {
        if (await accepted()) return true
        try {
          result = await native(button, dialog)
          return result.includes(`INVOKED ${button}`) && (await accepted())
        } catch {
          return false
        }
      },
      { timeout: 25000, intervals: [500] },
    )
    .toBe(true)
  return result
}
try {
  await fs.writeFile(statePath, JSON.stringify({ dir, id }))
  context = await chromium.launchPersistentContext(path.join(dir, "profile"), {
    headless: false,
    ...(browserLabel === "edge"
      ? {
          executablePath:
            "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
        }
      : {}),
    args: [
      "--window-position=-30000,-30000",
      "--force-renderer-accessibility",
      "--lang=en-US",
      "--no-first-run",
      "--no-default-browser-check",
    ],
    ignoreDefaultArgs: [
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-component-update",
    ],
  })
  report.browserVersion = context.browser().version()
  page = await context.newPage()
  await page.goto("chrome://extensions")
  const info = () =>
    page.evaluate(
      (id) =>
        new Promise((resolve, reject) =>
          chrome.developerPrivate.getExtensionsInfo(
            { includeDisabled: true, includeTerminated: true },
            (result) =>
              chrome.runtime.lastError
                ? reject(new Error(chrome.runtime.lastError.message))
                : resolve(result.find((x) => x.id === id)),
          ),
        ),
      id,
    )
  const snapshot = async (label) => {
    const item = await info()
    if (item) delete item.iconUrl
    report.states[label] = item
    console.log(label, item?.version, item?.state)
    return item
  }
  const manifests = {
    "4.3.0": {
      ...manifest,
      permissions: baseline.permissions,
      optional_permissions: baseline.optional_permissions,
    },
    "4.3.1": manifest,
    "4.3.2": {
      ...manifest,
      permissions: [...manifest.permissions, "notifications"],
      optional_permissions: manifest.optional_permissions.filter(
        (p) => p !== "notifications",
      ),
    },
  }
  for (const [version, content] of Object.entries(manifests)) {
    const root = path.join(dir, version)
    await fs.cp(source, root, { recursive: true })
    const testManifest = {
      ...content,
      name,
      version,
      update_url: `${origin}/update`,
    }
    await fs.writeFile(
      path.join(root, "manifest.json"),
      JSON.stringify(testManifest),
    )
    const packed = await page.evaluate(
      ({ root, pem }) =>
        new Promise((resolve, reject) =>
          chrome.developerPrivate.packDirectory(root, pem, 0, (result) =>
            chrome.runtime.lastError
              ? reject(new Error(chrome.runtime.lastError.message))
              : resolve(result),
          ),
        ),
      { root, pem: path.join(dir, "key.pem") },
    )
    assert.equal(packed.status, "SUCCESS", JSON.stringify(packed))
    const crx = await fs.readFile(`${root}.crx`)
    assert.equal(crx.subarray(0, 4).toString(), "Cr24")
    assert.equal(crx.readUInt32LE(4), 3)
    report[`crx${version}`] = {
      sha256: createHash("sha256").update(crx).digest("hex"),
      bytes: crx.length,
      manifest: testManifest,
    }
    console.log("PACKED", version, crx.length)
  }
  policy = await context.newPage()
  await policy.goto("chrome://policy/test")
  const policies = [
    { name: "ExtensionInstallAllowlist", value: [id] },
    { name: "ExtensionInstallSources", value: [origin + "/*"] },
  ].map((p) => ({ namespace: "chrome", source: 5, scope: 1, level: 1, ...p }))
  report.installPolicies = policies
  assert.equal(
    await policy.evaluate(async (policies) => {
      const { PolicyTestBrowserProxy } = await import(
        "/test/policy_test_browser_proxy.js"
      )
      return PolicyTestBrowserProxy.getInstance().applyTestPolicies(
        JSON.stringify(policies),
        "",
      )
    }, policies),
    true,
  )
  const cdp = await context.browser().newBrowserCDPSession()
  // Playwright's download interception bypasses the CRX installer. Restore the
  // native download path before clicking the link.
  await cdp.send("Browser.setDownloadBehavior", { behavior: "default" })
  const install = await context.newPage()
  await install.goto(origin)
  const clicking = install
    .getByText("Install test CRX")
    .click({ timeout: 45000 })
  clicking.catch(() => {})
  report.nativeDialogs.install = await confirm(
    "Add extension",
    name,
    async () => (await info())?.state === "ENABLED",
  )
  await clicking
  await expect
    .poll(async () => (await info())?.state, { timeout: 20000 })
    .toBe("ENABLED")
  const before = await snapshot("baseline")
  assert.equal(before.version, "4.3.0")
  assert.equal(before.mustRemainInstalled, false)
  assert.equal(before.userMayModify, true)
  assert.notEqual(before.location, "UNPACKED")
  const extensionPage = await context.newPage()
  await extensionPage.goto(`chrome-extension://${id}/options.html`)
  report.baselinePermissions = await extensionPage.evaluate(async () => {
    await chrome.storage.local.set({
      crxUpgradeProbe: { marker: "preserve-through-packed-upgrade" },
    })
    return chrome.permissions.getAll()
  })
  assert.ok(
    !report.baselinePermissions.permissions.includes(
      "declarativeNetRequestWithHostAccess",
    ),
  )
  assert.ok(!report.baselinePermissions.permissions.includes("notifications"))
  // Extension pages can keep an update pending, so close all product pages.
  for (const p of context.pages())
    if (p.url().startsWith(`chrome-extension://${id}/`)) await p.close()
  const update = async (version) => {
    latest = version
    await page.evaluate(
      () =>
        new Promise((resolve, reject) =>
          chrome.developerPrivate.autoUpdate(() =>
            chrome.runtime.lastError
              ? reject(new Error(chrome.runtime.lastError.message))
              : resolve(),
          ),
        ),
    )
    await expect
      .poll(async () => (await info())?.version, { timeout: 30000 })
      .toBe(version)
  }
  await update("4.3.1")
  const candidate = await snapshot("candidate")
  assert.equal(candidate.state, "ENABLED")
  const checkPage = await context.newPage()
  await checkPage.goto(`chrome-extension://${id}/options.html`)
  report.candidateRuntime = await checkPage.evaluate(async () => ({
    permissions: await chrome.permissions.getAll(),
    stored: await chrome.storage.local.get("crxUpgradeProbe"),
    rules: await chrome.declarativeNetRequest.getSessionRules(),
  }))
  assert.ok(
    report.candidateRuntime.permissions.permissions.includes(
      "declarativeNetRequestWithHostAccess",
    ),
  )
  assert.deepEqual(report.candidateRuntime.stored, {
    crxUpgradeProbe: { marker: "preserve-through-packed-upgrade" },
  })
  await page.bringToFront()
  await page.screenshot({
    path: path.join(reportDir, "candidate-enabled.png"),
    fullPage: true,
  })
  for (const p of context.pages())
    if (p.url().startsWith(`chrome-extension://${id}/`)) await p.close()
  await update("4.3.2")
  const control = await snapshot("control")
  assert.equal(control.state, "DISABLED")
  assert.equal(control.disableReasons.blockedByPolicy, false)
  report.controlManagement = await page.evaluate(
    (id) =>
      new Promise((resolve, reject) =>
        chrome.management.get(id, (info) =>
          chrome.runtime.lastError
            ? reject(new Error(chrome.runtime.lastError.message))
            : resolve(info),
        ),
      ),
    id,
  )
  assert.equal(report.controlManagement.disabledReason, "permissions_increase")
  await page.screenshot({
    path: path.join(reportDir, "control-disabled.png"),
    fullPage: true,
  })
  report.controlUi = await page.locator("body").innerText()
  console.log("CONTROL_REASON", report.controlManagement.disabledReason)
  const enabling = page.evaluate(
    (id) =>
      new Promise((resolve, reject) =>
        chrome.management.setEnabled(id, true, () =>
          chrome.runtime.lastError
            ? reject(new Error(chrome.runtime.lastError.message))
            : resolve(),
        ),
      ),
    id,
  )
  enabling.catch(() => {})
  report.nativeDialogs.reenable = await confirm(
    "Re-enable",
    name,
    async () => (await info())?.state === "ENABLED",
  )
  await enabling
  await expect
    .poll(async () => (await info())?.state, { timeout: 15000 })
    .toBe("ENABLED")
  await snapshot("controlReenabled")
  const restoredPage = await context.newPage()
  await restoredPage.goto(`chrome-extension://${id}/options.html`)
  report.reenabledRuntime = await restoredPage.evaluate(async () => ({
    permissions: await chrome.permissions.getAll(),
    stored: await chrome.storage.local.get("crxUpgradeProbe"),
  }))
  assert.ok(
    report.reenabledRuntime.permissions.permissions.includes("notifications"),
  )
  assert.deepEqual(
    report.reenabledRuntime.stored,
    report.candidateRuntime.stored,
  )
  report.passed = true
} catch (error) {
  report.passed = false
  report.error = String(error.stack ?? error)
  try {
    report.failureNativeUi = await native()
  } catch {}
  if (page)
    try {
      await page.screenshot({
        path: path.join(reportDir, "failure.png"),
        timeout: 5000,
      })
    } catch {}
  throw error
} finally {
  // Test policies belong to this browser process/profile. Discard the entire
  // fixture instead of retaining or modifying any system policy state.
  await context?.close()
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
  const resolved = path.resolve(dir)
  assert.ok(resolved.startsWith(path.join(os.tmpdir(), "aah-crx-upgrade-")))
  await fs.rm(resolved, { recursive: true, force: true })
  report.cleanup = {
    browserClosed: true,
    temporaryProfileRemoved: true,
    systemPoliciesModified: false,
  }
  await fs.writeFile(
    path.join(reportDir, "report.json"),
    JSON.stringify(report, null, 2),
  )
  console.log("REPORT", path.join(reportDir, "report.json"))
}
