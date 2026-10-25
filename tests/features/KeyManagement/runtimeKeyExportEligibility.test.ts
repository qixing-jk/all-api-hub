import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { isBatchSelectableEntry } from "~/features/KeyManagement/runtimeKeyExportEligibility"
import type { KeyManagementEntry } from "~/features/KeyManagement/types"
import { buildAccountKeyResourceRuntimeKey } from "~/services/accounts/keys/accountRuntimeKeys"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

const account = buildDisplaySiteData({
  id: "account-1",
  name: "Requesty",
  siteType: SITE_TYPES.REQUESTY,
  token: "rqsty-account-credential",
})

const entry = (inference: boolean, secret = ""): KeyManagementEntry => ({
  id: "entry",
  runtimeKey: buildAccountKeyResourceRuntimeKey(account, {
    ref: {
      accountId: account.id,
      siteType: SITE_TYPES.REQUESTY,
      scopeKey: "default",
      resourceId: inference ? "plain" : "manage",
    },
    label: "key",
    secret,
    inference,
  }),
  uiState: {},
})

describe("key export eligibility", () => {
  it("never exports a management key, even with a resolved secret", () => {
    expect(isBatchSelectableEntry(entry(false, "rqsty-manage"))).toBe(false)
  })

  it("exports an inference key once its secret is available", () => {
    expect(isBatchSelectableEntry(entry(true, "rqsty-inference"))).toBe(true)
  })

  it("withholds an inference key whose secret is not available", () => {
    expect(isBatchSelectableEntry(entry(true))).toBe(false)
  })
})
