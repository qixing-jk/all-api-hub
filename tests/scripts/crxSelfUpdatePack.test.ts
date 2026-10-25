import { createPublicKey, verify } from "node:crypto"
import { expect, it } from "vitest"

import { deriveCrxExtensionId, packCrx3 } from "~~/scripts/crx-self-update.mjs"

/**
 * Throwaway RSA key, inlined because `.gitignore` excludes `*.pem` and a
 * fixture file would not survive a fresh checkout. It matches the key used by
 * crxSelfUpdate.test.ts and never signs a real release.
 */
const FIXTURE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
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
const SIGNATURE_PREFIX = Buffer.from("CRX3 SignedData\x00", "utf8")

/** Minimal ZIP local-file header; the CRX container treats the payload as opaque. */
function buildZipFixture(): Buffer {
  const name = Buffer.from("manifest.json", "utf8")
  const body = Buffer.from(
    '{"manifest_version":3,"name":"p","version":"1.0.0"}',
  )
  const header = Buffer.alloc(30)
  header.writeUInt32LE(0x04034b50, 0)
  header.writeUInt16LE(20, 4)
  header.writeUInt32LE(body.length, 18)
  header.writeUInt32LE(body.length, 22)
  header.writeUInt16LE(name.length, 26)
  return Buffer.concat([header, name, body])
}

/** Read one protobuf varint and return its value plus the next offset. */
function readVarint(buffer: Buffer, start: number) {
  let value = 0
  let shift = 0
  let offset = start
  while (true) {
    const byte = buffer[offset] as number
    offset += 1
    value += (byte & 0x7f) * 2 ** shift
    if ((byte & 0x80) === 0) return { value, offset }
    shift += 7
  }
}

/** Collect the length-delimited fields of a protobuf message by number. */
function readFields(buffer: Buffer): Map<number, Buffer> {
  const fields = new Map<number, Buffer>()
  let offset = 0
  while (offset < buffer.length) {
    const tag = readVarint(buffer, offset)
    offset = tag.offset
    if (tag.value % 8 !== 2) throw new Error("Unexpected wire type")
    const length = readVarint(buffer, offset)
    offset = length.offset
    fields.set(
      Math.floor(tag.value / 8),
      buffer.subarray(offset, offset + length.value),
    )
    offset += length.value
  }
  return fields
}

/** Read back the CRX3 header fields our writer emits. */
function parseCrx3(crx: Buffer) {
  const headerLength = crx.readUInt32LE(8)
  const header = crx.subarray(12, 12 + headerLength)
  const zip = crx.subarray(12 + headerLength)

  // CrxFileHeader { sha256_with_rsa = 2; signed_header_data = 10000; }
  const headerFields = readFields(header)
  const proofBytes = headerFields.get(2)
  const signedHeaderData = headerFields.get(10000)
  if (!proofBytes || !signedHeaderData) {
    throw new Error("CRX3 header is missing required fields")
  }

  // AsymmetricKeyProof { public_key = 1; signature = 2; }
  const proof = readFields(proofBytes)
  const publicKey = proof.get(1)
  const signature = proof.get(2)
  if (!publicKey || !signature) {
    throw new Error("CRX3 proof is missing required fields")
  }

  return { headerLength, publicKey, signature, signedHeaderData, zip }
}

/** Rebuild the exact payload Chrome verifies a CRX3 proof against. */
function buildSignedPayload(signedHeaderData: Buffer, zip: Buffer): Buffer {
  const signedDataLength = Buffer.alloc(4)
  signedDataLength.writeUInt32LE(signedHeaderData.length, 0)
  return Buffer.concat([
    SIGNATURE_PREFIX,
    signedDataLength,
    signedHeaderData,
    zip,
  ])
}

it("writes a CRX3 container Chrome can verify", () => {
  const zip = buildZipFixture()
  const crx = packCrx3({ zipBuffer: zip, privateKeyPem: FIXTURE_KEY_PEM })
  const parsed = parseCrx3(crx)

  expect(crx.subarray(0, 4).toString("ascii")).toBe("Cr24")
  expect(crx.readUInt32LE(4)).toBe(3)
  expect(parsed.zip.equals(zip)).toBe(true)

  // The proof must carry the DER SPKI key the extension id is derived from.
  expect(
    parsed.publicKey.equals(
      createPublicKey(FIXTURE_KEY_PEM).export({
        type: "spki",
        format: "der",
      }),
    ),
  ).toBe(true)

  expect(
    verify(
      "sha256",
      buildSignedPayload(parsed.signedHeaderData, zip),
      FIXTURE_KEY_PEM,
      parsed.signature,
    ),
  ).toBe(true)
})

it("binds the container to the extension id derived from the same key", () => {
  const crx = packCrx3({
    zipBuffer: buildZipFixture(),
    privateKeyPem: FIXTURE_KEY_PEM,
  })
  const { signedHeaderData } = parseCrx3(crx)

  // SignedData { crx_id = 1 } => field tag 0x0a, length 16, then the raw id.
  expect(signedHeaderData[0]).toBe(0x0a)
  expect(signedHeaderData[1]).toBe(16)

  const id = Array.from(
    signedHeaderData.subarray(2).toString("hex"),
    (nibble) => String.fromCharCode(0x61 + Number.parseInt(nibble, 16)),
  ).join("")
  expect(id).toBe(deriveCrxExtensionId(FIXTURE_KEY_PEM))
})

it("rejects a signature made for a different archive", () => {
  const zip = buildZipFixture()
  const crx = packCrx3({ zipBuffer: zip, privateKeyPem: FIXTURE_KEY_PEM })
  const parsed = parseCrx3(crx)

  expect(
    verify(
      "sha256",
      buildSignedPayload(
        parsed.signedHeaderData,
        Buffer.concat([zip, Buffer.from("x")]),
      ),
      FIXTURE_KEY_PEM,
      parsed.signature,
    ),
  ).toBe(false)
})
