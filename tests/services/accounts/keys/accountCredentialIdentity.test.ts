import { describe, expect, it } from "vitest"

import {
  isProviderConfirmedAccountCredential,
  resolveAccountCredentialIdentity,
} from "~/services/accounts/keys/accountCredentialIdentity"

describe("account credential identity evidence", () => {
  it("compares the API key in paired Novita credentials and never treats the console token as an inference key", () => {
    expect(
      resolveAccountCredentialIdentity({
        siteType: "novita",
        accountCredential:
          'novita-credentials:{"apiKey":"sk_daily","consoleToken":"console-token"}',
        linkedSecret: "sk_daily",
      }),
    ).toEqual({ status: "confirmed", source: "linked-secret" })
    expect(
      resolveAccountCredentialIdentity({
        siteType: "novita",
        accountCredential: "novita-console:console-token",
        linkedSecret: "console-token",
      }),
    ).toEqual({ status: "unknown", source: "none" })
  })
  it("confirms provider identity and retains authoritative nonmatches over local links", () => {
    expect(
      resolveAccountCredentialIdentity({
        resourceIdentity: {
          resourceId: "key-a",
          credentialResourceId: "key-a",
        },
      }),
    ).toEqual({ status: "confirmed", source: "provider" })
    const provider = resolveAccountCredentialIdentity({
      resourceIdentity: { resourceId: "other", credentialResourceId: "key-a" },
    })
    expect(
      resolveAccountCredentialIdentity({
        provider,
        accountCredential: "sk_secret",
        linkedSecret: "sk_secret",
      }),
    ).toEqual({ status: "mismatch", source: "provider" })
  })
  it("uses masks as hints and lets complete linked keys confirm or reject them", () => {
    const provider = resolveAccountCredentialIdentity({
      accountCredential: "sk_test-first-last",
      maskedKey: "sk_test****last",
    })
    expect(provider).toEqual({ status: "possible", source: "masked-key" })
    expect(
      resolveAccountCredentialIdentity({
        provider,
        accountCredential: "sk_test-first-last",
        linkedSecret: "sk_test-first-last",
      }),
    ).toEqual({ status: "confirmed", source: "linked-secret" })
    expect(
      resolveAccountCredentialIdentity({
        provider,
        accountCredential: "sk_test-first-last",
        linkedSecret: "sk_test-other-last",
      }),
    ).toEqual({ status: "mismatch", source: "linked-secret" })
    expect(
      resolveAccountCredentialIdentity({
        provider,
        accountCredential: "sk_test-first-last",
        linkedSecret: "sk_test****last",
      }),
    ).toEqual(provider)
    expect(
      resolveAccountCredentialIdentity({
        provider,
        accountCredential: "sk_test-first-last",
      }),
    ).toEqual(provider)
  })
  it("never grants stored-secret authority to local plaintext or masked evidence", () => {
    expect(
      isProviderConfirmedAccountCredential({
        status: "confirmed",
        source: "provider",
      }),
    ).toBe(true)
    expect(
      isProviderConfirmedAccountCredential({
        status: "confirmed",
        source: "linked-secret",
      }),
    ).toBe(false)
    expect(
      isProviderConfirmedAccountCredential({
        status: "possible",
        source: "masked-key",
      }),
    ).toBe(false)
  })
  it("keeps missing identity, masked account credentials and weak masks unknown", () => {
    for (const input of [
      {},
      { resourceIdentity: { resourceId: "a", credentialResourceId: null } },
      { accountCredential: "sk_****last", linkedSecret: "sk_test-last" },
      { accountCredential: "sk_test-last", maskedKey: "sk_****" },
    ])
      expect(resolveAccountCredentialIdentity(input)).toEqual({
        status: "unknown",
        source: "none",
      })
  })
})
