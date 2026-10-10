import { randomUUID } from "node:crypto"
import { createServer } from "node:http"

import { resolveRealSiteUpstream } from "../../utils/real-site-upstream.mjs"

export const MAGPIE_TEST_MODELS = ["aah-e2e-model-a", "aah-e2e-model-b"]

/** Model discovery is deterministic; no paid inference or management response is mocked. */
async function startMagpieModelFixture() {
  const apiKey = `sk-fixture-${randomUUID()}`
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json")
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader(
      "Access-Control-Allow-Headers",
      "authorization,content-type,x-api-key,anthropic-version",
    )
    if (req.method === "OPTIONS") {
      res.writeHead(204)
      res.end()
      return
    }
    if (req.method !== "GET" || !req.url?.split("?")[0].endsWith("/models")) {
      res.writeHead(404)
      res.end(JSON.stringify({ error: "Model-list fixture only" }))
      return
    }
    if (req.headers.authorization !== `Bearer ${apiKey}`) {
      res.writeHead(401)
      res.end(JSON.stringify({ error: "Invalid fixture API key" }))
      return
    }
    res.end(
      JSON.stringify({
        object: "list",
        data: MAGPIE_TEST_MODELS.map((id) => ({ id, object: "model" })),
      }),
    )
  })
  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  return {
    config: { baseUrl: `http://127.0.0.1:${server.address().port}/v1`, apiKey },
    async close() {
      server.closeAllConnections()
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    },
  }
}

/** Only same-machine backends can use the automatically started fixture. */
export async function resolveMagpieUpstream(baseUrl, env = process.env) {
  const source = resolveRealSiteUpstream(env)
  if (source.config || source.missingEnvKeys.length !== 2)
    return { config: source.config, close: async () => {} }
  if (["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseUrl).hostname))
    return startMagpieModelFixture()
  return { config: null, close: async () => {} }
}
