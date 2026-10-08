import { describe, expect, it } from "vitest"

import {
  decryptWebdavBackupEnvelope,
  encryptWebdavBackupContent,
  tryParseEncryptedWebdavBackupEnvelope,
} from "~/services/webdav/backup/webdavBackupEncryption"

describe("webdavBackupEncryption", () => {
  it("parses only valid encrypted backup envelopes", () => {
    const validEnvelope = {
      type: "all-api-hub-webdav-backup-encrypted",
      v: 1,
      kdf: "PBKDF2",
      cipher: "AES-GCM",
      iter: 1234,
      salt: "c2FsdA==",
      iv: "aXY=",
      ct: "Y2lwaGVy",
    }

    expect(
      tryParseEncryptedWebdavBackupEnvelope(JSON.stringify(validEnvelope)),
    ).toEqual(validEnvelope)
    expect(
      tryParseEncryptedWebdavBackupEnvelope('{"type":"plain-backup"}'),
    ).toBeNull()
    expect(tryParseEncryptedWebdavBackupEnvelope("not-json")).toBeNull()
  })

  it("round-trips backup content with default iteration fallback", async () => {
    const plaintext = JSON.stringify({
      version: 2,
      accounts: [{ id: "acc-1", name: "Primary" }],
    })

    const envelope = await encryptWebdavBackupContent({
      content: plaintext,
      password: "correct horse battery staple",
      iterations: 0,
    })

    expect(envelope.iter).toBe(250_000)
    expect(envelope.salt).toMatch(/^[A-Za-z0-9+/=]+$/)
    expect(envelope.iv).toMatch(/^[A-Za-z0-9+/=]+$/)
    expect(envelope.ct).toMatch(/^[A-Za-z0-9+/=]+$/)

    await expect(
      decryptWebdavBackupEnvelope({
        envelope,
        password: "correct horse battery staple",
      }),
    ).resolves.toBe(plaintext)
  })

  it("honors explicit iteration counts and rejects wrong passwords or tampered ciphertext", async () => {
    const envelope = await encryptWebdavBackupContent({
      content: '{"secret":true}',
      password: "top-secret",
      iterations: 1024,
    })

    expect(envelope.iter).toBe(1024)

    await expect(
      decryptWebdavBackupEnvelope({
        envelope,
        password: "wrong-password",
      }),
    ).rejects.toThrow()

    await expect(
      decryptWebdavBackupEnvelope({
        envelope: {
          ...envelope,
          ct: `${envelope.ct.slice(0, -2)}AA`,
        },
        password: "top-secret",
      }),
    ).rejects.toThrow()
  })
})
