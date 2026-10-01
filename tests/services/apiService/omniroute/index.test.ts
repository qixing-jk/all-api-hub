import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it } from "vitest"

import {
  isOmniRouteAccessToken,
  OMNIROUTE_BUILTIN_PROVIDER_BASE_URLS,
  OMNIROUTE_DEFAULT_BUILTIN_PROVIDER,
  resolveOmniRouteBuiltinProvider,
} from "~/constants/omniroute"
import {
  classifyOmniRouteAuthFailure,
  fetchOmniRouteWhoAmI,
  hasOmniRouteAdminScope,
  mintOmniRouteAccessToken,
  OMNIROUTE_AUTH_FAILURE_REASONS,
  readOmniRouteScopeShortfall,
} from "~/services/apiService/omniroute"
import { listOmniRouteModelProviderIds } from "~/services/apiService/omniroute/models"
import {
  createOmniRouteConnection,
  deleteOmniRouteConnection,
  getOmniRouteConnection,
  listAllOmniRouteConnections,
  listOmniRouteConnections,
  listOmniRouteConnectionSecrets,
  updateOmniRouteConnection,
} from "~/services/apiService/omniroute/providers"
import {
  OMNIROUTE_SECRET_STATES,
  toOmniRouteSanitizedConnection,
} from "~/services/apiService/omniroute/redaction"
import { OmniRouteApiError } from "~/services/apiService/omniroute/request"
import { server } from "~~/tests/msw/server"

const BASE_URL = "https://omniroute.example.invalid"
const config = { baseUrl: `${BASE_URL}/`, token: "oma_live_example" }

const connection = (overrides: Record<string, unknown> = {}) => ({
  id: "conn-1",
  provider: "openai",
  name: "Primary",
  apiKey: "sk-aaaaaaa****bbbb",
  providerSpecificData: { baseUrl: "https://relay.example.invalid/v1" },
  defaultModel: "gpt-example",
  isActive: true,
  ...overrides,
})

