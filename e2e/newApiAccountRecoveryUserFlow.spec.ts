import { createServer } from "node:http"
import type { AddressInfo } from "node:net"

import { SITE_TYPES } from "~/constants/siteType"
import { expect, test } from "~~/e2e/fixtures/extensionTest"
import {
  E2E_NEW_API_RC22_AUTH,
  forceExtensionLanguage,
  seedUserPreferences,
  stubLlmMetadataIndex,
  stubNewApiSiteRoutes,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { waitForSavedAccount } from "~~/e2e/utils/realSite/accountAdd"
import { createCompatibleRealSiteAccountFixturePreparer } from "~~/e2e/utils/realSite/compatibleAccountSaveFlow"
import type { CompatibleApiRealSiteConfig } from "~~/e2e/utils/realSite/compatibleApi"
import { createNewApiAccountRecovery } from "~~/e2e/utils/realSite/newApiAccountRecovery"

const scenarios = [
  {
    name: "saves an automatically detected token without opening security settings",
    method: null,
    existingToken: false,
    clipboardWriteDelayMs: 0,
  },
  {
    name: "recovers a blocked token exchange through password verification and token regeneration",
    method: "password",
    existingToken: true,
    clipboardWriteDelayMs: 0,
  },
  {
    name: "recovers a blocked token exchange by generating a token with authenticator verification",
    method: "2fa",
    existingToken: false,
    clipboardWriteDelayMs: 0,
  },
  {
    name: "waits for a delayed clipboard copy to replace an old token before saving",
    method: "password",
    existingToken: true,
    clipboardWriteDelayMs: 500,
  },
] as const

const recoveryTest = test.extend<{
  securitySite: { baseUrl: string; html: string; requests: number }
}>({
  securitySite: async ({ extensionId }, runFixture) => {
    void extensionId
    const site = { baseUrl: "", html: "", requests: 0 }
    const server = createServer((request, response) => {
      if (request.url === "/security") {
        site.requests += 1
        response.writeHead(200, { "Content-Type": "text/html" })
        response.end(site.html)
      } else {
        response.writeHead(404)
        response.end()
      }
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    site.baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    try {
      await runFixture(site)
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  },
})

for (const scenario of scenarios) {
  recoveryTest(
    `New API real-site account flow ${scenario.name}`,
    async ({ context, page, extensionId, securitySite }) => {
      const { baseUrl } = securitySite
      // Keep this controlled site's asynchronous copy contract independent of
      // the host OS clipboard, which can block reads across browser contexts.
      await context.addInitScript((origin) => {
        if (location.origin !== origin) return
        let clipboardText = ""
        Object.defineProperty(navigator, "clipboard", {
          value: {
            writeText: async (text: string) => {
              clipboardText = text
            },
            readText: async () => clipboardText,
          },
        })
      }, baseUrl)
      securitySite.html = securityPageHtml(scenario)
      const managementToken = "e2e-account-management-token"
      const needsRecovery = scenario.method !== null
      const config: CompatibleApiRealSiteConfig = {
        baseUrl,
        loginUrl: `${baseUrl}/login`,
        loginApiUrl: `${baseUrl}/api/user/login`,
        login2faApiUrl: `${baseUrl}/api/user/login/2fa`,
        username: "e2e-user",
        password: "e2e-password",
        totpSecret: scenario.method === "2fa" ? "JBSWY3DPEHPK3PXP" : undefined,
      }
      let blockedTokenRequests = 0
      let verifiedTokenRequests = 0
      let verificationRequests = 0
      let automaticTokenRequests = 0

      await forceExtensionLanguage(page, "en")
      await stubLlmMetadataIndex(context)
      await stubNewApiSiteRoutes(context, {
        baseUrl,
        dashboardAuthMode: "auth-bundle",
        accessToken: managementToken,
      })
      await context.route(`${baseUrl}/api/user/token`, (route) => {
        const request = route.request()
        const verified =
          request.method() === "POST" &&
          request.headers()["x-security-proof"] === "verified"
        const automatic = !needsRecovery && request.method() === "GET"
        if (verified) verifiedTokenRequests += 1
        else if (automatic) automaticTokenRequests += 1
        else blockedTokenRequests += 1
        return route.fulfill({
          status: verified || automatic ? 200 : 403,
          json:
            verified || automatic
              ? { success: true, data: managementToken }
              : {
                  success: false,
                  code: "SECURITY_PROOF_REQUIRED",
                  message: "Security verification required",
                },
        })
      })
      await context.route(`${baseUrl}/api/verify`, (route) => {
        verificationRequests += 1
        const body = route.request().postDataJSON()
        const valid =
          body.method === scenario.method &&
          (scenario.method === "password"
            ? body.password === config.password
            : /^\d{6}$/u.test(body.code))
        return route.fulfill({
          status: valid ? 200 : 403,
          json: { success: valid },
        })
      })
      // tabs.create can start loading before Playwright attaches its routes.
      // Let the browser reach the local server without replaying the navigation.
      await context.route(`${baseUrl}/security`, (route) => route.continue())
      const serviceWorker = await getServiceWorker(context)
      await seedUserPreferences(serviceWorker, {
        autoFillCurrentSiteUrlOnAccountAdd: false,
        autoProvisionKeyOnAccountAdd: false,
        tempWindowFallback: { enabled: false },
      })
      const recovery = createNewApiAccountRecovery({ page, config })

      const prepareAccount = createCompatibleRealSiteAccountFixturePreparer({
        context,
        page,
        extensionId,
        serviceWorker,
        config,
        ...recovery,
        siteType: SITE_TYPES.NEW_API,
        login: async (sitePage) => {
          await sitePage.goto(baseUrl)
          return { user: { id: 1, username: "e2e-user" } }
        },
      })

      const savedAccount = await prepareAccount()
      expect(savedAccount.accountId).toBeTruthy()
      const stored = await waitForSavedAccount({
        serviceWorker,
        siteType: SITE_TYPES.NEW_API,
        baseUrl,
      })
      expect(stored.account_info.access_token).toBe(managementToken)
      expect(stored.account_info.username).toBe("e2e-user")
      expect(JSON.stringify(stored)).not.toContain(
        E2E_NEW_API_RC22_AUTH.dashboardToken,
      )
      expect(blockedTokenRequests).toBe(needsRecovery ? 1 : 0)
      expect(verificationRequests).toBe(needsRecovery ? 1 : 0)
      expect(verifiedTokenRequests).toBe(needsRecovery ? 1 : 0)
      expect(automaticTokenRequests).toBe(needsRecovery ? 0 : 1)
      // One read-only capability inspection, then the user-facing token page.
      // Token acquisition and verification above still occur exactly once.
      expect(securitySite.requests).toBe(needsRecovery ? 2 : 0)
    },
  )
}

/**
 * Match the upstream's rotation, verification, and one-time copy UI, including
 * its labelled tabpanel and duplicate close actions. The extension stays real.
 * https://github.com/QuantumNous/new-api/tree/bee45b58a3c0b77e8dc81e6b5aeb4474aa9058d1/web/src/features/security
 */
function securityPageHtml(scenario: (typeof scenarios)[number]) {
  const method = scenario.method === "2fa" ? "2fa" : "password"
  const methodLabel = method === "2fa" ? "Authenticator code" : "Password"
  const inputLabel =
    method === "2fa" ? "Authenticator code or backup code" : "Password"
  return `<!doctype html><html><body>
  <section aria-labelledby="security-access"><h2 id="security-access">Sessions &amp; Access</h2>
    <div data-slot="card"><h4>Access Token</h4>
      <button id="generate">${scenario.existingToken ? "Regenerate" : "Generate"}</button>
    </div>
  </section>
  <div role="alertdialog" aria-label="Regenerate access token?" id="confirmation" hidden>
    <p>This will immediately invalidate your existing access token.</p>
    <button id="confirm">Regenerate token</button>
  </div>
  <div role="dialog" aria-label="Security verification" id="verification" hidden>
    <div role="tablist"><button role="tab" id="verification-tab" aria-selected="true">${methodLabel}</button></div>
    <form id="verify-form"><div role="tabpanel" aria-labelledby="verification-tab">
      <label for="verification-input">${inputLabel}</label>
      <input id="verification-input" type="${method === "password" ? "password" : "text"}" autocomplete="off">
      </div><button type="submit">Verify</button>
    </form>
  </div>
  <div role="dialog" aria-label="Access Token" id="token-dialog" hidden>
    <p>Save this token now. You won't be able to view it again after closing this dialog.</p>
    <label for="generated-access-token">Token</label><input id="generated-access-token" readonly>
    <button id="copy" aria-label="Copy token">Copy token</button>
    <button id="close">Close</button>
    <button data-slot="dialog-close" aria-label="Close" id="close-icon">×</button>
  </div>
  <script>
    const byId = (id) => document.getElementById(id);
    byId("generate").onclick = () => {
      byId("${scenario.existingToken ? "confirmation" : "verification"}").hidden = false;
    };
    byId("confirm").onclick = () => {
      byId("confirmation").hidden = true;
      byId("verification").hidden = false;
    };
    byId("verify-form").onsubmit = async (event) => {
      event.preventDefault();
      const proof = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "${method}", ${method === "2fa" ? "code" : "password"}: byId("verification-input").value }),
      }).then((response) => response.json());
      if (!proof.success) return;
      const token = await fetch("/api/user/token", {
        method: "POST", headers: { "X-Security-Proof": "verified" },
      }).then((response) => response.json());
      if (!token.success) return;
      if (${scenario.clipboardWriteDelayMs} > 0) {
        await navigator.clipboard.writeText("e2e-previous-clipboard-token");
      }
      byId("generated-access-token").value = token.data;
      byId("verification").hidden = true;
      byId("token-dialog").hidden = false;
    };
    byId("copy").onclick = async () => {
      // Model a clipboard write that completes after Playwright's click returns.
      if (${scenario.clipboardWriteDelayMs} > 0) {
        await new Promise((resolve) => setTimeout(resolve, ${scenario.clipboardWriteDelayMs}));
      }
      await navigator.clipboard.writeText(byId("generated-access-token").value);
    };
    byId("close").onclick = () => { byId("token-dialog").hidden = true; };
    byId("close-icon").onclick = byId("close").onclick;
  </script>
</body></html>`
}
