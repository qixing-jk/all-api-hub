import { fetchWithHeaderOverrides } from "~/services/apiTransport/headerOverrides"

export interface CookieTransportProbe {
  started: string[]
  request: (
    url: string,
    account?: string,
  ) => Promise<{ cookie: string; origin: string }>
}

const probe: CookieTransportProbe = {
  started: [],
  async request(url, account) {
    probe.started.push(account ?? "browser")
    const response = await fetchWithHeaderOverrides(
      url,
      {
        method: "POST",
        credentials: "include",
        signal: AbortSignal.timeout(10_000),
      },
      undefined,
      account
        ? {
            cookieSession: {
              origin: new URL(url).origin,
              cookieHeader: `session=${account}; csrf=csrf-${account}`,
            },
          }
        : undefined,
    )
    return response.json()
  },
}
Object.assign(globalThis, { cookieTransportProbe: probe })
