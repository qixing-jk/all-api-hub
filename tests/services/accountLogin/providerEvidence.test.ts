import { beforeEach, describe, expect, it, vi } from "vitest"

import { ACCOUNT_LOGIN_PROVIDERS } from "~/constants/accountLogin"
import { loginProviderEvidence } from "~/services/accountLogin/providerEvidence"
import { LOGIN_PROVIDER_EVIDENCE_OUTCOMES } from "~/types/loginProviderEvidence"

const { storageState } = vi.hoisted(() => ({
  storageState: { value: undefined as unknown, fail: false },
}))

vi.mock("@plasmohq/storage", () => ({
  Storage: class {
    async get() {
      if (storageState.fail) throw new Error("storage unavailable")
      return storageState.value
    }
    async set(_key: string, value: unknown) {
      if (storageState.fail) throw new Error("storage unavailable")
      storageState.value = value
    }
  },
}))

describe("login provider evidence store", () => {
  beforeEach(() => {
    storageState.value = undefined
    storageState.fail = false
  })

  it("reports no evidence when nothing was recorded yet", async () => {
    await expect(loginProviderEvidence.readAll()).resolves.toEqual({})
  })

  it("records and reads back one outcome per account", async () => {
    await loginProviderEvidence.record({
      accountId: "a",
      provider: ACCOUNT_LOGIN_PROVIDERS.Github,
      outcome: LOGIN_PROVIDER_EVIDENCE_OUTCOMES.Success,
      at: 10,
    })
    await loginProviderEvidence.record({
      accountId: "b",
      provider: ACCOUNT_LOGIN_PROVIDERS.LinuxDo,
      outcome: LOGIN_PROVIDER_EVIDENCE_OUTCOMES.IdentityMismatch,
      at: 20,
    })

    await expect(loginProviderEvidence.readAll()).resolves.toEqual({
      a: {
        provider: ACCOUNT_LOGIN_PROVIDERS.Github,
        outcome: LOGIN_PROVIDER_EVIDENCE_OUTCOMES.Success,
        at: 10,
      },
      b: {
        provider: ACCOUNT_LOGIN_PROVIDERS.LinuxDo,
        outcome: LOGIN_PROVIDER_EVIDENCE_OUTCOMES.IdentityMismatch,
        at: 20,
      },
    })
  })

  it("replaces the previous outcome for the same account", async () => {
    await loginProviderEvidence.record({
      accountId: "a",
      provider: ACCOUNT_LOGIN_PROVIDERS.Github,
      outcome: LOGIN_PROVIDER_EVIDENCE_OUTCOMES.IdentityMismatch,
      at: 10,
    })
    await loginProviderEvidence.record({
      accountId: "a",
      provider: ACCOUNT_LOGIN_PROVIDERS.Github,
      outcome: LOGIN_PROVIDER_EVIDENCE_OUTCOMES.Success,
      at: 20,
    })

    await expect(loginProviderEvidence.readAll()).resolves.toMatchObject({
      a: { outcome: LOGIN_PROVIDER_EVIDENCE_OUTCOMES.Success, at: 20 },
    })
  })

  it.each([
    [
      "an unknown provider",
      { provider: "untrusted", outcome: "success", at: 10 },
    ],
    ["an unknown outcome", { provider: "github", outcome: "maybe", at: 10 }],
    ["a missing timestamp", { provider: "github", outcome: "success" }],
    ["a non-record entry", "success"],
  ])("drops %s written by another shape", async (_case, entry) => {
    storageState.value = { a: entry }

    await expect(loginProviderEvidence.readAll()).resolves.toEqual({})
  })

  it("tolerates a stored value that is not a record", async () => {
    storageState.value = "corrupted"

    await expect(loginProviderEvidence.readAll()).resolves.toEqual({})
  })

  it("reports no evidence instead of rejecting when storage fails", async () => {
    storageState.value = {
      a: {
        provider: ACCOUNT_LOGIN_PROVIDERS.Github,
        outcome: LOGIN_PROVIDER_EVIDENCE_OUTCOMES.Success,
        at: 10,
      },
    }
    storageState.fail = true

    await expect(loginProviderEvidence.readAll()).resolves.toEqual({})
  })

  it("never fails the caller when a record cannot be written", async () => {
    storageState.fail = true

    await expect(
      loginProviderEvidence.record({
        accountId: "a",
        provider: ACCOUNT_LOGIN_PROVIDERS.Github,
        outcome: LOGIN_PROVIDER_EVIDENCE_OUTCOMES.Success,
      }),
    ).resolves.toBeUndefined()
  })

  it("stamps the current time when the caller omits one", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-02T03:04:05.000Z"))

    await loginProviderEvidence.record({
      accountId: "a",
      provider: ACCOUNT_LOGIN_PROVIDERS.Github,
      outcome: LOGIN_PROVIDER_EVIDENCE_OUTCOMES.Success,
    })

    await expect(loginProviderEvidence.readAll()).resolves.toMatchObject({
      a: { at: new Date("2026-01-02T03:04:05.000Z").getTime() },
    })
    vi.useRealTimers()
  })
})
