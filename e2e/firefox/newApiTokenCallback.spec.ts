import { createServer } from "node:http"
import firefox from "selenium-webdriver/firefox.js"

import { expect, test } from "./extensionTest"

test("captures an owned OAuth callback before the site script in Firefox", async ({
  firefoxExtension,
}) => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html")
    response.end(
      '<html><body>Verification callback<script>document.body.dataset.codeConsumed = String(new URLSearchParams(location.search).has("code"))</script></body></html>',
    )
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Missing server")
  const origin = `http://127.0.0.1:${address.port}`
  const driver = firefoxExtension.driver
  try {
    await driver.executeScript("Services.io.offline = false")
    const options = firefoxExtension.page("options.html")
    await options.openInTab()
    await options.evaluate(
      `(() => { window.callbackObserved = null; window.callbackDeliveries = 0; browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action !== 'newApiTokenOAuthCallback' || ++window.callbackDeliveries === 1) return;
        window.callbackObserved = {message, frameId: sender.frameId, origin: new URL(sender.url).origin};
        sendResponse(true);
      }); return true })()`,
    )
    const tabId = await options.evaluateAsync<number>(
      `browser.tabs.create({url:${JSON.stringify(origin)}}).then(tab=>tab.id)`,
    )
    await expect
      .poll(() =>
        options.evaluateAsync<number[]>(
          `browser.tabs.query({url:'http://127.0.0.1/*'}).then(tabs=>tabs.map(tab=>tab.id))`,
        ),
      )
      .toContain(tabId)
    await expect
      .poll(() =>
        options.evaluateAsync(
          `browser.scripting.executeScript({target:{tabId:${tabId}},injectImmediately:true,func:()=>location.origin}).then(results=>results[0].result).catch(()=>null)`,
        ),
      )
      .toBe(origin)
    await options.evaluateAsync(`browser.scripting.executeScript({target:{tabId:${tabId}},injectImmediately:true,func:(origin)=>{
      sessionStorage.setItem('all-api-hub:token-verification',JSON.stringify({requestId:'firefox-fixture',origin,provider:'github',state:'owned-state',expiresAt:Date.now()+300000}))
      return true
    },args:[${JSON.stringify(origin)}]})`)
    await options.evaluateAsync(
      `browser.tabs.update(${tabId},{url:${JSON.stringify(`${origin}/oauth/github?code=one-use-code&state=owned-state`)}}).then(()=>true)`,
    )
    await expect
      .poll(() => options.evaluate("window.callbackObserved"))
      .toMatchObject({
        message: {
          requestId: "firefox-fixture",
          callback: { code: "one-use-code", state: "owned-state" },
        },
        frameId: 0,
        origin,
      })
    expect(await options.evaluate("window.callbackDeliveries")).toBe(2)
    await expect
      .poll(() =>
        options.evaluateAsync(
          `browser.scripting.executeScript({target:{tabId:${tabId}},func:()=>({query:location.search,consumed:document.body.dataset.codeConsumed})}).then(results=>results[0].result)`,
        ),
      )
      .toEqual({ query: "", consumed: "false" })
    await options.evaluateAsync(`browser.tabs.remove(${tabId}).then(()=>true)`)
  } finally {
    await driver.setContext(firefox.Context.CHROME)
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
  }
})
