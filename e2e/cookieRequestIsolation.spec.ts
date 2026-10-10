import fs from "node:fs/promises"
import http from "node:http"
import type { AddressInfo } from "node:net"
import os from "node:os"
import path from "node:path"
import { chromium, expect, test } from "@playwright/test"
import { build } from "vite"

import type { CookieTransportProbe } from "./fixtures/cookieTransportProbe"
import { buildExtensionLaunchOptions } from "./utils/extensionLaunch"

/** Only delete the resolved directory that this test created under the temp root. */
async function removeFixtureDirectory(directory: string) {
  if (
    !path
      .resolve(directory)
      .startsWith(
        `${path.resolve(os.tmpdir())}${path.sep}aah-cookie-transport-`,
      )
  )
    throw new Error("Unexpected fixture cleanup path")
  await fs.rm(directory, { recursive: true, force: true })
}

test("private extension accounts and the user's tab keep separate cookies during overlapping requests", async ({
  browserName,
}, testInfo) => {
  test.skip(browserName !== "chromium", "Requires Chromium DNR")
  // Bundle the actual production executor; no duplicate DNR implementation in this fixture.
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "aah-cookie-transport-"),
  )
  const received: string[] = []
  let release: (() => void) | undefined
  const server = http.createServer((request, response) => {
    if (request.method !== "POST") {
      response.setHeader("Content-Type", "text/html")
      response.end("<!doctype html><title>Browser account B</title>")
      return
    }
    const cookie = request.headers.cookie ?? ""
    received.push(cookie)
    const respond = () => {
      if (response.writableEnded || response.destroyed) return
      if (cookie.includes("session=A") || cookie.includes("session=C")) {
        response.setHeader("Set-Cookie", [
          "session=rotated; Path=/; HttpOnly; SameSite=Lax",
          "csrf=rotated; Path=/; SameSite=Lax",
        ])
      }
      response.setHeader("Content-Type", "application/json")
      response.end(
        JSON.stringify({ cookie, origin: request.headers.origin ?? "" }),
      )
    }
    if (cookie.includes("session=A")) release = respond
    else respond()
  })
  let context:
    | Awaited<ReturnType<typeof chromium.launchPersistentContext>>
    | undefined
  try {
    await build({
      configFile: false,
      logLevel: "silent",
      resolve: { alias: { "~": path.resolve("src") } },
      define: { "import.meta.env.BROWSER": JSON.stringify("chrome") },
      build: {
        outDir: directory,
        emptyOutDir: false,
        lib: {
          entry: path.resolve("e2e/fixtures/cookieTransportProbe.ts"),
          formats: ["es"],
          fileName: () => "worker.js",
        },
      },
    })
    await fs.writeFile(
      path.join(directory, "manifest.json"),
      JSON.stringify({
        manifest_version: 3,
        name: "Cookie transport test",
        version: "1.0.0",
        permissions: ["declarativeNetRequestWithHostAccess"],
        host_permissions: ["http://127.0.0.1/*"],
        background: { service_worker: "worker.js", type: "module" },
      }),
    )
    await fs.writeFile(
      path.join(directory, "probe.html"),
      '<!doctype html><script type="module" src="worker.js"></script>',
    )
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    context = await chromium.launchPersistentContext(
      "",
      buildExtensionLaunchOptions({
        extensionDir: directory,
        headless: true,
        chromeExecutablePath: process.env.AAH_E2E_CHROME_EXECUTABLE_PATH,
      }),
    )
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"))
    const extensionOrigin = `chrome-extension://${new URL(worker.url()).hostname}`
    const otherExtensionPage = await context.newPage()
    await otherExtensionPage.goto(`${extensionOrigin}/probe.html`)
    await otherExtensionPage.waitForFunction(
      () => "cookieTransportProbe" in globalThis,
    )
    const userTab = await context.newPage()
    await context.addCookies([
      {
        name: "session",
        value: "B",
        url: origin,
        httpOnly: true,
        sameSite: "Lax",
      },
      { name: "csrf", value: "csrf-B", url: origin, sameSite: "Lax" },
    ])
    await userTab.goto(origin)
    const invoke = (input: { url: string; account?: string }) =>
      (
        globalThis as unknown as { cookieTransportProbe: CookieTransportProbe }
      ).cookieTransportProbe.request(input.url, input.account)
    const first = worker.evaluate(invoke, {
      url: `${origin}/same`,
      account: "A",
    })
    await expect.poll(() => received.length).toBe(1)
    const interruptedRules = await worker.evaluate(() =>
      chrome.declarativeNetRequest.getSessionRules(),
    )
    const third = otherExtensionPage.evaluate(invoke, {
      url: `${origin}/same`,
      account: "C",
    })
    await expect
      .poll(() =>
        otherExtensionPage.evaluate(
          () =>
            (
              globalThis as unknown as {
                cookieTransportProbe: CookieTransportProbe
              }
            ).cookieTransportProbe.started,
        ),
      )
      .toEqual(["C"])
    const browserResult = await userTab.evaluate(
      async (url) => (await fetch(url, { method: "POST" })).json(),
      `${origin}/same`,
    )
    expect(browserResult.cookie).toBe("session=B; csrf=csrf-B")
    expect(received).toEqual([
      "session=A; csrf=csrf-A",
      "session=B; csrf=csrf-B",
    ])
    release!()
    expect(await first).toEqual({ cookie: "session=A; csrf=csrf-A", origin })
    expect(await third).toEqual({ cookie: "session=C; csrf=csrf-C", origin })
    expect(
      (await context.cookies(origin))
        .map((cookie) => [cookie.name, cookie.value])
        .sort(),
    ).toEqual([
      ["csrf", "csrf-B"],
      ["session", "B"],
    ])
    expect(
      await worker.evaluate(() =>
        chrome.declarativeNetRequest.getSessionRules(),
      ),
    ).toEqual([])
    // Recreate the residue left when a worker dies before its finally block.
    await worker.evaluate(
      (rules) =>
        chrome.declarativeNetRequest.updateSessionRules({ addRules: rules }),
      interruptedRules,
    )
    const ordinary = await otherExtensionPage.evaluate(invoke, {
      url: `${origin}/same`,
    })
    expect(ordinary.cookie).toBe("session=B; csrf=csrf-B")
    expect(
      await worker.evaluate(() =>
        chrome.declarativeNetRequest.getSessionRules(),
      ),
    ).toEqual([])
    await test.step("recover after the actual worker is terminated with an active private rule", async () => {
      const before = received.length
      // Do not leave a CDP evaluation waiting on the fetch: a stopped worker's
      // target may remain attached even though its execution context has ended.
      await worker.evaluate((url) => {
        const probe = (
          globalThis as unknown as {
            cookieTransportProbe: CookieTransportProbe
          }
        ).cookieTransportProbe
        void probe.request(url, "A").catch(() => {})
      }, `${origin}/same`)
      await expect.poll(() => received.length).toBe(before + 1)
      const cdp = await context!.newCDPSession(otherExtensionPage)
      try {
        const versions: {
          versionId: string
          scriptURL: string
          runningStatus: string
        }[] = []
        cdp.on(
          "ServiceWorker.workerVersionUpdated",
          ({ versions: updated }) => {
            versions.push(...updated)
          },
        )
        await cdp.send("ServiceWorker.enable")
        await expect
          .poll(() =>
            versions.some((version) => version.scriptURL === worker.url()),
          )
          .toBe(true)
        const version = versions
          .slice()
          .reverse()
          .find((version) => version.scriptURL === worker.url())!
        await cdp.send("ServiceWorker.stopWorker", {
          versionId: version.versionId,
        })
        await expect
          .poll(
            () =>
              versions
                .slice()
                .reverse()
                .find((entry) => entry.versionId === version.versionId)
                ?.runningStatus,
          )
          .toBe("stopped")
        const orphaned = await otherExtensionPage.evaluate(() =>
          chrome.declarativeNetRequest.getSessionRules(),
        )
        expect(orphaned.map((rule) => rule.id)).toContain(3_000_000)
        const browserRequest = await otherExtensionPage.evaluate(invoke, {
          url: `${origin}/same`,
        })
        expect(browserRequest.cookie).toBe("session=B; csrf=csrf-B")
        const nextAccount = await otherExtensionPage.evaluate(invoke, {
          url: `${origin}/same`,
          account: "C",
        })
        expect(nextAccount.cookie).toBe("session=C; csrf=csrf-C")
        expect(
          await otherExtensionPage.evaluate(() =>
            chrome.declarativeNetRequest.getSessionRules(),
          ),
        ).toEqual([])
      } finally {
        await cdp.detach()
      }
    })
    await testInfo.attach("browser-version", {
      body: context.browser()!.version(),
      contentType: "text/plain",
    })
  } finally {
    release?.()
    await context?.close()
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await removeFixtureDirectory(directory)
  }
})
