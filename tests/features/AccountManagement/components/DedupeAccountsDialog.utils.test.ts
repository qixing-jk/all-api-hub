import { describe, expect, it } from "vitest"

import { buildDedupeAccountLabelMap } from "~/features/AccountManagement/components/DedupeAccountsDialog/utils"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

describe("buildDedupeAccountLabelMap", () => {
  it("reuses the shared display-name helper instead of always appending usernames", () => {
    const accounts = [
      buildSiteAccount({
        id: "a",
        site_name: "Primary",
        account_info: {
          id: 1,
          access_token: "token-a",
          username: "alice",
          quota: 0,
          today_prompt_tokens: 0,
          today_completion_tokens: 0,
          today_quota_consumption: 0,
          today_requests_count: 0,
          today_income: 0,
        },
      }),
      buildSiteAccount({
        id: "b",
        site_name: "Alias",
        account_info: {
          id: 2,
          access_token: "token-b",
          username: "bob",
          quota: 0,
          today_prompt_tokens: 0,
          today_completion_tokens: 0,
          today_quota_consumption: 0,
          today_requests_count: 0,
          today_income: 0,
        },
      }),
      buildSiteAccount({
        id: "c",
        site_name: "Primary",
        account_info: {
          id: 3,
          access_token: "token-c",
          username: "carol",
          quota: 0,
          today_prompt_tokens: 0,
          today_completion_tokens: 0,
          today_quota_consumption: 0,
          today_requests_count: 0,
          today_income: 0,
        },
      }),
    ]

    const labels = buildDedupeAccountLabelMap(accounts)

    expect(labels.get("a")).toBe("Primary · alice")
    expect(labels.get("c")).toBe("Primary · carol")
    expect(labels.get("b")).toBe("Alias")
  })
})
