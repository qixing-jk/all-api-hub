import type { BrowserContext } from "@playwright/test"

export const OCTOPUS_IMPORT_ORIGIN = "https://octopus-import.example.invalid"

type OctopusVersion = "jwt" | "v0.12" | "v0.13"
type Channel = Record<string, unknown> & { id: number; name: string }

/** Raw upstream contracts, kept independent of the production Octopus codecs. */
export async function stubOctopusChannelImport(params: {
  context: BrowserContext
  version: OctopusVersion
  models?: string[]
}) {
  const channels: Channel[] = []
  const models = params.models ?? ["gpt-4o-mini", "gpt-4.1-mini"]
  const createPayloads: Record<string, unknown>[] = []
  let detailReads = 0
  let modelProbes = 0
  const jwt = "fixture-octopus-jwt"
  const cookie = "auth=fixture-octopus-session"

  await params.context.route(`${OCTOPUS_IMPORT_ORIGIN}/**`, async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    const fulfill = (data: unknown) =>
      route.fulfill({ json: { code: 200, data } })

    if (path === "/api/v1/user/login" && method === "POST") {
      await route.fulfill({
        headers: {
          "access-control-allow-credentials": "true",
          "access-control-allow-origin": request.headers().origin ?? "null",
          ...(params.version === "jwt"
            ? {}
            : { "set-cookie": `${cookie}; Path=/; Secure; SameSite=None` }),
        },
        json: {
          code: 200,
          data:
            params.version === "jwt"
              ? {
                  token: jwt,
                  expire_at: new Date(Date.now() + 900_000).toISOString(),
                }
              : "login successfully",
        },
      })
      return
    }
    // A read-only page hosts the same-origin cookie transport.
    if (path === "/api/v1/user/status") {
      await route.fulfill({ status: 401, json: { code: 401 } })
      return
    }
    const authenticated =
      params.version === "jwt"
        ? request.headers().authorization === `Bearer ${jwt}`
        : request.headers().cookie?.includes(cookie)
    if (!authenticated) {
      await route.fulfill({ status: 401, json: { code: 401 } })
      return
    }

    if (path === "/api/v1/channel/list" && method === "GET") {
      if (params.version === "v0.13") {
        await route.fulfill({
          status: 404,
          body: "Use channel stats and detail",
        })
      } else {
        await fulfill(channels)
      }
      return
    }
    if (
      path === "/api/v1/channel/stats" &&
      method === "GET" &&
      params.version === "v0.13"
    ) {
      // Stats deliberately omit keys and URLs, as real v0.13 releases do.
      await fulfill(
        channels.map((channel) => ({
          channel_id: channel.id,
          channel_name: channel.name,
          enabled: channel.enabled,
          input_token: 0,
          output_token: 0,
          input_cost: 0,
          output_cost: 0,
          wait_time: 0,
          request_success: 0,
          request_failed: 0,
          models: [],
        })),
      )
      return
    }
    const detailId = path.match(/^\/api\/v1\/channel\/detail\/(\d+)$/u)?.[1]
    if (detailId && method === "GET" && params.version === "v0.13") {
      detailReads += 1
      const channel = channels.find(
        (channel) => channel.id === Number(detailId),
      )
      if (channel) await fulfill(channel)
      else await route.fulfill({ status: 404, json: { code: 404 } })
      return
    }
    if (path === "/api/v1/channel/create" && method === "POST") {
      const payload = request.postDataJSON()
      createPayloads.push(payload)
      const id = 71 + createPayloads.length
      const channel: Channel = {
        proxy: false,
        auto_sync: true,
        custom_header: [],
        ...payload,
        id,
        ...(params.version === "v0.12"
          ? // v0.12 trims the protocol version suffix on persistence.
            { base_url: payload.base_url.replace(/\/v1$/u, "") }
          : params.version === "jwt"
            ? {
                keys: payload.keys.map(
                  (key: Record<string, unknown>, index: number) => ({
                    ...key,
                    id: index + 1,
                    channel_id: id,
                  }),
                ),
              }
            : {}),
      }
      channels.push(channel)
      await fulfill(channel)
      return
    }
    if (path === "/api/v1/channel/fetch-model" && method === "POST") {
      modelProbes += 1
      const payload = request.postDataJSON()
      const baseUrl =
        payload.channel?.base_url ??
        payload.base_url ??
        payload.base_urls?.[0]?.url
      const key = payload.key ?? payload.keys?.[0]?.channel_key
      const validUrl =
        params.version === "v0.13"
          ? baseUrl === "https://example.com" &&
            payload.channel?.openai_chat_completion_path ===
              "/v1/chat/completions"
          : params.version === "v0.12"
            ? ["https://example.com", "https://example.com/v1"].includes(
                baseUrl,
              )
            : baseUrl === "https://example.com/v1"
      if (
        !validUrl ||
        typeof key !== "string" ||
        !key.startsWith("sk-created-")
      ) {
        await route.fulfill({
          status: 400,
          json: { code: 400, message: "Invalid model request URL or key" },
        })
        return
      }
      await fulfill(
        params.version === "v0.13" ? models.map((name) => ({ name })) : models,
      )
      return
    }
    const deleteId = path.match(/^\/api\/v1\/channel\/delete\/(\d+)$/u)?.[1]
    if (deleteId && method === "DELETE") {
      const index = channels.findIndex(
        (channel) => channel.id === Number(deleteId),
      )
      if (index >= 0) channels.splice(index, 1)
      await fulfill(null)
      return
    }
    await route.fulfill({
      status: 404,
      body: `Unexpected fixture route: ${method} ${path}`,
    })
  })

  return {
    createPayloads,
    getDetailReads: () => detailReads,
    getModelProbes: () => modelProbes,
    getRemainingChannelCount: () => channels.length,
  }
}
