import { createServer } from "node:http"

const TEST_SITE_KEYS = {
  interactive: "3x00000000000000000000FF",
  automatic: "1x00000000000000000000AA",
  failure: "2x00000000000000000000AB",
}
const TEST_SECRET = "1x0000000000000000000000000000000AA"
const DUMMY_TOKEN = "XXXX.DUMMY.TOKEN.XXXX"

/** Local page using Cloudflare's official component and published dummy keys. */
function renderPage(scenario) {
  const sitekey = TEST_SITE_KEYS[scenario]
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Turnstile test · ${scenario}</title>
<style>body{font:16px system-ui;max-width:640px;margin:48px auto;padding:24px;line-height:1.6}#status{white-space:pre-wrap}code{background:#eee;padding:2px 6px}</style>
</head><body><h1>Turnstile · ${scenario}</h1>
<p>This is a local test. It does not sign in or check in to any account.</p>
<p>Complete the official widget below. All API Hub will read its test token and send it to this local server for validation.</p>
<div id="challenge" class="cf-turnstile"></div><p id="status" role="status">Loading the official Turnstile component…</p>
<script>
window.onTurnstileReady = function () {
  window.turnstile.render('#challenge', {
    sitekey: '${sitekey}', execution: 'execute', retry: 'never',
    callback: function () { document.querySelector('#status').textContent = 'Test token ready. Waiting for the extension to continue…'; },
    'error-callback': function (code) { document.querySelector('#status').textContent = 'Widget error: ' + code; },
    'expired-callback': function () { document.querySelector('#status').textContent = 'Test token expired.'; }
  });
  document.querySelector('#status').textContent = 'Widget ready. The extension starts verification through the official execute API.';
};
</script>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileReady&render=explicit" async defer></script>
</body></html>`
}

/** Starts one independent origin; callers own its lifetime. */
export async function startTurnstileTestServer({
  port = 8787,
  fetchImpl = fetch,
} = {}) {
  const server = createServer((request, response) => {
    const json = (status, body) => {
      response.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      })
      response.end(JSON.stringify(body))
    }
    void (async () => {
      const url = new URL(request.url, "http://127.0.0.1")
      if (request.method === "GET" && url.pathname === "/") {
        const scenario = url.searchParams.get("scenario") || "interactive"
        if (!Object.hasOwn(TEST_SITE_KEYS, scenario))
          return json(400, { success: false, error: "Unknown test scenario" })
        response.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        })
        response.end(renderPage(scenario))
        return
      }
      if (request.method !== "POST" || url.pathname !== "/verify") {
        return json(404, { success: false, error: "Unknown test endpoint" })
      }
      let body = ""
      for await (const chunk of request) {
        body += chunk.toString()
        if (body.length > 8192)
          return json(413, { success: false, error: "Test request too large" })
      }
      let parsed
      try {
        parsed = JSON.parse(body)
      } catch {
        return json(400, {
          success: false,
          error: "Expected a JSON test token",
        })
      }
      if (parsed?.turnstile !== DUMMY_TOKEN) {
        return json(400, {
          success: false,
          error: "Only the official dummy token is accepted",
        })
      }
      const verified = await fetchImpl(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          body: new URLSearchParams({
            secret: TEST_SECRET,
            response: parsed.turnstile,
          }),
          signal: AbortSignal.timeout(15000),
        },
      )
      if (!verified.ok)
        return json(502, {
          success: false,
          error: "Cloudflare test validation is unavailable",
        })
      const result = await verified.json()
      json(result.success === true ? 200 : 422, {
        success: result.success === true,
        ...(result.success === true
          ? {
              message:
                "Official test token validated; no account mutation performed",
            }
          : { error: "Official test token validation failed" }),
      })
    })().catch(() =>
      json(502, {
        success: false,
        error: "Could not complete Cloudflare test validation",
      }),
    )
  })
  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, "127.0.0.1", resolve)
  })
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
        // Browsers preconnect without sending HTTP; these sockets otherwise
        // keep close() pending even after every test page has been closed.
        server.closeAllConnections()
      }),
  }
}
