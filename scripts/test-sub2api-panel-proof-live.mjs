import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { expect } from "@playwright/test"

import { connectWorktreeExtension } from "./cdp/client.mjs"
import { applyIsolateFlag } from "./cdp/dev-profile.mjs"
import { loadLocalEnv } from "./utils/local-env.mjs"

/** Live credential rotation is explicit; credentials are read only from local environment. */
export async function main(args = process.argv.slice(2)) {
  const target = process.env.AAH_PANEL_PROOF_TEST_BASE_URL?.trim()
  if (!target)
    throw new Error("An explicit AAH_PANEL_PROOF_TEST_BASE_URL is required")
  if (args.includes("--browser-session")) {
    const { runBrowserSessionAcceptance } =
      await import("./suites/sub2api/browser-session.mjs")
    return runBrowserSessionAcceptance(args)
  }
  applyIsolateFlag(args)
  if (!args.includes("--login"))
    throw new Error(
      "Use --login to authorize one new login, token rotation and cleanup",
    )
  const expectedIdentity =
    args.find((arg) => arg.startsWith("--expected-id="))?.slice(14) ??
    process.env.AAH_PANEL_PROOF_TEST_USER_ID
  if (!expectedIdentity || !/^[1-9]\d*$/.test(expectedIdentity))
    throw new Error("An independently verified --expected-id is required")
  const username = process.env.AAH_PANEL_PROOF_TEST_USERNAME
  const password = process.env.AAH_PANEL_PROOF_TEST_PASSWORD
  if (!username || !password)
    throw new Error(
      "Missing AAH_PANEL_PROOF_TEST_USERNAME / AAH_PANEL_PROOF_TEST_PASSWORD",
    )
  const extensionPath = path.resolve(".output/chrome-mv3-dev")
  const html = await fs.readFile(
    path.join(extensionPath, "options.html"),
    "utf8",
  )
  const viteOrigin = html.match(
    /https?:\/\/(?:127\.0\.0\.1|localhost):\d+/,
  )?.[0]
  if (!viteOrigin)
    throw new Error("This live runner requires the current-worktree dev build")
  const modulePath =
    "src/services/apiAdapters/sub2api/auth/backgroundPasswordLogin.ts"
  const source = await fs.readFile(path.resolve(modulePath), "utf8")
  const served = await (await fetch(`${viteOrigin}/${modulePath}`)).text()
  const sourceMap = served.match(
    /sourceMappingURL=data:application\/json;base64,([^\s]+)/,
  )?.[1]
  if (
    !sourceMap ||
    !JSON.parse(
      Buffer.from(sourceMap, "base64").toString(),
    ).sourcesContent?.includes(source)
  )
    throw new Error(
      "The dev server is not serving this worktree's current login implementation",
    )
  const dev = await connectWorktreeExtension({ extensionPath })
  let page
  try {
    page = await dev.context.newPage()
    let credential
    const requests = []
    page.on("request", (request) => {
      const url = new URL(request.url())
      if (url.origin !== new URL(target).origin) return
      requests.push({
        endpoint: url.pathname + url.search,
        hasPanelProof: Boolean(request.headers()["x-panel-proof"]),
      })
    })
    const assertSignedRequest = (endpoint, since) => {
      assert.equal(
        requests
          .slice(since)
          .findLast((request) => request.endpoint === endpoint)?.hasPanelProof,
        true,
        `No panel proof observed for ${endpoint}`,
      )
    }
    const summary = {
      target,
      expectedIdentity,
      extensionId: dev.extensionId,
      viteOrigin,
      login: "pending",
      reads: [],
      rotation: "pending",
      cleanup: "pending",
      websitePagesAfterLogin: null,
    }
    try {
      await page.goto(`chrome-extension://${dev.extensionId}/options.html`, {
        waitUntil: "domcontentloaded",
        timeout: 120000,
      })
      await expect(page.locator("#root")).not.toBeEmpty({ timeout: 120000 })
      console.log(
        "Starting extension-owned login; only an actual CAPTCHA may open a verification page.",
      )
      const login = await page.evaluate(
        async ({
          viteOrigin,
          target,
          username,
          password,
          expectedIdentity,
        }) => {
          const module = await import(
            `${viteOrigin}/src/services/apiAdapters/sub2api/auth/passwordLogin.ts`
          )
          return module.loginSub2ApiWithPassword(
            {
              account: {
                site_url: target,
                site_type: "sub2api",
                account_info: { id: expectedIdentity },
                login: {
                  methodId: "password",
                  credentials: { username, password },
                },
              },
              methodId: "password",
              requestId: `panel-proof-live-${Date.now()}`,
              captureCredential: true,
              attended: true,
            },
            "/login",
          )
        },
        { viteOrigin, target, username, password, expectedIdentity },
      )
      summary.login = login.status
      if (
        login.credential?.accessToken &&
        login.credential?.sub2apiAuth?.refreshToken
      )
        credential = login.credential
      assert.equal(
        login.status,
        "authenticated",
        "Extension-owned login did not finish",
      )
      assert.equal(login.identity, expectedIdentity)
      assert.ok(
        login.credential?.accessToken &&
          login.credential?.sub2apiAuth?.refreshToken,
        "Renewable credential was not captured",
      )
      credential = login.credential
      const websitePages = dev.browser
        .contexts()
        .flatMap((context) => context.pages())
        .filter((tab) => {
          try {
            return new URL(tab.url()).origin === new URL(target).origin
          } catch {
            return false
          }
        })
      summary.websitePagesAfterLogin = websitePages.length
      assert.equal(
        websitePages.length,
        0,
        "A website page remained after login",
      )
      await page.reload()
      await expect(page.locator("#root")).not.toBeEmpty({ timeout: 120000 })
      for (const endpoint of [
        "/api/v1/auth/me",
        "/api/v1/keys?page=1&page_size=1",
      ]) {
        const requestStart = requests.length
        const result = await page.evaluate(
          async ({ viteOrigin, target, credential, endpoint }) => {
            const { fetchApiResponse } = await import(
              `${viteOrigin}/src/services/apiTransport/request.ts`
            )
            const response = await fetchApiResponse(
              {
                siteType: "sub2api",
                baseUrl: target,
                auth: {
                  authType: "access_token",
                  accessToken: credential.accessToken,
                },
                directRequestReason: "provider_protocol",
              },
              { endpoint, options: { credentials: "omit", redirect: "error" } },
            )
            return {
              status: response.status,
              code: response.body?.code,
              identity: endpoint.startsWith("/api/v1/auth/me")
                ? response.body?.data?.id
                : undefined,
            }
          },
          { viteOrigin, target, credential, endpoint },
        )
        summary.reads.push({ endpoint, ...result })
        assert.equal(result.status, 200, `Signed read failed: ${endpoint}`)
        assert.equal(result.code, 0)
        if (endpoint === "/api/v1/auth/me")
          assert.equal(String(result.identity), expectedIdentity)
        assertSignedRequest(endpoint, requestStart)
      }
      const renewalStart = requests.length
      const renewed = await page.evaluate(
        async ({ viteOrigin, target, credential }) => {
          const { refreshSub2ApiTokens } = await import(
            `${viteOrigin}/src/services/apiService/sub2api/auth/tokenRefresh.ts`
          )
          return refreshSub2ApiTokens({
            request: {
              siteType: "sub2api",
              baseUrl: target,
              auth: {
                authType: "access_token",
                accessToken: credential.accessToken,
              },
              directRequestReason: "provider_protocol",
            },
            refreshToken: credential.sub2apiAuth.refreshToken,
          })
        },
        { viteOrigin, target, credential },
      )
      // Retain the replacement immediately, including when a subsequent assertion fails.
      credential = {
        accessToken: renewed.accessToken,
        sub2apiAuth: {
          refreshToken: renewed.refreshToken,
          tokenExpiresAt: renewed.tokenExpiresAt,
        },
      }
      assertSignedRequest("/api/v1/auth/refresh", renewalStart)
      assert.ok(
        renewed.accessToken &&
          renewed.refreshToken &&
          renewed.tokenExpiresAt > Date.now(),
      )
      summary.rotation = "passed"
      const identityStart = requests.length
      const identity = await page.evaluate(
        async ({ viteOrigin, target, credential }) => {
          const { fetchApiResponse } = await import(
            `${viteOrigin}/src/services/apiTransport/request.ts`
          )
          const result = await fetchApiResponse(
            {
              siteType: "sub2api",
              baseUrl: target,
              auth: {
                authType: "access_token",
                accessToken: credential.accessToken,
              },
              directRequestReason: "provider_protocol",
            },
            { endpoint: "/api/v1/auth/me" },
          )
          return { status: result.status, id: result.body?.data?.id }
        },
        { viteOrigin, target, credential },
      )
      assert.equal(identity.status, 200)
      assert.equal(String(identity.id), expectedIdentity)
      assertSignedRequest("/api/v1/auth/me", identityStart)
      console.log(
        "Signed identity/key reads and rotation passed with no website page open.",
      )
    } finally {
      if (credential?.sub2apiAuth?.refreshToken) {
        try {
          const cleanup = await page.evaluate(
            async ({ viteOrigin, target, credential }) => {
              const { fetchApiResponse } = await import(
                `${viteOrigin}/src/services/apiTransport/request.ts`
              )
              const result = await fetchApiResponse(
                {
                  siteType: "sub2api",
                  baseUrl: target,
                  auth: {
                    authType: "access_token",
                    accessToken: credential.accessToken,
                  },
                  directRequestReason: "provider_protocol",
                },
                {
                  endpoint: "/api/v1/auth/logout",
                  options: {
                    method: "POST",
                    body: JSON.stringify({
                      refresh_token: credential.sub2apiAuth.refreshToken,
                    }),
                    credentials: "omit",
                    redirect: "error",
                  },
                },
              )
              return { status: result.status, code: result.body?.code }
            },
            { viteOrigin, target, credential },
          )
          assert.equal(cleanup.status, 200)
          assert.equal(cleanup.code, 0)
          summary.cleanup = "passed"
        } catch {
          summary.cleanup = "failed"
        }
      } else summary.cleanup = "no captured session"
      const output = path.resolve(
        ".scratch/sub2api-panel-proof/artifacts",
        `live-${Date.now()}.json`,
      )
      await fs.mkdir(path.dirname(output), { recursive: true })
      await fs.writeFile(output, `${JSON.stringify(summary, null, 2)}\n`)
      console.log(JSON.stringify(summary))
      assert.notEqual(
        summary.cleanup,
        "failed",
        "Own login family cleanup failed",
      )
    }
  } finally {
    await page?.close().catch(() => {})
    await dev.close()
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  loadLocalEnv()
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
