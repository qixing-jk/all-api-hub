// Local-only browser evidence. Run with Node 24 from the checkout root.
// Uses the production request helper in a disposable Chromium MV3 extension,
// synthetic Basic credentials and a loopback HTTP server. No real accounts.
import assert from "node:assert/strict"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { stripTypeScriptTypes } from "node:module"
import { resolve } from "node:path"
import { chromium } from "@playwright/test"

const fixture = resolve(
  ".scratch/analytics-storage-failure/artifacts/webdav-auth-extension",
)
await mkdir(fixture, { recursive: true })
const source = stripTypeScriptTypes(
  await readFile("src/services/webdav/webdavFetch.ts", "utf8"),
)
await writeFile(
  resolve(fixture, "helper.js"),
  `${source}\nglobalThis.webdavFetch = webdavFetch;`,
)
await writeFile(
  resolve(fixture, "index.html"),
  '<!doctype html><script type="module" src="helper.js"></script>',
)
await writeFile(
  resolve(fixture, "worker.js"),
  "chrome.runtime.onInstalled.addListener(() => {});",
)
await writeFile(
  resolve(fixture, "manifest.json"),
  JSON.stringify({
    manifest_version: 3,
    name: "Local DAV authentication probe",
    version: "1.0",
    host_permissions: ["http://127.0.0.1/*"],
    background: { service_worker: "worker.js" },
  }),
)
const requests = []
const server = createServer((req, res) => {
  requests.push({
    path: req.url,
    authorization: req.headers.authorization,
    cookie: req.headers.cookie ?? null,
  })
  if (req.url === "/accepted") res.writeHead(204).end()
  else
    res
      .writeHead(401, { "WWW-Authenticate": 'Basic realm="local-fixture"' })
      .end("Unauthorized")
})
await new Promise((done) => server.listen(0, "127.0.0.1", done))
const url = `http://127.0.0.1:${server.address().port}`
let context
try {
  context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${fixture}`,
      `--load-extension=${fixture}`,
    ],
  })
  const worker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"))
  await context.addCookies([{ name: "browser-session", value: "fixture", url }])
  const page = await context.newPage()
  await page.goto(`chrome-extension://${worker.url().split("/")[2]}/index.html`)
  await page.waitForFunction(() => typeof globalThis.webdavFetch === "function")
  const results = await page.evaluate(async (origin) => {
    const results = []
    for (const [name, path, fixed] of [
      ["baseline", "/baseline", false],
      ["isolated challenge", "/challenge", true],
      ["isolated success", "/accepted", true],
    ]) {
      try {
        const response = await (fixed ? globalThis.webdavFetch : fetch)(
          `${origin}${path}`,
          {
            method: "GET",
            headers: { Authorization: `Basic ${btoa("fixture:password")}` },
            signal: AbortSignal.timeout(3000),
          },
        )
        results.push({ name, status: response.status })
      } catch (error) {
        results.push({ name, error: error.name })
      }
    }
    return results
  }, url)
  assert.equal(results[1].status, 401)
  assert.equal(results[2].status, 204)
  for (const request of requests.filter((item) => item.path !== "/baseline")) {
    assert.equal(request.cookie, null)
    assert.equal(
      request.authorization,
      `Basic ${Buffer.from("fixture:password").toString("base64")}`,
    )
  }
  console.log(
    JSON.stringify(
      { browser: context.browser().version(), results, requests },
      null,
      2,
    ),
  )
} finally {
  await context?.close()
  await new Promise((done) => server.close(done))
}
