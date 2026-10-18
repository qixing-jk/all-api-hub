import { beforeEach, describe, expect, it, vi } from "vitest"

import { ACCOUNT_LOGIN_METHODS } from "~/constants/accountLogin"
import { SITE_TYPES } from "~/constants/siteType"
import { accountLoginConfiguration } from "~/services/accountLogin/configuration"
import {
  createDefaultAccountStorageConfig,
  normalizeSiteAccount,
} from "~/services/accounts/editing/accountDefaults"
import type { SiteAccount } from "~/types"

const storage = vi.hoisted(() => ({
  value: undefined as unknown,
  failRead: false,
}))
vi.mock("@plasmohq/storage", () => ({
  Storage: class {
    async get(key: string) {
      if (storage.failRead) throw new Error("read failed")
      return key === "site_accounts"
        ? structuredClone(storage.value)
        : undefined
    }
    async set(key: string, value: unknown) {
      if (key === "site_accounts") storage.value = structuredClone(value)
    }
  },
}))

const account = normalizeSiteAccount({
  id: "a",
  site_url: "https://gateway.example",
  site_type: SITE_TYPES.NEW_API,
  account_info: { id: "17" },
} as SiteAccount)

describe("per-account login configuration", () => {
  beforeEach(() => {
    storage.value = {
      ...createDefaultAccountStorageConfig(),
      accounts: [account, { ...account, id: "b" }],
    }
    storage.failRead = false
  })

  it("saves and reads account-owned password credentials, and explicitly clears login", async () => {
    await accountLoginConfiguration.configure(account, {
      methodId: ACCOUNT_LOGIN_METHODS.Password,
      credentials: { username: " alice ", password: " secret " },
    })
    expect(await accountLoginConfiguration.read(account)).toEqual({
      methodId: ACCOUNT_LOGIN_METHODS.Password,
      credentials: { username: "alice", password: " secret " },
    })
    const config = storage.value as { accounts: SiteAccount[] }
    expect(config.accounts[0]).toMatchObject({
      login: {
        methodId: ACCOUNT_LOGIN_METHODS.Password,
        credentials: { username: "alice", password: " secret " },
      },
    })
    expect(config.accounts[0]).not.toHaveProperty("passwordAuth")
    expect(config.accounts[0]?.checkIn).not.toHaveProperty("loginCheckIn")
    expect(config.accounts[1]).toMatchObject({ ...account, id: "b" })
    expect(config.accounts[1]?.passwordAuth).toBeUndefined()
    await accountLoginConfiguration.configure(account, null)
    expect(await accountLoginConfiguration.read(account)).toBeNull()
    expect(JSON.stringify(storage.value)).not.toContain("secret")
  })

  it("does not rebind credentials from an outdated account identity", async () => {
    await expect(
      accountLoginConfiguration.configure(
        { ...account, site_url: "https://other.example" },
        {
          methodId: ACCOUNT_LOGIN_METHODS.Password,
          credentials: { username: "alice", password: "secret" },
        },
      ),
    ).rejects.toThrow()
    expect(JSON.stringify(storage.value)).not.toContain("secret")
  })

  it("never writes over unknown storage after a failed read", async () => {
    const before = structuredClone(storage.value)
    storage.failRead = true
    await expect(
      accountLoginConfiguration.configure(account, {
        methodId: ACCOUNT_LOGIN_METHODS.Password,
        credentials: { username: "alice", password: "secret" },
      }),
    ).rejects.toThrow()
    expect(storage.value).toEqual(before)
  })

  it("preserves the existing cross-account OAuth claim guard while allowing independent password accounts", async () => {
    const first = { ...account, site_url: "https://agentrouter.org" }
    const second = { ...first, id: "b" }
    storage.value = {
      ...createDefaultAccountStorageConfig(),
      accounts: [first, second],
    }
    for (const target of [first, second])
      await accountLoginConfiguration.configure(target, {
        methodId: ACCOUNT_LOGIN_METHODS.Password,
        credentials: { username: target.id, password: "secret" },
      })
    await accountLoginConfiguration.configure(first, { methodId: "github" })
    await expect(
      accountLoginConfiguration.configure(second, { methodId: "github" }),
    ).rejects.toThrow()
    expect(await accountLoginConfiguration.read(second)).toEqual({
      methodId: ACCOUNT_LOGIN_METHODS.Password,
      credentials: { username: "b", password: "secret" },
    })
  })
})
