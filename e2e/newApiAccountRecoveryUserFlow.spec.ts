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

for (const scenario of scenarios) {
  test(`New API real-site account flow ${scenario.name}`, async ({
    context,
    page,
    extensionId,
  }) => {
    const baseUrl = "https://new-api-account-recovery.example.invalid"
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
    let securityPageRequests = 0

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
    await context.route(`${baseUrl}/security`, (route) => {
      securityPageRequests += 1
      return route.fulfill({
        contentType: "text/html",
        body: securityPageHtml(scenario),
      })
    })
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
      prepareDetectedDialog: async (dialog) => {
        if (!needsRecovery) return recovery.prepareDetectedDialog(dialog)

        await expect(
          dialog.dialog.getByText("Enter an Access Token manually", {
            exact: true,
          }),
        ).toBeVisible()
        // tabs.create may navigate before Playwright attaches route interception.
        // Verify the browser's actual target before replaying that exact URL.
        const interceptedNavigation = context
          .waitForEvent("page")
          .then(async (securityPage) => {
            let requestedUrl = ""
            await expect
              .poll(async () => {
                requestedUrl = await serviceWorker.evaluate(async () => {
                  const [tab] = await chrome.tabs.query({
                    active: true,
                    currentWindow: true,
                  })
                  return tab?.pendingUrl ?? tab?.url ?? ""
                })
                return requestedUrl
              })
              .toBe(`${baseUrl}/security#security-access`)
            await securityPage.goto(requestedUrl)
          })
        await Promise.all([
          interceptedNavigation,
          recovery.prepareDetectedDialog(dialog),
        ])
      },
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
    expect(securityPageRequests > 0).toBe(needsRecovery)
  })
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
  <section id="security-access"><h2>Sessions &amp; Access</h2>
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
