import { describe, expect, it } from "vitest"

import {
  ACCOUNT_FORM_MOBILE_DEFAULT_OPEN,
  ACCOUNT_FORM_SECTION_IDS,
} from "~/features/AccountManagement/components/AccountDialog/accountFormSections"

describe("accountFormSections config", () => {
  it("defines the section order used by the account form information architecture", () => {
    expect(ACCOUNT_FORM_SECTION_IDS).toEqual([
      "site-info",
      "account-auth",
      "tags-notes",
      "check-in",
      "balance",
    ])
  })

  it("keeps check-in ahead of balance in the mobile default-open strategy", () => {
    expect(ACCOUNT_FORM_MOBILE_DEFAULT_OPEN).toEqual({
      "site-info": true,
      "account-auth": true,
      "tags-notes": true,
      "check-in": true,
      balance: false,
    })
  })
})