describe("OmniRoute transport", () => {
  beforeEach(() => {
    server.resetHandlers()
  })

  it("trims a trailing slash and joins one path segment", async () => {
    let seenUrl = ""
    let seenAuth = ""
    server.use(
      http.get(`${BASE_URL}/api/providers`, ({ request }) => {
        seenUrl = request.url
        seenAuth = request.headers.get("authorization") ?? ""
        return HttpResponse.json({ connections: [], total: 0 })
      }),
    )

    await listOmniRouteConnections(config)

    expect(seenUrl).toBe(`${BASE_URL}/api/providers`)
    expect(seenAuth).toBe(`Bearer ${config.token}`)
  })

  it("walks every page of the connection inventory exactly once", async () => {
    const first = Array.from({ length: 200 }, (_, index) =>
      connection({ id: `conn-${index}` }),
    )
    const offsets: string[] = []
    server.use(
      http.get(`${BASE_URL}/api/providers`, ({ request }) => {
        const offset = new URL(request.url).searchParams.get("offset") ?? ""
        offsets.push(offset)
        return HttpResponse.json({
          connections:
            offset === "200" ? [connection({ id: "conn-200" })] : first,
          total: 201,
        })
      }),
    )

    const connections = await listAllOmniRouteConnections(config)

    expect(offsets).toEqual(["0", "200"])
    expect(connections).toHaveLength(201)
    expect(new Set(connections.map((item) => item.id)).size).toBe(201)
  })

  it("creates a connection with the base URL override and no reachability-only fields", async () => {
    let body: Record<string, unknown> | undefined
    server.use(
      http.post(`${BASE_URL}/api/providers`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ connection: connection() }, { status: 201 })
      }),
    )

    await createOmniRouteConnection(config, {
      provider: OMNIROUTE_DEFAULT_BUILTIN_PROVIDER,
      name: "Imported (auto)",
      apiKey: "sk-source",
      defaultModel: "gpt-example",
      providerSpecificData: { baseUrl: "https://relay.example.invalid/v1" },
    })

    expect(body).toEqual({
      provider: "openai",
      name: "Imported (auto)",
      apiKey: "sk-source",
      defaultModel: "gpt-example",
      providerSpecificData: { baseUrl: "https://relay.example.invalid/v1" },
    })
    // The create route forces `isActive: false` and rejects the field outright.
    expect(body).not.toHaveProperty("isActive")
  })

  it("never routes a create through the bulk or import endpoints", async () => {
    const forbidden: string[] = []
    server.use(
      http.post(`${BASE_URL}/api/providers`, () =>
        HttpResponse.json({ connection: connection() }, { status: 201 }),
      ),
      http.post(`${BASE_URL}/api/providers/bulk`, () => {
        forbidden.push("bulk")
        return HttpResponse.json({}, { status: 200 })
      }),
      http.post(`${BASE_URL}/api/providers/import`, () => {
        forbidden.push("import")
        return HttpResponse.json({}, { status: 200 })
      }),
    )

    await createOmniRouteConnection(config, {
      provider: "openai",
      name: "Imported (auto)",
      apiKey: "sk-source",
    })

    expect(forbidden).toEqual([])
  })

  it("patches only the supplied fields", async () => {
    let body: Record<string, unknown> | undefined
    server.use(
      http.patch(`${BASE_URL}/api/providers/conn-1`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ connection: connection() })
      }),
    )

    await updateOmniRouteConnection(config, "conn-1", { isActive: false })

    expect(body).toEqual({ isActive: false })
  })

  it("reads one connection and deletes by id", async () => {
    const seen: string[] = []
    server.use(
      http.get(`${BASE_URL}/api/providers/conn-1`, () => {
        seen.push("get")
        return HttpResponse.json({ connection: connection() })
      }),
      http.delete(`${BASE_URL}/api/providers/conn-1`, () => {
        seen.push("delete")
        return new HttpResponse(null, { status: 204 })
      }),
    )

    const detail = await getOmniRouteConnection(config, "conn-1")
    await deleteOmniRouteConnection(config, "conn-1")

    expect(detail.id).toBe("conn-1")
    expect(seen).toEqual(["get", "delete"])
  })

  it("reports a non-JSON success body as an invalid connection", async () => {
    server.use(
      http.get(`${BASE_URL}/api/providers/conn-1`, () =>
        HttpResponse.json({ ok: true }),
      ),
    )

    const error = await getOmniRouteConnection(config, "conn-1").catch(
      (failure: unknown) => failure,
    )

    expect(error).toBeInstanceOf(OmniRouteApiError)
    expect((error as OmniRouteApiError).status).toBe(200)
  })

  it("keeps the 5xx mutation certainty evidence", async () => {
    server.use(
      http.post(`${BASE_URL}/api/providers`, () =>
        HttpResponse.json(
          { error: "Failed to create provider" },
          { status: 500 },
        ),
      ),
    )

    const error = (await createOmniRouteConnection(config, {
      provider: "openai",
      name: "Imported (auto)",
      apiKey: "sk-source",
    }).catch((failure: unknown) => failure)) as OmniRouteApiError

    expect(error.status).toBe(500)
    expect(error.dispatch).toBe("dispatched")
    expect(error.responseReceived).toBe(true)
    expect(error.confirmedNonApplication).toBe(false)
  })

  it("surfaces the gateway's rejection message", async () => {
    server.use(
      http.post(`${BASE_URL}/api/providers`, () =>
        HttpResponse.json(
          { error: "A connection with this name already exists" },
          { status: 409 },
        ),
      ),
    )

    const error = (await createOmniRouteConnection(config, {
      provider: "openai",
      name: "Imported (auto)",
      apiKey: "sk-source",
    }).catch((failure: unknown) => failure)) as OmniRouteApiError

    expect(error.status).toBe(409)
    expect(error.message).toBe("A connection with this name already exists")
    // A 4xx is proof the write did not apply.
    expect(error.confirmedNonApplication).toBe(true)
  })

  it("reads plaintext credentials only through the explicit client route", async () => {
    const readPaths: string[] = []
    server.use(
      http.get(`${BASE_URL}/api/providers`, ({ request }) => {
        readPaths.push(new URL(request.url).pathname)
        return HttpResponse.json({ connections: [connection()] })
      }),
      http.get(`${BASE_URL}/api/providers/client`, ({ request }) => {
        readPaths.push(new URL(request.url).pathname)
        return HttpResponse.json({
          connections: [connection({ apiKey: "sk-plaintext-value" })],
        })
      }),
    )

    const listed = await listOmniRouteConnections(config)
    expect(readPaths).toEqual(["/api/providers"])
    const secrets = await listOmniRouteConnectionSecrets(config)
    expect(readPaths).toEqual(["/api/providers", "/api/providers/client"])

    // The projection is the only shape allowed to reach the UI.
    const sanitized = toOmniRouteSanitizedConnection(secrets[0]!)
    expect(sanitized.secretState).toBe(OMNIROUTE_SECRET_STATES.Available)
    expect(JSON.stringify(sanitized)).not.toContain("sk-plaintext-value")
    expect(JSON.stringify(listed)).not.toContain("sk-plaintext-value")
  })

  it("reports the catalogue's provider ids", async () => {
    server.use(
      http.get(`${BASE_URL}/api/models`, () =>
        HttpResponse.json({
          models: [
            { provider: "openai", model: "gpt-example" },
            { provider: "anthropic", model: "claude-example" },
            { provider: "openai", model: "gpt-other" },
          ],
        }),
      ),
    )

    await expect(listOmniRouteModelProviderIds(config)).resolves.toEqual([
      "anthropic",
      "openai",
    ])
  })
})

