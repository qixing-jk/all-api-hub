import { createHash } from "node:crypto"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import type { AutoCheckinStatus } from "~/types/autoCheckin"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  createStoredAccount,
  forceExtensionLanguage,
  installExtensionPageGuards,
  seedStoredAccounts,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import {
  getPlasmoStorageJsonValue,
  getServiceWorker,
} from "~~/e2e/utils/extensionState"
import { waitForExtensionRoot } from "~~/e2e/utils/lazyLoading"

for (const mode of [
  "pow",
  "turnstile",
  "shared-mismatch",
  "legacy-refresh-401",
  "legacy-refresh-405",
] as const) {
  test(`account session native check-in: ${mode}`, async ({
    context,
    extensionId,
    page,
  }, testInfo) => {
    const logins: string[] = [],
      claims: string[] = [],
      challenges: string[] = []
    let directPosts = 0
    const checked = new Set<string>()
    const server = createServer(async (req, res) => {
      const url = new URL(req.url || "/", "http://fixture")
      const path = url.pathname
      const cookieId = /session=(\d+)/.exec(req.headers.cookie || "")?.[1]
      const id =
        /^Bearer api-(\d+)$/.exec(req.headers.authorization || "")?.[1] ||
        cookieId
      const json = (data: unknown, status = 200) => {
        res.writeHead(status, { "content-type": "application/json" })
        res.end(JSON.stringify(data))
      }
      let body = ""
      for await (const chunk of req) body += chunk
      if (path === "/api/status")
        return json({
          success: true,
          data: { password_login_enabled: true, checkin_enabled: true },
        })
      if (path === "/api/user/auth/refresh")
        return json(
          { success: false },
          mode === "legacy-refresh-401"
            ? 401
            : mode === "legacy-refresh-405"
              ? 405
              : 404,
        )
      if (path === "/api/user/login") {
        const user = JSON.parse(body).username.replace("user-", "")
        logins.push(user)
        res.setHeader("set-cookie", `session=${user}; Path=/; SameSite=Lax`)
        return json({
          success: true,
          data: { id: Number(user), username: `user-${user}` },
        })
      }
      if (path === "/api/user/logout" || path === "/api/user/auth/logout") {
        res.setHeader("set-cookie", "session=; Path=/; Max-Age=0")
        return json({ success: true })
      }
      if (path === "/api/user/self")
        return id
          ? json({ success: true, data: { id: Number(id) } })
          : json({ success: false }, 401)
      if (path === "/api/user/checkin") {
        if (!id) return json({ success: false }, 401)
        if (req.method !== "POST")
          return json({
            success: true,
            data: {
              enabled: true,
              stats: { checked_in_today: checked.has(id) },
            },
          })
        const challenge = `native-${id}`
        const nonce = Number(url.searchParams.get("pow_nonce"))
        const valid =
          mode === "turnstile"
            ? url.searchParams.get("turnstile") === "check-in-widget-token"
            : url.searchParams.get("pow_challenge") === challenge &&
              url.searchParams.has("pow_nonce") &&
              Number.isInteger(nonce) &&
              createHash("sha256")
                .update(`${challenge}:${nonce}`)
                .digest("hex")
                .startsWith("00")
        if (!valid || !cookieId) {
          directPosts++
          return json({
            success: false,
            message:
              mode === "turnstile"
                ? "Turnstile token invalid"
                : "Proof of work required",
          })
        }
        claims.push(cookieId)
        checked.add(cookieId)
        return json({ success: true, data: { quota_awarded: 1000 } })
      }
      if (path === "/api/user/pow/challenge") {
        if (!cookieId) return json({}, 401)
        challenges.push(cookieId)
        return json({
          success: true,
          data: {
            challenge_id: `native-${cookieId}`,
            prefix: `native-${cookieId}:`,
            difficulty: 8,
          },
        })
      }
      if (path === "/login") {
        res.writeHead(200, { "content-type": "text/html" })
        return res.end(`<!doctype html><title>Native login fixture</title><form><input name="username" autocomplete="username"><input name="password" type="password" autocomplete="current-password"><button type="submit">Sign in</button></form><script>
          document.querySelector('form').onsubmit=async e=>{e.preventDefault();const result=await (await fetch('/api/user/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:document.querySelector('[name=username]').value,password:document.querySelector('[name=password]').value})})).json();localStorage.setItem('user',JSON.stringify(result.data));location.href='/console/personal'};
        </script>`)
      }
      if (path === "/console/personal") {
        res.writeHead(200, { "content-type": "text/html" })
        return res.end(`<!doctype html><title>Native check-in fixture</title><main><h1>Daily check-in</h1><div class="cf-turnstile"><input name="cf-turnstile-response" value="unrelated-login-token"></div><button id="check-in">Check in</button><div id="challenge" hidden><div class="cf-turnstile"><input name="cf-turnstile-response" value=""></div><button id="complete">Complete check-in verification</button></div></main><script>
          const submit=async payload=>{await fetch('/api/user/checkin?'+new URLSearchParams(payload),{method:'POST'});document.querySelector('#challenge').hidden=true};
          document.querySelector('#check-in').onclick=async()=>{
            document.querySelector('#check-in').disabled=true;
            if(${mode === "turnstile"}){document.querySelector('#challenge').hidden=false;return}
            const {data:{challenge_id,prefix}}=await (await fetch('/api/user/pow/challenge?action=checkin')).json();let nonce=0;
            for(;;nonce++){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(prefix+nonce));if(new Uint8Array(hash)[0]===0)break}
            await submit({pow_challenge:challenge_id,pow_nonce:nonce});
          };
          document.querySelector('#complete').onclick=async()=>{const token='check-in-widget-token';document.querySelector('#challenge input').value=token;await submit({turnstile:token})};
        </script>`)
      }
      json({}, 404)
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    let options = page
    try {
      if (mode !== "shared-mismatch") {
        const settings = await context.newPage()
        await settings.goto(`chrome://extensions/?id=${extensionId}`)
        await settings.locator("extensions-toolbar #devMode").click()
        await settings.locator("#allow-incognito cr-toggle").click()
        await expect
          .poll(() =>
            settings.evaluate(
              (id) =>
                new Promise<boolean>((resolve) =>
                  (globalThis as any).chrome.developerPrivate.getExtensionInfo(
                    id,
                    (info: { state?: string }) =>
                      resolve(info.state === "ENABLED"),
                  ),
                ),
              extensionId,
            ),
          )
          .toBe(true)
        options = await context.newPage()
        await settings.close()
      }
      const worker = await getServiceWorker(context)
      await stubLlmMetadataIndex(context)
      await seedUserPreferences(worker, {
        autoCheckin: {
          ...DEFAULT_PREFERENCES.autoCheckin!,
          globalEnabled: false,
          pretriggerDailyOnUiOpen: false,
          notifyUiOnCompletion: false,
          retryStrategy: {
            ...DEFAULT_PREFERENCES.autoCheckin!.retryStrategy,
            enabled: false,
          },
        },
        tempWindowFallback: {
          ...DEFAULT_PREFERENCES.tempWindowFallback!,
          enabled: true,
          turnstileAssistPresentation: "page",
        },
      })
      const ids = mode === "pow" ? ["101", "202"] : ["101"]
      await seedStoredAccounts(
        worker,
        ids.map((id) =>
          createStoredAccount({
            id: `native-${id}`,
            site_name: `Target ${id}`,
            site_url: origin,
            site_type: "new-api",
            account_info: {
              id,
              username: `user-${id}`,
              access_token: `api-${id}`,
            },
            login: {
              methodId: "password",
              credentials: {
                username: `user-${id}`,
                password: "fixture-password",
              },
            },
            checkIn: {
              automaticExecutionEnabled: true,
              selection: {
                mode: "manual",
                methodId: AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn,
              },
              methodKnowledge: {
                methods: {
                  [AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn]: {
                    detection: {
                      outcome: "matched",
                      evidence: { source: "probe", observedAt: Date.now() },
                    },
                  },
                },
              },
            },
          }),
        ),
      )
      if (mode === "shared-mismatch")
        await context.addCookies([
          { name: "session", value: "999", url: origin },
        ])
      await forceExtensionLanguage(options, "en")
      installExtensionPageGuards(options)
      await options.goto(
        `chrome-extension://${extensionId}/options.html#autoCheckin`,
      )
      await waitForExtensionRoot(options)
      await options.bringToFront()
      await options.emulateMedia({ reducedMotion: "reduce" })
      const runButton = options.getByRole("button", {
        name: "Run now",
        exact: true,
      })
      await expect(runButton).toBeVisible()
      await runButton.click()
      if (mode === "turnstile") {
        // The reminder must retain and reveal the post-login check-in window.
        await expect(
          options.getByRole("button", {
            name: "Open verification window",
            exact: true,
          }),
        ).toBeVisible({ timeout: 30_000 })
        await options
          .getByRole("button", {
            name: "Open verification window",
            exact: true,
          })
          .click()
        await expect
          .poll(
            () =>
              context
                .browser()
                ?.contexts()
                .flatMap((c) => c.pages())
                .filter((p) => p.url() === `${origin}/console/personal`).length,
          )
          .toBeGreaterThan(0)
        const native = context
          .browser()!
          .contexts()
          .flatMap((c) => c.pages())
          .find((p) => p.url() === `${origin}/console/personal`)!
        await native
          .getByRole("button", {
            name: "Complete check-in verification",
            exact: true,
          })
          .click()
      }
      const readStatus = () =>
        getPlasmoStorageJsonValue<AutoCheckinStatus>(
          worker,
          "autoCheckin_status",
        )
      await expect.poll(readStatus, { timeout: 70_000 }).toMatchObject({
        perAccount: Object.fromEntries(
          ids.map((id) => [
            `native-${id}`,
            mode === "shared-mismatch"
              ? {
                  status: "failed",
                  reasonCode: "authentication_required",
                  messageKey:
                    "autoCheckin:providerFallback.nativePageIdentityMismatch",
                }
              : { status: "success" },
          ]),
        ),
      })
      const status = await readStatus()
      for (const id of ids)
        expect(status?.perAccount?.[`native-${id}`]).toMatchObject(
          mode === "shared-mismatch"
            ? {
                status: "failed",
                reasonCode: "authentication_required",
                messageKey:
                  "autoCheckin:providerFallback.nativePageIdentityMismatch",
              }
            : { status: "success" },
        )
      expect(claims).toEqual(mode === "shared-mismatch" ? [] : ids)
      expect(logins).toEqual(mode === "shared-mismatch" ? [] : ids)
      expect(challenges).toEqual(
        mode !== "turnstile" && mode !== "shared-mismatch" ? ids : [],
      )
      expect(directPosts).toBe(ids.length)
      for (const id of ids) {
        const row = options.getByRole("row").filter({ hasText: `Target ${id}` })
        await expect(row).toBeVisible()
        await expect(row).toContainText(
          mode === "shared-mismatch" ? /different account/i : /success/i,
        )
      }
      await expect
        .poll(() =>
          worker.evaluate(
            async (site) =>
              (await (globalThis as any).chrome.tabs.query({})).filter(
                (tab: { url?: string }) => tab.url?.startsWith(site),
              ).length,
            origin,
          ),
        )
        .toBe(0)
      await testInfo.attach("account-session-result", {
        body: JSON.stringify(
          {
            mode,
            logins,
            claims,
            challenges,
            directPosts,
            perAccount: status?.perAccount,
          },
          null,
          2,
        ),
        contentType: "application/json",
      })
      await options.locator("main").screenshot({
        path: testInfo.outputPath("result.png"),
        animations: "disabled",
      })
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
}
