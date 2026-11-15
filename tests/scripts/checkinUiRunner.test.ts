import { spawnSync } from "node:child_process"
import path from "node:path"
import { describe, expect, it } from "vitest"

import {
  summarizeClaimResponse,
  verifyDetectedIdentity,
} from "~~/scripts/test-xingya-session-checkin-e2e-live.mjs"

const script = path.resolve("scripts/test-xingya-session-checkin-e2e-live.mjs")
const run = (args: string[]) =>
  spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    timeout: 15_000,
    env: {
      ...process.env,
      CDP_URL: "http://127.0.0.1:1",
      XINGYA_USERNAME: "",
      XINGYA_PASSWORD: "",
      XINGYA_USER_ID: "",
    },
  })

describe("check-in UI acceptance command", () => {
  it("does not claim identity correctness without an independent expected account", () => {
    expect(
      verifyDetectedIdentity({ username: "someone", userId: "12" }),
    ).toMatchObject({ skipped: true })
    expect(() =>
      verifyDetectedIdentity(
        { username: "wrong", userId: "13" },
        { username: "someone", userId: 12 },
      ),
    ).toThrow()
    expect(
      verifyDetectedIdentity(
        { username: "someone", userId: "12" },
        { username: "someone", userId: 12 },
      ),
    ).toBeUndefined()
  })

  it("observes native PoW query parameters without storing their values", () => {
    const observation = summarizeClaimResponse(
      new URL(
        "https://example.com/api/user/checkin?pow_challenge=secret-challenge&pow_nonce=42",
      ),
      { success: true },
      null,
      200,
    )
    expect(observation.powObserved).toBe(true)
    expect(JSON.stringify(observation)).not.toContain("secret-challenge")
  })
  it("describes the UI workflow and incomplete first-claim coverage without connecting", () => {
    const result = run(["--help"])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("--site=all|xingya|runanytime")
    expect(result.stdout).toContain("already checked")
    expect(result.stdout).toContain("Exit: 0")
    expect(result.stdout).toContain("2 incomplete")
  })

  it.each([
    "--account-id=fixture",
    "--method-id=xingya:daily-checkin",
    "--cold-login",
  ])(
    "rejects unsupported setup overrides before browser access: %s",
    (flag) => {
      const result = run(["--isolate", "--check-in", flag])
      expect(result.status).toBe(1)
      expect(result.stderr).toContain("Unknown option")
    },
  )
})