describe("OmniRoute authentication", () => {
  beforeEach(() => {
    server.resetHandlers()
  })

  it("reports the token scope from whoami", async () => {
    server.use(
      http.get(`${BASE_URL}/api/cli/whoami`, () =>
        HttpResponse.json({
          authenticated: true,
          viaAccessToken: true,
          scope: "admin",
        }),
      ),
    )

    const whoAmI = await fetchOmniRouteWhoAmI(config)

    expect(hasOmniRouteAdminScope(whoAmI)).toBe(true)
  })

  it("mints an admin-scoped token from the panel password", async () => {
    let body: Record<string, unknown> | undefined
    server.use(
      http.post(`${BASE_URL}/api/cli/connect`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({
          success: true,
          token: "oma_live_minted",
          id: "tok-1",
          name: "All API Hub",
          scope: "admin",
        })
      }),
    )

    const minted = await mintOmniRouteAccessToken({
      baseUrl: config.baseUrl,
      password: "panel-password",
      name: "All API Hub",
    })

    expect(minted.token).toBe("oma_live_minted")
    expect(body).toEqual({
      password: "panel-password",
      name: "All API Hub",
      scope: "admin",
    })
  })

  it("treats a rejected password exchange as the default-password gate", async () => {
    server.use(
      http.post(`${BASE_URL}/api/cli/connect`, () =>
        HttpResponse.json(
          {
            error:
              "The management password is still set to the well-known default. " +
              "Pair the CLI from the host itself (loopback) and rotate the password first.",
          },
          { status: 403 },
        ),
      ),
    )

    const error = await mintOmniRouteAccessToken({
      baseUrl: config.baseUrl,
      password: "admin",
      name: "All API Hub",
    }).catch((failure: unknown) => failure)

    expect(classifyOmniRouteAuthFailure(error, "password")).toBe(
      OMNIROUTE_AUTH_FAILURE_REASONS.DefaultPasswordRejected,
    )
  })

  it("distinguishes an insufficient scope from a wrong credential", async () => {
    server.use(
      http.get(`${BASE_URL}/api/providers`, () =>
        HttpResponse.json(
          {
            error:
              "Access token scope 'write' is insufficient; 'admin' required.",
          },
          { status: 403 },
        ),
      ),
    )

    const error = await listOmniRouteConnections(config).catch(
      (failure: unknown) => failure,
    )

    expect(classifyOmniRouteAuthFailure(error, "token")).toBe(
      OMNIROUTE_AUTH_FAILURE_REASONS.InsufficientScope,
    )
    expect(readOmniRouteScopeShortfall((error as Error).message)).toEqual({
      have: "write",
      need: "admin",
    })
  })

  it("classifies an expired token as an invalid credential", async () => {
    server.use(
      http.get(`${BASE_URL}/api/providers`, () =>
        HttpResponse.json(
          { error: "Invalid management token" },
          { status: 401 },
        ),
      ),
    )

    const error = await listOmniRouteConnections(config).catch(
      (failure: unknown) => failure,
    )

    expect(classifyOmniRouteAuthFailure(error, "token")).toBe(
      OMNIROUTE_AUTH_FAILURE_REASONS.InvalidCredential,
    )
  })

  it("does not classify an auth-backend outage as a credential problem", async () => {
    server.use(
      http.get(`${BASE_URL}/api/providers`, () =>
        HttpResponse.json({ error: "unavailable" }, { status: 503 }),
      ),
    )

    const error = await listOmniRouteConnections(config).catch(
      (failure: unknown) => failure,
    )

    expect(classifyOmniRouteAuthFailure(error, "token")).toBeNull()
  })
})

describe("OmniRoute built-in provider catalogue", () => {
  it("recognises scoped access tokens", () => {
    expect(isOmniRouteAccessToken("oma_live_example")).toBe(true)
    expect(isOmniRouteAccessToken("panel-password")).toBe(false)
  })

  it("maps a known provider endpoint to its built-in provider id", () => {
    expect(resolveOmniRouteBuiltinProvider("https://api.deepseek.com")).toBe(
      "deepseek",
    )
    expect(resolveOmniRouteBuiltinProvider("https://api.openai.com/v1/")).toBe(
      "openai",
    )
    expect(
      resolveOmniRouteBuiltinProvider("https://api.anthropic.com/v1/messages"),
    ).toBe("anthropic")
  })

  it("leaves an unknown relay unresolved so the caller can override the base URL", () => {
    expect(
      resolveOmniRouteBuiltinProvider("https://relay.example.invalid/v1"),
    ).toBeNull()
  })

  it("keeps every catalogue entry reachable and non-empty", () => {
    for (const [providerId, roots] of Object.entries(
      OMNIROUTE_BUILTIN_PROVIDER_BASE_URLS,
    )) {
      expect(providerId).not.toBe("")
      expect(roots.length).toBeGreaterThan(0)
      for (const root of roots) {
        expect(resolveOmniRouteBuiltinProvider(root)).toBe(providerId)
      }
    }
  })
})
