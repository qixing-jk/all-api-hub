import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  captureRepairCreatedRuntimeSecrets,
  discardRepairCreatedRuntimeSecrets,
  resetRepairCreatedRuntimeSecrets,
  resolveRepairCreatedRuntimeSecret,
} from "~/services/accounts/accountKeyAutoProvisioning/repairCreatedRuntimeSecrets"
import { ACCOUNT_KEY_AUTO_PROVISIONING_STORAGE_KEYS } from "~/services/core/storageKeys"

const mocks = vi.hoisted(() => {
  const sessionStorage = new Map<string, unknown>()
  return {
    sessionStorage,
    loggerWarn: vi.fn(),
    getSessionStorageValues: vi.fn(async (key: string) =>
      sessionStorage.has(key) ? { [key]: sessionStorage.get(key) } : {},
    ),
    setSessionStorageValues: vi.fn(async (values: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(values)) {
        sessionStorage.set(key, value)
      }
      return true
    }),
  }
})

vi.mock("~/utils/browser/browserApi", () => ({
  getSessionStorageValues: mocks.getSessionStorageValues,
  setSessionStorageValues: mocks.setSessionStorageValues,
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: vi.fn(() => ({
    warn: mocks.loggerWarn,
  })),
}))

const REF = {
  accountId: "account-example",
  siteType: SITE_TYPES.NEW_API,
  scopeKey: "account",
  resourceId: "resource-example",
} as const

describe("repairCreatedRuntimeSecrets", () => {
  beforeEach(() => {
    mocks.sessionStorage.clear()
    mocks.getSessionStorageValues.mockClear()
    mocks.setSessionStorageValues.mockClear()
    mocks.loggerWarn.mockClear()
  })

  it("keeps exact repair-created secrets in memory-only session storage", async () => {
    await expect(resetRepairCreatedRuntimeSecrets("job-example")).resolves.toBe(
      true,
    )
    await expect(
      captureRepairCreatedRuntimeSecrets("job-example", [
        { ref: REF, secret: "sk-example-transient-secret" },
      ]),
    ).resolves.toBe(true)

    await expect(
      resolveRepairCreatedRuntimeSecret("job-example", REF),
    ).resolves.toBe("sk-example-transient-secret")
    await expect(
      resolveRepairCreatedRuntimeSecret("other-job", REF),
    ).resolves.toBeNull()
    await expect(
      resolveRepairCreatedRuntimeSecret("job-example", {
        ...REF,
        scopeKey: "other-scope",
      }),
    ).resolves.toBeNull()

    const stored = mocks.sessionStorage.get(
      ACCOUNT_KEY_AUTO_PROVISIONING_STORAGE_KEYS.REPAIR_CREATED_RUNTIME_SECRETS,
    )
    expect(stored).toEqual({
      version: 1,
      jobId: "job-example",
      entries: [{ ref: REF, secret: "sk-example-transient-secret" }],
    })

    await expect(
      discardRepairCreatedRuntimeSecrets("job-example", [REF]),
    ).resolves.toBe(true)
    await expect(
      resolveRepairCreatedRuntimeSecret("job-example", REF),
    ).resolves.toBeNull()
  })

  it("fails closed when session storage is unavailable or malformed", async () => {
    mocks.setSessionStorageValues.mockResolvedValueOnce(false)
    await expect(resetRepairCreatedRuntimeSecrets("job-example")).resolves.toBe(
      false,
    )

    mocks.sessionStorage.set(
      ACCOUNT_KEY_AUTO_PROVISIONING_STORAGE_KEYS.REPAIR_CREATED_RUNTIME_SECRETS,
      {
        version: 1,
        jobId: "job-example",
        entries: [{ ref: REF, secret: "sk-***-masked" }],
      },
    )
    await expect(
      resolveRepairCreatedRuntimeSecret("job-example", REF),
    ).resolves.toBeNull()

    mocks.getSessionStorageValues.mockRejectedValueOnce(
      new Error("session storage unavailable"),
    )
    await expect(
      resolveRepairCreatedRuntimeSecret("job-example", REF),
    ).resolves.toBeNull()
  })

  it("reports rejected writes and invalid reset requests without exposing secrets", async () => {
    const storageError = new Error("session storage unavailable")
    mocks.setSessionStorageValues.mockRejectedValueOnce(storageError)

    await expect(resetRepairCreatedRuntimeSecrets("job-example")).resolves.toBe(
      false,
    )
    await expect(resetRepairCreatedRuntimeSecrets("   ")).resolves.toBe(false)

    expect(mocks.loggerWarn).toHaveBeenNthCalledWith(
      1,
      "Failed to write repair-created runtime secret cache",
      storageError,
    )
    expect(mocks.loggerWarn).toHaveBeenNthCalledWith(
      2,
      "Failed to reset repair-created runtime secret cache",
    )
    expect(mocks.loggerWarn).toHaveBeenNthCalledWith(
      3,
      "Failed to reset repair-created runtime secret cache",
    )
    expect(JSON.stringify(mocks.loggerWarn.mock.calls)).not.toContain("sk-")
  })

  it("deduplicates identical refs but rejects conflicting secrets in one capture", async () => {
    await expect(resetRepairCreatedRuntimeSecrets("job-example")).resolves.toBe(
      true,
    )

    await expect(
      captureRepairCreatedRuntimeSecrets("job-example", [
        { ref: REF, secret: "sk-example-first-secret" },
        { ref: REF, secret: "sk-example-first-secret" },
      ]),
    ).resolves.toBe(true)
    expect(
      mocks.sessionStorage.get(
        ACCOUNT_KEY_AUTO_PROVISIONING_STORAGE_KEYS.REPAIR_CREATED_RUNTIME_SECRETS,
      ),
    ).toEqual({
      version: 1,
      jobId: "job-example",
      entries: [{ ref: REF, secret: "sk-example-first-secret" }],
    })

    mocks.setSessionStorageValues.mockClear()
    await expect(
      captureRepairCreatedRuntimeSecrets("job-example", [
        { ref: REF, secret: "sk-example-first-secret" },
        { ref: REF, secret: "sk-example-second-secret" },
      ]),
    ).resolves.toBe(false)
    expect(mocks.setSessionStorageValues).not.toHaveBeenCalled()
  })

  it("rejects a secret that conflicts with the cached exact ref", async () => {
    await resetRepairCreatedRuntimeSecrets("job-example")
    await captureRepairCreatedRuntimeSecrets("job-example", [
      { ref: REF, secret: "sk-example-first-secret" },
    ])

    mocks.setSessionStorageValues.mockClear()
    await expect(
      captureRepairCreatedRuntimeSecrets("job-example", [
        { ref: REF, secret: "sk-example-second-secret" },
      ]),
    ).resolves.toBe(false)
    expect(mocks.setSessionStorageValues).not.toHaveBeenCalled()
    await expect(
      resolveRepairCreatedRuntimeSecret("job-example", REF),
    ).resolves.toBe("sk-example-first-secret")
  })
})
