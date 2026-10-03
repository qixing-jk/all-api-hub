import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it } from "vitest"

import { GRSAI_ENDPOINTS } from "~/services/apiService/grsai/constants"
import { computeGrsaiSignature } from "~/services/apiService/grsai/signature"
import {
  fetchGrsaiConsole,
  getGrsaiAccessToken,
  isGrsaiAuthFailureError,
  openGrsaiConsoleSession,
  type GrsaiConsoleSession,
} from "~/services/apiService/grsai/transport"
import { API_ERROR_CODES } from "~/services/apiTransport/errors"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"

import { GRSAI_SIGNATURE_MATERIAL } from "./signatureFixture"

const CONSOLE_ORIGIN = "https://eb.grsaiapi.com"

const request = {
  baseUrl: "https://grsai.com",
  auth: { authType: AuthTypeEnum.AccessToken, accessToken: "session-token" },
}

const session: GrsaiConsoleSession = {
  token: "rotated-session-token",
  material: GRSAI_SIGNATURE_MATERIAL,
  isAuth: true,
}

describe("grsai console transport", () => {
  it("rejects a missing account token before dispatching", async () => {
    const unauthenticated = {
      ...request,
      auth: { authType: AuthTypeEnum.AccessToken, accessToken: "" },
    }
    expect(getGrsaiAccessToken(unauthenticated)).toBe("")
    await expect(
      fetchGrsaiConsole(unauthenticated, GRSAI_ENDPOINTS.credits),
    ).rejects.toMatchObject({ statusCode: 401 })
  })

  it("rejects malformed signing configuration", async () => {
    server.use(
      http.post(`${CONSOLE_ORIGIN}${GRSAI_ENDPOINTS.config}`, () =>
        HttpResponse.json({ code: 0, data: {} }),
      ),
    )
    await expect(openGrsaiConsoleSession(request)).rejects.toMatchObject({
      code: API_ERROR_CODES.JSON_PARSE_ERROR,
    })
  })
  beforeEach(() => {
    server.resetHandlers()
  })

  it("returns the envelope payload on success", async () => {
    server.use(
      http.post(`${CONSOLE_ORIGIN}${GRSAI_ENDPOINTS.credits}`, () =>
        HttpResponse.json({ code: 0, data: { credits: 5000 }, msg: "success" }),
      ),
    )

    await expect(
      fetchGrsaiConsole(request, GRSAI_ENDPOINTS.credits),
    ).resolves.toEqual({ credits: 5000 })
  })

  it("sends the raw session token, not a bearer credential", async () => {
    let authorization: string | null = null
    server.use(
      http.post(
        `${CONSOLE_ORIGIN}${GRSAI_ENDPOINTS.credits}`,
        ({ request: req }) => {
          authorization = req.headers.get("authorization")
          return HttpResponse.json({ code: 0, data: {}, msg: "success" })
        },
      ),
    )

    await fetchGrsaiConsole(request, GRSAI_ENDPOINTS.credits)

    expect(authorization).toBe("session-token")
  })

  it("stays unsigned for reads even inside a session", async () => {
    let xtx: string | null = "unset"
    server.use(
      http.post(
        `${CONSOLE_ORIGIN}${GRSAI_ENDPOINTS.credits}`,
        ({ request: req }) => {
          xtx = req.headers.get("xtx")
          return HttpResponse.json({ code: 0, data: {}, msg: "success" })
        },
      ),
    )

    await fetchGrsaiConsole(request, GRSAI_ENDPOINTS.credits, {
      body: { page: 1 },
      session,
    })

    expect(xtx).toBeNull()
  })

  it("signs the body with the session material when asked", async () => {
    const body = { name: "example-key", type: 0 }
    const expected = await computeGrsaiSignature(GRSAI_SIGNATURE_MATERIAL, body)
    let seen: { xtx: string | null; authorization: string | null } = {
      xtx: null,
      authorization: null,
    }
    server.use(
      http.post(
        `${CONSOLE_ORIGIN}${GRSAI_ENDPOINTS.apiKeyCreate}`,
        ({ request: req }) => {
          seen = {
            xtx: req.headers.get("xtx"),
            authorization: req.headers.get("authorization"),
          }
          return HttpResponse.json({ code: 0, data: {}, msg: "success" })
        },
      ),
    )

    await fetchGrsaiConsole(request, GRSAI_ENDPOINTS.apiKeyCreate, {
      body,
      session,
      sign: true,
    })

    expect(seen.xtx).toBe(expected)
    expect(seen.authorization).toBe("rotated-session-token")
  })

  it("treats the empty-message unauthenticated code as an auth failure", async () => {
    server.use(
      http.post(`${CONSOLE_ORIGIN}${GRSAI_ENDPOINTS.userInfo}`, () =>
        HttpResponse.json({ code: -10000, data: null, msg: "" }),
      ),
    )

    const error = await fetchGrsaiConsole(
      request,
      GRSAI_ENDPOINTS.userInfo,
    ).catch((caught) => caught)

    expect(isGrsaiAuthFailureError(error)).toBe(true)
  })

  it("surfaces other console codes as business failures", async () => {
    server.use(
      http.post(`${CONSOLE_ORIGIN}${GRSAI_ENDPOINTS.apiKeyCreate}`, () =>
        HttpResponse.json({ code: -3, data: null, msg: "参数格式错误" }),
      ),
    )

    const error = await fetchGrsaiConsole(
      request,
      GRSAI_ENDPOINTS.apiKeyCreate,
      {
        body: {},
        session,
        sign: true,
      },
    ).catch((caught) => caught)

    expect(isGrsaiAuthFailureError(error)).toBe(false)
    expect(error).toMatchObject({
      code: API_ERROR_CODES.BUSINESS_ERROR,
      upstreamCode: "-3",
    })
  })

  it("rejects a token-less request without dispatching it", async () => {
    let dispatched = false
    server.use(
      http.post(`${CONSOLE_ORIGIN}${GRSAI_ENDPOINTS.credits}`, () => {
        dispatched = true
        return HttpResponse.json({ code: 0, data: {}, msg: "success" })
      }),
    )

    await expect(
      fetchGrsaiConsole(
        {
          baseUrl: "https://grsai.com",
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "  " },
        },
        GRSAI_ENDPOINTS.credits,
      ),
    ).rejects.toThrowError()
    expect(dispatched).toBe(false)
  })

  it("opens a session from the config exchange", async () => {
    server.use(
      http.post(
        `${CONSOLE_ORIGIN}${GRSAI_ENDPOINTS.config}`,
        async ({ request: req }) => {
          expect(await req.json()).toEqual({
            token: "session-token",
            referrer: "",
          })
          return HttpResponse.json({
            code: 0,
            msg: "success",
            data: {
              token: "rotated-session-token",
              kis: GRSAI_SIGNATURE_MATERIAL.kis,
              ra1: GRSAI_SIGNATURE_MATERIAL.ra1,
              ra2: GRSAI_SIGNATURE_MATERIAL.ra2,
              random: GRSAI_SIGNATURE_MATERIAL.random,
              isAuth: true,
            },
          })
        },
      ),
    )

    await expect(openGrsaiConsoleSession(request)).resolves.toEqual({
      token: "rotated-session-token",
      material: GRSAI_SIGNATURE_MATERIAL,
      isAuth: true,
    })
  })

  it("reports a signed-out config exchange as unauthenticated", async () => {
    server.use(
      http.post(`${CONSOLE_ORIGIN}${GRSAI_ENDPOINTS.config}`, () =>
        HttpResponse.json({
          code: 0,
          msg: "success",
          data: {
            token: "guest-token",
            kis: GRSAI_SIGNATURE_MATERIAL.kis,
            ra1: GRSAI_SIGNATURE_MATERIAL.ra1,
            ra2: GRSAI_SIGNATURE_MATERIAL.ra2,
            random: GRSAI_SIGNATURE_MATERIAL.random,
            isAuth: false,
          },
        }),
      ),
    )

    await expect(openGrsaiConsoleSession(request)).resolves.toMatchObject({
      isAuth: false,
    })
  })
})
