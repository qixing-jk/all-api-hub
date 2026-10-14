import { waitForStop } from "./lifecycle.mjs"

/** Packed Chromium installs enforce CSP even for WXT's localhost dev scripts. */
export async function runDevUi(client, emit, duration) {
  const verification = await client.request("Runtime.evaluate", {
    expression: `chrome.runtime.getManifest().name.includes('(dev)') && [...document.scripts].some(script => { const url = new URL(script.src); return url.protocol === 'http:' && url.hostname === '127.0.0.1' && !!url.port && url.pathname === '/@vite/client'; })`,
    returnByValue: true,
  })
  if (verification.result?.result?.value !== true)
    throw new Error("CSP bypass requires an installed WXT dev page")
  await client.request("Page.setBypassCSP", { enabled: true })
  try {
    await client.request("Page.reload")
    emit({ status: "dev-ui-connected", cspBypass: "session-only" })
    await waitForStop(duration)
  } finally {
    await client
      .request("Page.setBypassCSP", { enabled: false })
      .catch(() => {})
  }
}
