import { tryParseHttpUrl } from "~/utils/core/urlParsing"

/** Restore the registered isolated content script on a still-matching HTTP tab. */
export async function injectContentScript(
  tabId: number,
  expectedUrl: string,
): Promise<boolean> {
  const expected = tryParseHttpUrl(expectedUrl)
  const scripting = browser.scripting
  if (!expected || typeof scripting?.executeScript !== "function") return false
  try {
    const tab = await browser.tabs.get(tabId)
    if (tryParseHttpUrl(tab.url)?.origin !== expected.origin) return false
    const manifestScripts = browser.runtime.getManifest().content_scripts ?? []
    let files = manifestScripts.find(
      (script) => script.matches?.includes("<all_urls>") && script.js?.length,
    )?.js
    // WXT registers development content scripts dynamically rather than in the manifest.
    if (
      !files?.length &&
      typeof scripting.getRegisteredContentScripts === "function"
    ) {
      const registered = await scripting.getRegisteredContentScripts()
      files = registered.find(
        (script) => script.matches?.includes("<all_urls>") && script.js?.length,
      )?.js
    }
    if (!files?.length) return false
    const results = await scripting.executeScript({ target: { tabId }, files })
    return results.length > 0 && results.every((result) => !result.error)
  } catch {
    return false
  }
}

/**
 * Runs a self-contained function in the page world of a tab.
 * Returns null when the scripting API is unavailable or the page rejects it.
 */
export async function executeMainWorldFunction<TResult>(
  tabId: number,
  func: (...args: any[]) => TResult,
  args: unknown[] = [],
): Promise<TResult | null> {
  const scripting = browser.scripting
  if (typeof scripting?.executeScript !== "function") return null

  try {
    const [injection] = await scripting.executeScript({
      target: { tabId },
      args,
      func,
      world: "MAIN",
    } as unknown as browser.scripting.ScriptInjection)
    if (injection?.error) return null
    return (injection?.result ?? null) as TResult | null
  } catch {
    return null
  }
}
