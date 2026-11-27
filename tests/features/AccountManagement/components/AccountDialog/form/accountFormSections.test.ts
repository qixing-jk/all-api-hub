import { describe, expect, it } from "vitest"

import {
  ACCOUNT_FORM_MOBILE_DEFAULT_OPEN,
  ACCOUNT_FORM_SECTION_IDS,
} from "~/features/AccountManagement/components/AccountDialog/form/accountFormSections"

describe("accountFormSections config", () => {
  it("recognizes the account edit route's section IDs", () => {
    expect(ACCOUNT_FORM_SECTION_IDS).toEqual([
      "site-info",
      "account-auth",
      "account-login",
      "tags-notes",
      "check-in",
      "balance",
    ])
  })

  it("defaults balance to collapsed and the other mobile sections to open", () => {
    expect(ACCOUNT_FORM_MOBILE_DEFAULT_OPEN).toEqual({
      "site-info": true,
      "account-auth": true,
      "account-login": true,
      "tags-notes": true,
      "check-in": true,
      balance: false,
    })
  })
})
