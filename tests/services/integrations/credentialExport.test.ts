import { describe, expect, it } from "vitest"

import { createAccountRuntimeKeyExportSource } from "~/services/accounts/utils/credentialExport"
import { createProfileCredentialExportSource } from "~/services/apiCredentialProfiles/credentialExport"
import { buildCredentialExportDisplayName } from "~/services/integrations/credentialExport"
import { buildNewApiRuntimeKey } from "~~/tests/test-utils/accountKeyFixtures"
import {
  buildApiCredentialProfile,
  buildDisplaySiteData,
  buildNewApiToken,
} from "~~/tests/test-utils/factories"

describe("buildCredentialExportDisplayName", () => {
  it("names the site and the key so one account's keys stay distinguishable", () => {
    expect(
      buildCredentialExportDisplayName({
        providerName: "Example",
        credentialName: "Key A",
      }),
    ).toBe("Example - Key A")
  })

  it("does not repeat a label that already names the credential", () => {
    expect(
      buildCredentialExportDisplayName({
        providerName: "Example - Key A",
        credentialName: "Example - Key A",
      }),
    ).toBe("Example - Key A")
  })

  it("drops blank labels and trims the rest", () => {
    expect(
      buildCredentialExportDisplayName({
        providerName: "  Example  ",
        credentialName: "   ",
      }),
    ).toBe("Example")
    expect(
      buildCredentialExportDisplayName({
        providerName: "",
        credentialName: "",
      }),
    ).toBe("")
  })

  it("names an account runtime key after its account and key", () => {
    const account = buildDisplaySiteData({ name: "Example" })
    const source = createAccountRuntimeKeyExportSource(
      account,
      buildNewApiRuntimeKey(account, buildNewApiToken({ name: "Key A" })),
    )

    expect(buildCredentialExportDisplayName(source)).toBe("Example - Key A")
  })

  it("keeps a stored profile's own name without doubling it", () => {
    const profile = buildApiCredentialProfile({ name: "Example - Key A" })

    expect(
      buildCredentialExportDisplayName(
        createProfileCredentialExportSource(profile),
      ),
    ).toBe("Example - Key A")
  })
})
