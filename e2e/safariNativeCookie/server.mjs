import fs from "node:fs"
import http from "node:http"
import path from "node:path"

import { prepareRealSite } from "./realSite.mjs"
import { prepareSameSite } from "./sameSite.mjs"

const realConfig = process.env.AAH_SAFARI_REAL_TOKEN
  ? process.env.AAH_SAFARI_SAME_SITE === "1"
    ? await prepareSameSite()
    : await prepareRealSite()
  : null
const root = "/safari1669native"
const cookieName = "session"
const origin = "http://127.0.0.1:41672"
const observations = { requests: [], events: [] }
let command = "run"
let owner = null
const output =
  process.env.SAFARI_NATIVE_OBSERVATIONS ??
  ".scratch/safari-native-cookie/observations.json"
fs.mkdirSync(path.dirname(output), { recursive: true })
const save = () =>
  fs.writeFileSync(output, JSON.stringify(observations, null, 2))
const classify = (raw) => {
  const match = (raw ?? "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(cookieName + "="))
  const identity = match?.slice(cookieName.length + 1)
  return ["fixture-A", "fixture-B", "fixture-TAB", "fixture-SERVER"].includes(
    identity,
  )
    ? identity
    : identity
      ? "unknown"
      : "none"
}
const page = `<!doctype html><meta charset="utf-8"><title>Safari PR1669 isolation fixture</title><h1>Disposable Safari isolation fixture</h1><p>This tab represents the browser's synthetic logged-in account. No real credentials.</p><pre id="status"></pre><script>
let stopped=false; let n=0;setTimeout(()=>{stopped=true},180000);async function tick(){if(stopped)return;try{const r=await fetch('${root}/echo',{credentials:'include',headers:{'x-fixture-source':'tab'}});const d=await r.json();document.querySelector('#status').textContent='Browser fixture identity: '+d.identity+'; checks: '+(++n)}catch{}setTimeout(tick,75)};tick();
</script>`
const server = http
  .createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, X-Fixture-Source, X-Native-Trial-Token",
    )
    res.setHeader("Cache-Control", "no-store")
    if (req.method === "OPTIONS") {
      res.writeHead(204)
      res.end()
      return
    }
    if (req.url === root + "/reset-controller" && req.method === "POST") {
      if (
        !process.env.AAH_SAFARI_REAL_TOKEN ||
        req.headers["x-native-trial-token"] !==
          process.env.AAH_SAFARI_REAL_TOKEN
      ) {
        res.writeHead(403)
        res.end()
        return
      }
      // Use only after the previous controller tab/background has been closed.
      owner = null
      command = "run"
      observations.events.push({
        stage: "controller-reset",
        recordedAt: Date.now(),
      })
      save()
      res.end("ok")
      return
    }
    if (req.url.startsWith(root + "/claim?")) {
      const candidate = new URL(req.url, "http://127.0.0.1").searchParams.get(
        "owner",
      )
      if (
        !/^[0-9a-f-]{36}$/.test(candidate ?? "") ||
        (process.env.AAH_SAFARI_REAL_TOKEN &&
          req.headers["x-native-trial-token"] !==
            process.env.AAH_SAFARI_REAL_TOKEN)
      ) {
        res.writeHead(403)
        res.end()
        return
      }
      const accepted = owner === null
      if (accepted) owner = candidate
      res.setHeader("Content-Type", "application/json")
      res.end(JSON.stringify({ accepted }))
      return
    }
    if (req.url === root + "/real-config") {
      if (
        !realConfig ||
        req.headers["x-native-trial-token"] !==
          process.env.AAH_SAFARI_REAL_TOKEN ||
        (req.headers.origin != null &&
          !req.headers.origin.startsWith("safari-web-extension://"))
      ) {
        observations.events.push({
          stage: "real-config-denied",
          tokenMatches:
            req.headers["x-native-trial-token"] ===
            process.env.AAH_SAFARI_REAL_TOKEN,
          safariOrigin:
            req.headers.origin?.startsWith("safari-web-extension://") ?? false,
          originAbsent: !req.headers.origin,
        })
        save()
        res.writeHead(403)
        res.end()
        return
      }
      res.setHeader("Content-Type", "application/json")
      res.end(JSON.stringify(realConfig))
      return
    }
    if (req.url === root + "/browser") {
      res.setHeader(
        "Set-Cookie",
        `${cookieName}=fixture-TAB; Path=${root}/; SameSite=Lax`,
      )
      res.setHeader("Content-Type", "text/html")
      res.end(page)
      return
    }
    if ([root + "/temp-a", root + "/temp-b"].includes(req.url)) {
      res.setHeader("Content-Type", "text/html")
      res.end(
        "<!doctype html><title>PR1669 legacy temporary fixture</title><p>Disposable temporary account request tab.</p>",
      )
      return
    }
    if (req.url === root + "/cleanup") {
      res.setHeader("Set-Cookie", `${cookieName}=; Path=${root}/; Max-Age=0`)
      res.end("fixture cookie removed")
      return
    }
    if (
      [
        root + "/echo",
        root + "/set-cookie",
        root + "/redirect",
        root + "/redirect-target",
        root + "/hold",
        root + "/large",
        root + "/stall",
      ].includes(req.url)
    ) {
      const identity = classify(req.headers.cookie)
      const source = [
        "tab",
        "A",
        "B",
        "baseline",
        "after",
        "primitive",
      ].includes(req.headers["x-fixture-source"])
        ? req.headers["x-fixture-source"]
        : "other"
      const originKind =
        req.headers.origin === origin
          ? "fixture"
          : req.headers.origin?.startsWith("safari-web-extension:")
            ? "extension"
            : req.headers.origin
              ? "other"
              : "absent"
      const onlyFixtureCookie =
        (req.headers.cookie ?? "").trim() === `${cookieName}=${identity}`
      const record = {
        endpoint: req.url.slice(root.length),
        source,
        identity,
        originKind,
        onlyFixtureCookie,
        extensionMarkerPresent: !!req.headers["all-api-hub"],
      }
      observations.requests.push(record)
      save()
      res.setHeader("Content-Type", "application/json")
      if (req.url === root + "/set-cookie")
        res.setHeader(
          "Set-Cookie",
          `${cookieName}=fixture-SERVER; Path=${root}/; SameSite=Lax`,
        )
      if (req.url === root + "/redirect") {
        res.writeHead(302, { Location: root + "/redirect-target" })
        res.end()
        return
      }
      if (req.url === root + "/large") {
        res.end("x".repeat(600000))
        return
      }
      if (req.url === root + "/hold" || req.url === root + "/stall") {
        res.on("close", () => {
          observations.events.push({
            stage: "hold-close",
            beforeResponse: !res.writableFinished,
          })
          save()
        })
        setTimeout(
          () => res.end(JSON.stringify(record)),
          req.url === root + "/stall" ? 20000 : 1500,
        )
        return
      }
      res.end(JSON.stringify(record))
      return
    }
    if (req.url === root + "/event" && req.method === "POST") {
      let body = ""
      req.on("data", (x) => {
        if (body.length < 8192) body += x
      })
      req.on("end", () => {
        try {
          const d = JSON.parse(body)
          const clean = {}
          for (const [k, v] of Object.entries(d)) {
            if (!/^[A-Za-z][A-Za-z0-9]*$/.test(k)) continue
            if (typeof v === "boolean" || typeof v === "number") clean[k] = v
            else if (
              typeof v === "string" &&
              /^[A-Za-z0-9_.:-]{0,120}$/.test(v)
            )
              clean[k] = v
          }
          // Tie classified evidence to an exact server-request interval. A tab
          // changing state after completion must not rewrite the run's verdict.
          clean.requestCursor = observations.requests.length
          clean.recordedAt = Date.now()
          observations.events.push(clean)
          save()
          res.end("recorded")
        } catch {
          res.writeHead(400)
          res.end()
        }
      })
      return
    }
    if (req.url === root + "/status") {
      res.setHeader("Content-Type", "application/json")
      res.end(JSON.stringify(observations))
      return
    }
    if (req.url === root + "/control" && req.method === "POST") {
      let body = ""
      req.on("data", (chunk) => {
        if (body.length < 1024) body += chunk
      })
      req.on("end", () => {
        try {
          const value = JSON.parse(body).command
          if (
            ![
              "run",
              "permissions-ask",
              "permissions-deny",
              "permissions-allow",
              "permissions-revoke",
              "saved-accounts",
              "timeout",
              "hold-for-crash",
              "revoke-in-flight",
              "after-crash",
              "real-site",
              "permission-url-check",
              "real-ordinary",
              "ordinary-context",
              "product-seed",
              "product-observe",
              "product-service",
              "product-background",
              "product-cleanup",
              "native-admission",
            ].includes(value)
          )
            throw new Error()
          command = value
          res.end("ok")
        } catch {
          res.writeHead(400)
          res.end()
        }
      })
      return
    }
    if (req.url === root + "/control") {
      res.setHeader("Content-Type", "application/json")
      res.end(JSON.stringify({ command }))
      return
    }
    res.writeHead(404)
    res.end()
  })
  .listen(41672, "127.0.0.1", () => {
    save()
    console.log(
      "Synthetic isolation fixture on 127.0.0.1:41672; no raw headers logged",
    )
  })

let closing = false
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    if (closing) return
    closing = true
    server.close()
    try {
      await realConfig?.cleanup?.()
      observations.events.push({
        stage: "owned-backend-cleanup",
        confirmed: true,
      })
      save()
      process.exit(0)
    } catch {
      observations.events.push({
        stage: "owned-backend-cleanup",
        confirmed: false,
      })
      save()
      console.error(
        "Owned fixture cleanup incomplete; retain journal for recovery",
      )
      process.exit(1)
    }
  })
