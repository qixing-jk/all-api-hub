import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { expect, it } from "vitest"

function run(...args: string[]) {
  return spawnSync(process.execPath, ["scripts/e2e-cdp-control.mjs", ...args], {
    encoding: "utf8",
    timeout: 10_000,
    env: { ...process.env, AAH_SHARED_ENV: "0", CDP_URL: "http://127.0.0.1:1" },
  })
}

it("lists reusable scenarios without opening or requiring a browser", () => {
  const result = run("--list")
  expect(result.status, result.stderr).toBe(0)
  expect(
    JSON.parse(result.stdout).map((scenario: { id: string }) => scenario.id),
  ).toEqual(["options", "account", "models", "key-editor"])
})

it("rejects an unknown requested scenario before connecting to a browser", () => {
  const result = run("--scenario=typo")
  expect(result.status).toBe(1)
  expect(result.stderr).toContain("Unknown UI scenario: typo")
  expect(result.stderr).not.toContain("无法连接")
})

it("rejects an empty field label before opening an editor", () => {
  const result = run("--scenario=key-editor", "--field=  ")
  expect(result.status).toBe(1)
  expect(result.stderr).toContain("field labels must not be empty")
})

it("writes an incomplete report when browser connection fails", () => {
  const result = run("--scenario=options")
  expect(result.status).toBe(1)
  expect(result.stdout).toContain("CDP UI report:")
  const reportPath = result.stdout.match(/CDP UI report: (.+)/)![1]!.trim()
  const report = JSON.parse(readFileSync(reportPath, "utf8"))
  expect(report).toMatchObject({
    ok: false,
    scenarios: [
      { id: "options", status: "not_run" },
      { id: "account", status: "not_selected" },
      { id: "models", status: "not_selected" },
      { id: "key-editor", status: "not_selected" },
    ],
  })
  expect(report.setupError).toContain("CDP")
})
