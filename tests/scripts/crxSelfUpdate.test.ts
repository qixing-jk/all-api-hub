import { createHash, createPublicKey } from "node:crypto"
import { expect, it } from "vitest"

import {
  buildCrxUpdateManifest,
  CRX_ENV_VARS,
  deriveCrxExtensionId,
  getCrxAssetName,
  getCrxCodebaseUrl,
  getCrxSelfUpdateUrl,
  getCrxUpdateManifestAssetName,
  hasCrxPrivateKey,
} from "~~/scripts/crx-self-update.mjs"

/** Throwaway RSA key fixture; its derived id is asserted below. */
const FIXTURE_PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCo6ylaIxCRDraM
YAsyrppEgpqLQLvMAMqXUOvkqbgk9CZMUeUgPacS1YHuVi7vccB+4/E4vRpcBW66
diiHM3Sq0YoHKkWV6CjHVFiMxXOg2tBUL+F/khtsvazXbzSf0X1iTj4fcE9RUPul
ckhG0RyJLyqOURoBlZd44W1gIB41HFeLjyC/N8OMrnVQySW9HKyxv9jvv7P+OiYP
xYnq4wn4Zeoio+0soZ2j+S8erMcWqgHGeBZUBlF5BAquWz5nbZ5H+yV2eP1jn9ia
C92mjZxsytKPsEgOEYCrm+l9CaUwT8rzs3kuy0zlAKTwiF8sgAp9CA2cN/xvUNxH
sa146Ot/AgMBAAECggEAEuko2v979lFoXHTQLB9iA/N/K8HWhHM+OwyDLDlX9UMk
Gn08ooxkbPZcMnuRi5r3iv0n30tEbTLqf5OE3AYFtK36vuybl7nC/vXRaAke9c4p
bpNhsm+ABH+DnybDBHVmjR/nUou3RYpEcfRGZS85+529LOuldrHxoEXUgeN2nklc
b7lua+hCEszPmgiqgYa/nmZRO3PPQZQcvaC57tyRmEP8eQJ3AOpUzvLmrE4xkVFF
98V/RhYWGpJdUBbBY/nUKx1ZDPVZNvZ2+xB0Q85K8jL6zA7MmJFNyi/iC86xog2y
t9HQoeT+tIFNDKMEaCpYJCKI6gilx7sm+lThst7fsQKBgQDRNtqrHqLKq5eDcKLu
ZngLL+nEjNndN8AYECniqyJuidUBlevKAocgHSs8lBD4sAfDR1SWiQl7sqYkw3Wh
/yTg7HsWa84P9iJuPr1cu2nocOHNju3slHmZI0GFLQMWBSCncbLLs43mKUTJa+v3
oKoYnAIT1cnE1DuP63iPrPdeRwKBgQDOsXOXQEHcZ9hevjC8Dz7zmh+BJtAclHbV
YN6gLi8yn4idAmk2RZYe/s6Wsw1811/M7DqGrl0qDNTh9YBokVgNVL+FWTrQhswq
+ZhJtfrjdFLqcvlBA6nBqHb+rx1LEaqyr2DJ0tS0mBMISUIImYWdE1kwx4cIGuTG
L1t7zasNCQKBgAVBKXDOzivk72M/uvfd3vn49BgZqYci1VJFZafpwG2iTJVDnK5w
LdCiqulUlrCIS0meSwOU4YYX0JBv0E6HR/fWOKkxf/Vqqya1sK/ZjSlnXGR7SIJ+
oCc2eXjMzp0I9+78rg7rrY6wTqf4a+7GPD9t+6df4TduVSiiM174ayYVAoGACef9
V0FwJqUffKL26Px+EuTPH7yBeu0uqNlksh6kinOU85l6+2voXwHtWtGoEtSrtcGY
qH3Q30QQK+g9SEW3B6SJLVXyeK4NOP4Pa3D6Xk5j7vKluZT4XNy7H0e7Sq7FFJ1N
MT8WjLVBLEN+k7Tv73BO9QSLFztavZjldJCN4ykCgYAmAWf5emnx6pw+8AH8Iq/H
5JhucqOTWvpbZ1mJ85RdotJE05X3bhZtghcVAhUuEkRPiMHpTcI9x8KqLLfKLOji
+mMwfuyIZAviGhk0IXsXRAGxROz+IMUQnmZ6L8RKhnZ/3gdTMk7BX8gJ0iLNhsqM
Q88iOn6cO95Qk3FVHQtUsA==
-----END PRIVATE KEY-----`

it("writes one updatecheck entry for the signed extension id", () => {
  const xml = buildCrxUpdateManifest({
    extensionId: "abcdefghijklmnopabcdefghijklmnop",
    version: "4.6.1",
    codebase: "https://example.com/all-api-hub-chrome.crx",
  })

  expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
  expect(xml).toContain(
    '<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">',
  )
  expect(xml).toContain('<app appid="abcdefghijklmnopabcdefghijklmnop">')
  expect(xml).toContain(
    '<updatecheck codebase="https://example.com/all-api-hub-chrome.crx" version="4.6.1" />',
  )
})

it("rejects an extension id that is not 32 a-p characters", () => {
  expect(() =>
    buildCrxUpdateManifest({
      extensionId: "not-a-valid-id",
      version: "4.6.1",
      codebase: "https://example.com/all-api-hub-chrome.crx",
    }),
  ).toThrow(/extension id/i)
})

it("rejects a version that is not a dotted numeric version", () => {
  expect(() =>
    buildCrxUpdateManifest({
      extensionId: "abcdefghijklmnopabcdefghijklmnop",
      version: "4.6.1-beta",
      codebase: "https://example.com/all-api-hub-chrome.crx",
    }),
  ).toThrow(/version/i)
})

it("rejects a non-https codebase so browsers do not reject the update", () => {
  expect(() =>
    buildCrxUpdateManifest({
      extensionId: "abcdefghijklmnopabcdefghijklmnop",
      version: "4.6.1",
      codebase: "http://example.com/all-api-hub-chrome.crx",
    }),
  ).toThrow(/https/i)
})

it("derives the extension id Chrome shows for the signing key", () => {
  // Chrome uses SHA-256 of the DER SPKI public key, first 16 bytes, mapped to
  // a-p. Verified against chrome://extensions for the same key.
  const expected = createHash("sha256")
    .update(
      createPublicKey(FIXTURE_PRIVATE_KEY_PEM).export({
        type: "spki",
        format: "der",
      }),
    )
    .digest("hex")
    .slice(0, 32)
    .split("")
    .map((char) => String.fromCharCode(97 + Number.parseInt(char, 16)))
    .join("")

  expect(deriveCrxExtensionId(FIXTURE_PRIVATE_KEY_PEM)).toBe(expected)
  expect(deriveCrxExtensionId(FIXTURE_PRIVATE_KEY_PEM)).toMatch(/^[a-p]{32}$/)
})

it("refuses a private key it cannot parse", () => {
  expect(() => deriveCrxExtensionId("not a pem")).toThrow(/private key/i)
})

it("uses a stable updates.xml URL for each rolling channel", () => {
  // The URL is baked into the manifest, so it must resolve to the newest build
  // of its channel without embedding a version number.
  expect(getCrxSelfUpdateUrl("github-release")).toBe(
    "https://github.com/qixing-jk/all-api-hub/releases/latest/download/updates.xml",
  )
  expect(getCrxSelfUpdateUrl("github-nightly")).toBe(
    "https://github.com/qixing-jk/all-api-hub/releases/download/nightly/updates.xml",
  )
  expect(() => getCrxSelfUpdateUrl("chrome-web-store")).toThrow(
    /self-update channel/i,
  )
})

it("keeps the manifest asset name fixed so update_url stays valid", () => {
  expect(getCrxUpdateManifestAssetName("github-release")).toBe("updates.xml")
  expect(getCrxUpdateManifestAssetName("github-nightly")).toBe("updates.xml")
})

it("resolves the CRX asset name and codebase URL per rolling channel", () => {
  expect(getCrxAssetName("github-release")).toBe("all-api-hub-chrome.crx")
  expect(getCrxAssetName("github-nightly")).toBe(
    "all-api-hub-nightly-chrome.crx",
  )
  expect(() => getCrxAssetName("chrome-web-store")).toThrow(
    /self-update channel/i,
  )

  expect(getCrxCodebaseUrl("github-release")).toBe(
    "https://github.com/qixing-jk/all-api-hub/releases/latest/download/all-api-hub-chrome.crx",
  )
  expect(getCrxCodebaseUrl("github-nightly")).toBe(
    "https://github.com/qixing-jk/all-api-hub/releases/download/nightly/all-api-hub-nightly-chrome.crx",
  )
  expect(() => getCrxCodebaseUrl("chrome-web-store")).toThrow(
    /self-update channel/i,
  )
})

it("detects whether a signing key source is present in the environment", () => {
  expect(hasCrxPrivateKey({})).toBe(false)
  expect(
    hasCrxPrivateKey({
      [CRX_ENV_VARS.PrivateKeyPem]: "key",
    }),
  ).toBe(true)
  expect(
    hasCrxPrivateKey({
      [CRX_ENV_VARS.PrivateKeyBase64]: "base64",
    }),
  ).toBe(true)
  expect(
    hasCrxPrivateKey({
      [CRX_ENV_VARS.PrivateKeyPath]: "path",
    }),
  ).toBe(true)
  expect(
    hasCrxPrivateKey({
      [CRX_ENV_VARS.PrivateKeyPem]: "  ",
    }),
  ).toBe(false)
})
