import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"

const root = "http://localhost:41672/safari1669native"
const profile =
  process.env.AAH_SAFARI_TEST_PROFILE ?? "All API Hub Safari Cookie Trial"
const stateFile = ".scratch/safari-native-cookie/normal-window.json"
// Apple Events and CGWindow use Safari's NSWindow number. Check the actual
// profile title before a login; never trust whichever window happens to be first.
const assertOwnedProfile = (id) => {
  assert(Number.isInteger(id))
  const result = spawnSync("swift", ["-"], {
    input: `import Foundation
import CoreGraphics
let items = CGWindowListCopyWindowInfo(.optionAll, kCGNullWindowID) as? [[String: Any]] ?? []
let target = items.first { ($0[kCGWindowOwnerName as String] as? String) == "Safari" && ($0[kCGWindowNumber as String] as? Int) == ${id} }
let title = target?[kCGWindowName as String] as? String ?? ""
print(title.hasPrefix(${JSON.stringify(profile)}) ? "owned" : "unverified")`,
    encoding: "utf8",
    timeout: 20000,
    env: {
      ...process.env,
      DEVELOPER_DIR: "/Applications/Xcode.app/Contents/Developer",
    },
  })
  assert.equal(result.status, 0, "Owned profile verification unavailable")
  assert.equal(result.stdout.trim(), "owned", "Owned Safari profile mismatch")
}
const apple = (script) => {
  const result = spawnSync("osascript", ["-"], {
    input: `with timeout of 15 seconds\n${script}\nend timeout`,
    encoding: "utf8",
    timeout: 20000,
  })
  // Do not print stderr: failed scripts can echo their input credentials.
  assert.equal(result.status, 0, "Safari script failed; details redacted")
  return result.stdout.trim()
}
const js = (id, source) =>
  apple(
    `tell application "Safari" to do JavaScript ${JSON.stringify(source)} in tab 1 of window id ${id}`,
  )
