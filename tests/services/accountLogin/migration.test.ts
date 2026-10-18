import { describe, expect, it } from "vitest"

import { ACCOUNT_LOGIN_METHODS } from "~/constants/accountLogin"
import { normalizeSiteAccount } from "~/services/accounts/editing/accountDefaults"
import { migrateAccountConfig } from "~/services/accounts/migrations/accountDataMigration"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

describe("account-owned login migration", () => {
  it("moves released check-in selection and passwords to the account without changing user timestamps or enabling new background work", () => {
    const old = buildSiteAccount({
      configVersion: 7,
      passwordAuth: { username: " alice ", password: " secret " },
    })
    old.checkIn.loginCheckIn = { provider: ACCOUNT_LOGIN_METHODS.Password }
    const migrated = migrateAccountConfig(old)
    expect(migrated.configVersion).toBe(8)
    expect(migrated.login).toEqual({
      methodId: ACCOUNT_LOGIN_METHODS.Password,
      credentials: { username: "alice", password: " secret " },
    })
    expect(migrated).not.toHaveProperty("passwordAuth")
    expect(migrated.checkIn).not.toHaveProperty("loginCheckIn")
    expect(migrated.user_updated_at).toBe(old.user_updated_at)
    expect(old.checkIn.loginCheckIn).toEqual({
      provider: ACCOUNT_LOGIN_METHODS.Password,
    })
  })
  it("preserves canonical login over legacy fields and does not revive cleared login on later reads", () => {
    const raw = buildSiteAccount({ login: { methodId: "google" } })
    raw.checkIn.loginCheckIn = { provider: "github" }
    const account = normalizeSiteAccount(raw)
    expect(account.login).toEqual({ methodId: "google" })
    delete account.login
    expect(normalizeSiteAccount(account).login).toBeUndefined()
  })
})
