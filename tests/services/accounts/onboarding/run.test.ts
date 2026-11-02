import { expect, it, vi } from "vitest"

import { runAccountOnboarding } from "~/services/accounts/onboarding/run"
import type { AccountOnboardingSession } from "~/services/apiAdapters/contracts/accountOnboarding"
import type { AccountAutoDetectResponse } from "~/types/serviceResponse"

const verifiedResult: AccountAutoDetectResponse = {
  kind: "detected",
  success: false,
  message: "verified result",
}

function attempt(existing?: AccountAutoDetectResponse) {
  const stages: string[] = []
  const session: AccountOnboardingSession = {
    verifyExistingCredentials: vi.fn(async () => {
      stages.push("existing")
      return existing
    }),
    discoverIdentity: vi.fn(async () => {
      stages.push("identity")
    }),
    acquireCredentials: vi.fn(async () => {
      stages.push("credentials")
    }),
    verifyAccount: vi.fn(async () => {
      stages.push("verification")
      return verifiedResult
    }),
    fail: vi.fn(
      (): AccountAutoDetectResponse => ({
        kind: "detected",
        success: false,
        message: "safe failure",
      }),
    ),
  }
  const capability = { matchesUrl: () => true, createSession: () => session }
  return { stages, session, capability }
}

it("runs discovery, acquisition and final verification only after checking existing credentials", async () => {
  const { stages, capability } = attempt()
  expect(await runAccountOnboarding(capability, {})).toBe(verifiedResult)
  expect(stages).toEqual([
    "existing",
    "identity",
    "credentials",
    "verification",
  ])
})

it("stops on a terminal existing-credential result, including a rejected credential", async () => {
  const { stages, capability } = attempt(verifiedResult)
  expect(await runAccountOnboarding(capability, {})).toBe(verifiedResult)
  expect(stages).toEqual(["existing"])
})

it.each([
  "verifyExistingCredentials",
  "discoverIdentity",
  "acquireCredentials",
  "verifyAccount",
] as const)(
  "stops subsequent stages and sanitizes a failure in %s",
  async (stage) => {
    const { session, capability, stages } = attempt()
    const error = new Error("private upstream detail")
    vi.mocked(session[stage]!).mockRejectedValueOnce(error)
    expect(await runAccountOnboarding(capability, {})).toMatchObject({
      success: false,
      message: "safe failure",
    })
    expect(session.fail).toHaveBeenCalledWith(error)
    expect(stages).toEqual(
      ["existing", "identity", "credentials", "verification"].slice(
        0,
        [
          "verifyExistingCredentials",
          "discoverIdentity",
          "acquireCredentials",
          "verifyAccount",
        ].indexOf(stage),
      ),
    )
  },
)

it("verifies a discovered durable credential without an issuance stage", async () => {
  const { stages, session, capability } = attempt()
  delete session.acquireCredentials
  expect(await runAccountOnboarding(capability, {})).toBe(verifiedResult)
  expect(stages).toEqual(["existing", "identity", "verification"])
})