// Keep monitoring failures as classified evidence instead of losing the whole
// loop when a server sends a non-JSON error or the network briefly fails.
const monitor = (config, loginFirst) => {
  const fixture = config.accounts[2]
  return `(() => {
    if (window.__aahCookieTrial) window.__aahCookieTrial.active=false;
    const state = window.__aahCookieTrial = {login:false,checks:[],active:true,failed:false,complete:false};
    (async () => {
      if (${loginFirst}) {
        const response=await fetch('/api/user/login',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify(${JSON.stringify(fixture.browserLogin)}),signal:AbortSignal.timeout(10000)});
        const login=await response.json();
        state.login=response.ok && login.success && String(login.data?.id)===${JSON.stringify(fixture.id)};
        if (!state.login) {state.failed=true;return}
      }
      const until=Date.now()+90000;
      while(state.active && Date.now()<until) {
        const check={at:Date.now(),status:0,success:false,identity:'none',correct:false,error:'network'};
        try {
          const response=await fetch('/api/user/self',{credentials:'include',signal:AbortSignal.timeout(10000)});
          check.status=response.status;
          check.error='invalid-json';
          const body=await response.json();
          check.error='none';check.success=body.success===true;
          const index=${JSON.stringify(config.accounts.map((a) => a.id))}.findIndex(id=>id===String(body.data?.id));
          check.identity=index<0?(body.data?.id==null?'none':'other'):['A','B','C'][index];
          check.correct=response.ok && check.success && check.identity==='C';
          if (check.correct) state.login=true;
        } catch { /* No response bodies, error strings or credentials recorded. */ }
        check.at=Date.now();state.checks.push(check);
        await new Promise(r=>setTimeout(r,1000));
      }
      state.complete=true;
    })().catch(()=>{state.failed=true});
    return 'monitoring';
  })()`
}
const mode = process.argv[2]
if (mode === "start") {
  const configResponse = await fetch(root + "/real-config", {
    headers: {
      "x-native-trial-token": fs
        .readFileSync(".scratch/safari-native-cookie/real-nonce", "utf8")
        .trim(),
    },
  })
  assert(configResponse.ok, "Fixture unavailable")
  const config = await configResponse.json()
  const fixture = config.accounts[2]
  assert(fixture?.browserLogin, "Run-owned browser fixture required")
  const id = Number(
    apple(`tell application "Safari" to activate
tell application "System Events" to tell process "Safari"
click menu item "New ${profile} Window" of menu "File" of menu bar 1
end tell
delay 1
tell application "Safari" to return id of window 1`),
  )
  assert(Number.isInteger(id))
  assertOwnedProfile(id)
  fs.writeFileSync(stateFile, JSON.stringify({ id, profile }))
  apple(
    `tell application "Safari" to set URL of tab 1 of window id ${id} to ${JSON.stringify(fixture.baseUrl)}`,
  )
  const expected = new URL(fixture.baseUrl).origin
  let ready = false
  for (let i = 0; i < 30; i++) {
    try {
      ready =
        js(id, `String(location.origin === ${JSON.stringify(expected)})`) ===
        "true"
    } catch {
      /* Navigation is still pending. */
    }
    if (ready) break
    await new Promise((r) => setTimeout(r, 500))
  }
  assert(ready, "Owned browser tab origin mismatch")
  js(id, monitor(config, true))
  console.log(
    JSON.stringify({ ownedProfile: true, normalSafariTab: true, windowId: id }),
  )
} else if (mode === "resume") {
  const { id } = JSON.parse(fs.readFileSync(stateFile, "utf8"))
  assertOwnedProfile(id)
  const config = await (
    await fetch(root + "/real-config", {
      headers: {
        "x-native-trial-token": fs
          .readFileSync(".scratch/safari-native-cookie/real-nonce", "utf8")
          .trim(),
      },
    })
  ).json()
  js(id, monitor(config, false))
  console.log("owned browser checks resumed")
} else if (mode === "collect") {
  const { id } = JSON.parse(fs.readFileSync(stateFile, "utf8"))
  assertOwnedProfile(id)
  const result = JSON.parse(js(id, "JSON.stringify(window.__aahCookieTrial)"))
  assert(result && Array.isArray(result.checks), "Browser monitor missing")
  const destination = process.argv[3]
  assert(destination?.startsWith(".scratch/safari-native-cookie/"))
  assert(!fs.existsSync(destination), "Preserve previous monitor evidence")
  fs.writeFileSync(destination, JSON.stringify(result, null, 2))
  console.log(
    JSON.stringify({
      checks: result.checks.length,
      failures: result.checks.filter((c) => !c.correct).length,
      wrongIdentity: result.checks.filter((c) =>
        ["A", "B", "other"].includes(c.identity),
      ).length,
      complete: result.complete,
      failed: result.failed,
    }),
  )
} else if (mode === "observe") {
  const { id } = JSON.parse(fs.readFileSync(stateFile, "utf8"))
  assertOwnedProfile(id)
  const browser = JSON.parse(js(id, "JSON.stringify(window.__aahCookieTrial)"))
  const evidence = await (await fetch(root + "/status")).json()
  const begin = evidence.events.findLast((e) => e.stage === "real-site-start")
  const end = evidence.events.findLast((e) => e.stage === "real-site-result")
  assert(begin && end, "Native interval incomplete")
  const concurrent = browser.checks.filter(
    (c) => c.at >= begin.recordedAt && c.at <= end.recordedAt,
  )
  const result = {
    stage: "real-site-browser-concurrency",
    ownedProfile: true,
    normalSafariTab: true,
    loginSucceeded: browser.login,
    failed: browser.failed,
    concurrentChecks: concurrent.length,
    allConcurrentCorrect:
      concurrent.length > 0 && concurrent.every((c) => c.correct),
    beforeCorrect: browser.checks.some(
      (c) => c.at < begin.recordedAt && c.correct,
    ),
    afterCorrect: browser.checks.some(
      (c) => c.at > end.recordedAt && c.correct,
    ),
  }
  await fetch(root + "/event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(result),
  })
  console.log(JSON.stringify(result))
} else if (mode === "stop") {
  const { id } = JSON.parse(fs.readFileSync(stateFile, "utf8"))
  assertOwnedProfile(id)
  js(id, "window.__aahCookieTrial.active=false; 'stopped'")
  apple(`tell application "Safari" to close window id ${id}`)
  fs.unlinkSync(stateFile)
  console.log("owned normal-browser window closed")
} else throw new Error("Use start, resume, observe, collect or stop")
