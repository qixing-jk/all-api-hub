import { vi } from "vitest"

import { isolateWebLocks } from "./webLocks"

/** Browser boundary fixture: apply active DNR rules before reaching MSW. */
export function installCookieTransport() {
  isolateWebLocks()
  let rules: browser.declarativeNetRequest.Rule[] = []
  const nativeFetch = globalThis.fetch
  vi.spyOn(browser.permissions, "contains").mockResolvedValue(true)
  const cookies = vi.spyOn(browser.cookies, "getAll").mockResolvedValue([
    {
      name: "token",
      value: "browser-account",
      domain: "cubence.com",
      path: "/",
      secure: true,
      httpOnly: true,
      hostOnly: true,
      session: true,
      sameSite: "lax",
      storeId: "0",
      firstPartyDomain: "",
    },
  ])
  vi.spyOn(browser.declarativeNetRequest, "getSessionRules").mockImplementation(
    async () => rules,
  )
  const updateRules = vi
    .spyOn(browser.declarativeNetRequest, "updateSessionRules")
    .mockImplementation(async (update) => {
      rules = rules.filter((rule) => !update.removeRuleIds?.includes(rule.id))
      rules.push(...(update.addRules ?? []))
    })
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, init) => {
      const url = input instanceof Request ? input.url : String(input)
      const headers = new Headers(init?.headers)
      for (const rule of rules) {
        if (!new RegExp(rule.condition.regexFilter!).test(url)) continue
        for (const header of rule.action.requestHeaders ?? []) {
          if (header.operation === "set")
            headers.set(header.header, header.value!)
          if (header.operation === "remove") headers.delete(header.header)
        }
      }
      return nativeFetch(input, { ...init, headers })
    })
  return { cookies, fetch, updateRules }
}
