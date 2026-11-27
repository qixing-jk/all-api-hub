import { createHash, createPublicKey, verify } from "node:crypto"
import http from "node:http"
import type { AddressInfo } from "node:net"
import { expect } from "@playwright/test"

/** Native-key fixture; it issues only simulated website sessions, never extension accounts. */
export async function createSub2ApiBrowserSessionFixture() {
  const hash = (value: string | Buffer) =>
    createHash("sha256").update(value).digest("base64url")
  const tokens = new Map<string, { id: number; binding: string }>()
  const state = {
    revoked: false,
    identityReads: 0,
    balance: 12.5,
    refreshRequests: 0,
  }
  const failures: string[] = []
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url!, "http://localhost")
    response.setHeader("Content-Type", "application/json")
    const send = (data: unknown) =>
      response.end(JSON.stringify({ code: 0, message: "success", data }))
    const reject = (reason: string) => {
      response.statusCode = 401
      response.end(JSON.stringify({ code: 401, reason, message: reason }))
    }
    const bytes: Buffer[] = []
    for await (const chunk of request) bytes.push(Buffer.from(chunk))
    const body = Buffer.concat(bytes)
    if (url.pathname === "/fixture/login") {
      const { jwk, id } = JSON.parse(body.toString())
      const binding = hash(
        JSON.stringify({ crv: "P-256", kty: "EC", x: jwk.x, y: jwk.y }),
      )
      const token = `e30.${Buffer.from(JSON.stringify({ cnf: { jkt: binding }, sub: String(id), exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.signature`
      tokens.set(token, { id, binding })
      return send({
        access_token: token,
        user: { id, username: `oauth-${id}`, balance: state.balance },
      })
    }
    if (url.pathname === "/api/v1/settings/public")
      return send({
        site_name: "Sub2API",
        password_login_enabled: false,
        github_oauth_enabled: true,
      })
    if (
      !url.pathname.startsWith("/api/") &&
      !url.pathname.startsWith("/checkin/")
    ) {
      response.setHeader("Content-Type", "text/html")
      return response.end(`<!doctype html><title>Sub2API</title><button id="login">Continue with OAuth</button><button id="switch">Switch account</button><p id="status"></p><script>
        async function login(id) {
          const db = await new Promise((resolve, reject) => { const r=indexedDB.open('sub2api-panel-proof-v2',1); r.onupgradeneeded=()=>r.result.createObjectStore('keys'); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error) });
          let pair = await new Promise(resolve=>{ const r=db.transaction('keys').objectStore('keys').get('browser-signing-key'); r.onsuccess=()=>resolve(r.result) });
          if (!pair) { pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']); await new Promise(resolve=>{ const t=db.transaction('keys','readwrite'); t.objectStore('keys').put(pair,'browser-signing-key'); t.oncomplete=resolve }) }
          db.close();
          const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);
          const {data}=await (await fetch('/fixture/login',{method:'POST',body:JSON.stringify({jwk,id})})).json();
          localStorage.setItem('auth_token',data.access_token); localStorage.setItem('auth_user',JSON.stringify(data.user)); localStorage.setItem('refresh_token','native-refresh'); localStorage.setItem('token_expires_at',String(Date.now()+3600000)); document.querySelector('#status').textContent='Signed in '+id;
        }
        document.querySelector('#login').onclick=()=>login(17); document.querySelector('#switch').onclick=()=>login(23);
      </script>`)
    }
    if (!url.pathname.startsWith("/api/v1/")) {
      response.statusCode = 404
      return response.end("{}")
    }
    if (url.pathname === "/api/v1/auth/refresh") state.refreshRequests++
    const token = String(request.headers.authorization ?? "").replace(
      /^Bearer /,
      "",
    )
    const session = tokens.get(token)
    const proof = String(request.headers["x-panel-proof"] ?? "")
    if (!proof) return reject("PANEL_PROOF_INVALID")
    try {
      const [head, payload, signature] = proof.split(".") as [
        string,
        string,
        string,
      ]
      const header = JSON.parse(Buffer.from(head, "base64url").toString())
      const claims = JSON.parse(Buffer.from(payload, "base64url").toString())
      const jwk = header.jwk
      expect(claims).toMatchObject({
        htm: request.method,
        htu: request.url,
        bht: hash(body),
        ath: hash(token),
        ct: String(request.headers["content-type"] ?? "").trim(),
      })
      expect(
        verify(
          "sha256",
          Buffer.from(`${head}.${payload}`),
          {
            key: createPublicKey({ key: jwk, format: "jwk" }),
            dsaEncoding: "ieee-p1363",
          },
          Buffer.from(signature, "base64url"),
        ),
      ).toBe(true)
      if (
        !session ||
        session.binding !==
          hash(JSON.stringify({ crv: "P-256", kty: "EC", x: jwk.x, y: jwk.y }))
      )
        return reject("PANEL_PROOF_INVALID")
      expect(request.headers.cookie).toBeUndefined()
    } catch (error) {
      failures.push(String(error))
      return reject("PANEL_PROOF_INVALID")
    }
    if (state.revoked && session.id === 17) return reject("TOKEN_EXPIRED")
    if (url.pathname === "/api/v1/auth/me") {
      state.identityReads++
      return send({
        id: session.id,
        username: `oauth-${session.id}`,
        balance: state.balance,
      })
    }
    if (url.pathname === "/api/v1/usage/stats")
      return send({
        total_actual_cost: 0,
        total_requests: 0,
        total_input_tokens: 0,
        total_output_tokens: 0,
      })
    return send([])
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return {
    origin,
    state,
    failures,
    async close() {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}
