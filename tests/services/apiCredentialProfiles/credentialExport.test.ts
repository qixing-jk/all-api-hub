import { describe, expect, it } from "vitest"

import {
  createProfileCredentialExportData,
  createProfileCredentialExportSource,
} from "~/services/apiCredentialProfiles/credentialExport"
import { resolveCredentialExport } from "~/services/integrations/credentialExport"
import { buildApiCredentialProfile } from "~~/tests/test-utils/factories"

describe("profile credential exports", () => {
  it("preserves published export identities while projecting only the stored credential", async () => {
    const profile = buildApiCredentialProfile({ notes: "Profile notes" })
    const source = createProfileCredentialExportSource(profile)
    const expected = {
      providerId: "api-credential-profile:profile-1",
      providerName: profile.name,
      baseUrl: profile.baseUrl,
      apiKey: profile.apiKey,
    }

    expect(source.id).toBe(
      "account_token:api-credential-profile:profile-1:1005401843",
    )
    expect(source.notes).toBe("Profile notes")
    expect(createProfileCredentialExportData(profile)).toEqual(expected)
    await expect(resolveCredentialExport(source)).resolves.toEqual(expected)
  })

  it.each([
    { apiKey: "rotated-profile-key" },
    { baseUrl: "https://other-api.example.invalid" },
  ])("invalidates discovery after a credential edit: %j", async (change) => {
    const profile = buildApiCredentialProfile()
    const source = createProfileCredentialExportSource(profile)
    const updatedProfile = { ...profile, ...change }
    const updated = createProfileCredentialExportSource(updatedProfile)

    expect(updated.id).toBe(source.id)
    expect(updated.cacheKey).not.toBe(source.cacheKey)
    await expect(updated.resolveApiKey()).resolves.toBe(updatedProfile.apiKey)
  })

  it("keeps discovery valid after cosmetic profile edits", () => {
    const profile = buildApiCredentialProfile()
    const source = createProfileCredentialExportSource(profile)
    const renamed = createProfileCredentialExportSource({
      ...profile,
      name: "Renamed profile",
      notes: "Updated notes",
    })

    expect(renamed.id).toBe(source.id)
    expect(renamed.cacheKey).toBe(source.cacheKey)
    expect(renamed.providerName).toBe("Renamed profile")
  })
})
