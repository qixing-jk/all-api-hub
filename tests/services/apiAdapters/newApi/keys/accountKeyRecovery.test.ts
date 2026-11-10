import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { createNewApiAccountKeyResources } from "~/services/apiAdapters/newApi/keys/accountKeyResource"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import type {
  ApiServiceRequest,
  FetchApiOptions,
} from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { createDeferred } from "~~/tests/test-utils/deferred"
import {
  buildNewApiToken,
  buildSiteAccount,
} from "~~/tests/test-utils/factories"
import { atIndex } from "~~/tests/test-utils/indexedAccess"
import { isolateWebLocks } from "~~/tests/test-utils/webLocks"

const deps = vi.hoisted(() => ({
  data: vi.fn(),
  api: vi.fn(),
  read: vi.fn(),
  mutate: vi.fn(),
  login: vi.fn(),
}))
vi.mock("~/services/apiTransport/request", () => ({
  fetchApiData: deps.data,
  fetchApi: deps.api,
}))
vi.mock("~/services/accounts/accountStorage/accountConfigStore", () => ({
  accountConfigStore: { read: deps.read, mutateAccount: deps.mutate },
}))
vi.mock("~/services/accountLogin", () => ({ loginAccount: deps.login }))

beforeEach(() => {
  vi.resetAllMocks()
  isolateWebLocks()
})
afterEach(() => {
  vi.restoreAllMocks()
})

it.each([false, true])(
  "keeps the newest recovered Cookie through the real inventory chain and subsequent create (late older read: %s)",
  async (lateOlderRead) => {
    let account = buildSiteAccount({
      id: "recovery-account",
      site_type: SITE_TYPES.ANYROUTER,
      site_url: "https://anyrouter.example",
      authType: AuthTypeEnum.Cookie,
      account_info: { ...buildSiteAccount().account_info, id: "17" },
      cookieAuth: { sessionCookie: "session=expired" },
      login: { methodId: "github", automaticRecovery: true },
    })
    deps.read.mockImplementation(async () => ({ accounts: [account] }))
    deps.mutate.mockImplementation(async (_id, mutate) => {
      const out = mutate(account)
      account = out.nextAccount
      return out.result
    })
    deps.login.mockResolvedValue({
      status: "authenticated",
      identity: "17",
      credential: { cookie: "session=first" },
    })
    const olderStarted = createDeferred<void>()
    const finishOlder = createDeferred<void>()
    let holdOlder = lateOlderRead
    let created = false
    const inventoryCookies: string[] = []
    deps.data.mockImplementation(
      async (input: ApiServiceRequest, options: FetchApiOptions) => {
        if (options.endpoint === "/api/user/self")
          return { id: "17", username: "member", group: "vip" }
        if (options.endpoint === "/api/user/self/groups")
          return { vip: { desc: "VIP", ratio: 1 } }
        expect(options.endpoint).toMatch(/^\/api\/token\//)
        const cookie = input.auth.cookie!
        inventoryCookies.push(cookie)
        if (cookie === "session=expired")
          throw new ApiError(
            "expired",
            401,
            options.endpoint,
            API_ERROR_CODES.HTTP_401,
          )
        if (holdOlder && cookie === "session=first") {
          holdOlder = false
          olderStarted.resolve()
          await finishOlder.promise
        }
        const items = created ? [buildNewApiToken({ id: 9, group: "vip" })] : []
        return { items, total: items.length, page: 1, page_size: 100 }
      },
    )
    deps.api.mockImplementation(async (_input, options) => {
      expect(options.options.method).toBe("POST")
      created = true
      return { success: true }
    })
    const request: ApiServiceRequest = {
      directRequestReason: API_DIRECT_REQUEST_REASONS.CredentialIsolation,
      baseUrl: account.site_url,
      accountId: account.id,
      siteType: SITE_TYPES.ANYROUTER,
      allowAccountCredentialRecovery: true,
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "17",
        cookie: "session=expired",
      },
      cookieAuthSessionCookie: "session=expired",
      cookieSession: {
        origin: account.site_url,
        cookieHeader: "session=expired",
      },
    }
    const session = await createNewApiAccountKeyResources(
      SITE_TYPES.ANYROUTER,
    ).open({
      account: { id: account.id, siteType: SITE_TYPES.ANYROUTER },
      request,
    })
    const first = session.provisioning!.inspect()
    if (lateOlderRead) {
      await olderStarted.promise
      // A different account operation rotates storage while the first response is delayed.
      account = { ...account, cookieAuth: { sessionCookie: "session=newest" } }
      await session.provisioning!.inspect()
      finishOlder.resolve()
    }
    const snapshot = await first
    const expectedCookie = lateOlderRead ? "session=newest" : "session=first"
    await expect(
      session.provisioning!.provision(
        atIndex(snapshot.requirements, 0).requirementKey,
      ),
    ).resolves.toMatchObject({ certainty: "applied" })
    expect(deps.api).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        auth: expect.objectContaining({ cookie: expectedCookie }),
        cookieAuthSessionCookie: expectedCookie,
        cookieSession: {
          origin: account.site_url,
          cookieHeader: expectedCookie,
        },
      }),
      expect.anything(),
      false,
    )
    expect(inventoryCookies).toContain("session=expired")
    expect(inventoryCookies).toContain("session=first")
    expect(deps.login).toHaveBeenCalledOnce()
    expect(account.cookieAuth?.sessionCookie).toBe(expectedCookie)
    expect(request.auth.cookie).toBe("session=expired")
  },
)
