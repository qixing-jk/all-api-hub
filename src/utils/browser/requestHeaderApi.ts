/** Chromium APIs used to coordinate scoped User-Agent header rules. */
export function getChromiumRequestHeaderApi() {
  const chromeApi = (
    globalThis as typeof globalThis & { chrome?: typeof browser }
  ).chrome
  if (!chromeApi?.runtime?.id) return undefined
  return {
    runtime: chromeApi.runtime,
    permissions: chromeApi.permissions,
    declarativeNetRequest: chromeApi.declarativeNetRequest,
  }
}
