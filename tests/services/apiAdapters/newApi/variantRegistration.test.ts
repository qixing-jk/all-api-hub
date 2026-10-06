import { afterEach, describe, expect, it, vi } from "vitest"

import { ACCOUNT_SITE_ADAPTER_FAMILIES } from "~/services/accountSiteDefinitions/contracts"
import * as definitions from "~/services/accountSiteDefinitions/registry"
import {
  getNewApiVariantRegistration,
  newApiVariantRegistrations,
} from "~/services/apiAdapters/newApi/variantRegistration"

afterEach(() => vi.restoreAllMocks())

describe("New API family variant registration", () => {
  it("registers exactly the declared family members, including explicit compatible variants", () => {
    const siteTypes = definitions
      .getAccountSiteDefinitions()
      .filter(
        ({ adapterFamily }) =>
          adapterFamily === ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
      )
      .map(({ siteType }) => siteType)
    expect(Object.keys(newApiVariantRegistrations).sort()).toEqual(
      siteTypes.sort(),
    )
    expect(
      getNewApiVariantRegistration("VoAPI").key?.transport?.fetchAccountTokens,
    ).toBeTypeOf("function")
  })

  it("rejects a family member without an explicit variant rather than changing its protocol defaults", () => {
    const definition = definitions.getAccountSiteDefinition("sharedchat")!
    vi.spyOn(definitions, "getAccountSiteDefinition").mockReturnValue({
      ...definition,
      adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    })
    expect(() => getNewApiVariantRegistration("sharedchat")).toThrow(
      "New API family variant is not registered",
    )
  })

  it("retains operation defaults for an omitted site type and unrelated families", () => {
    expect(getNewApiVariantRegistration()).toEqual({})
    expect(getNewApiVariantRegistration("sharedchat")).toEqual({})
  })
})
