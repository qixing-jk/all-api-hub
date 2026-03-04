/**
 * Constants describing the encrypted WebDAV backup envelope format.
 *
 * These values are written into the envelope and validated on parse to ensure
 * the client can distinguish encrypted backups from plain JSON backups.
 */
export const WEBDAV_BACKUP_ENCRYPTION = {
  TYPE: "all-api-hub-webdav-backup-encrypted",
  VERSION: 1,
  KDF: "PBKDF2",
  CIPHER: "AES-GCM",
} as const

/**
 * WebDAV encrypted backup envelope (v1).
 *
 * This is the JSON structure persisted to WebDAV when encryption is enabled.
 * The plaintext payload is the normal backup JSON string.
 */
export interface EncryptedWebdavBackupEnvelopeV1 {
  type: typeof WEBDAV_BACKUP_ENCRYPTION.TYPE
  v: typeof WEBDAV_BACKUP_ENCRYPTION.VERSION
  kdf: typeof WEBDAV_BACKUP_ENCRYPTION.KDF
  cipher: typeof WEBDAV_BACKUP_ENCRYPTION.CIPHER
  iter: number
  salt: string
  iv: string
  ct: string
}

/**
 * Convert a byte array into a base64-encoded string.
 *
 * Used to store `salt`, `iv`, and `ct` as JSON-friendly strings.
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize))
  }
  return btoa(binary)
}

/**
 * Convert a base64-encoded string into bytes.
 */
function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * Generate cryptographically secure random bytes.
 */
function getRandomBytes(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(length))
  crypto.getRandomValues(bytes)
  return bytes
}

/**
 * Derive an AES-GCM key from a password using PBKDF2.
 *
 * Note: we only expose this as an internal helper to keep the public API
 * focused on encrypt/decrypt operations.
 */
async function deriveAesKeyFromPassword(params: {
  password: string
  salt: Uint8Array
  iterations: number
}): Promise<CryptoKey> {
  const salt = new Uint8Array(new ArrayBuffer(params.salt.byteLength))
  salt.set(params.salt)

  const enc = new TextEncoder()
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(params.password),
    "PBKDF2",
    false,
    ["deriveKey"],
  )

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: params.iterations,
    },
    passwordKey,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"],
  )
}

/**
 * Attempt to detect and parse an encrypted WebDAV backup envelope.
 *
 * Returns `null` when content is not valid JSON or not recognized as an
 * envelope. This is used for backwards compatibility: unencrypted backups are
 * treated as plain JSON strings.
 */
export function tryParseEncryptedWebdavBackupEnvelope(
  content: string,
): EncryptedWebdavBackupEnvelopeV1 | null {
  try {
    const obj = JSON.parse(content) as Partial<EncryptedWebdavBackupEnvelopeV1>

    if (
      obj &&
      obj.type === WEBDAV_BACKUP_ENCRYPTION.TYPE &&
      obj.v === WEBDAV_BACKUP_ENCRYPTION.VERSION &&
      obj.kdf === WEBDAV_BACKUP_ENCRYPTION.KDF &&
      obj.cipher === WEBDAV_BACKUP_ENCRYPTION.CIPHER &&
      typeof obj.iter === "number" &&
      typeof obj.salt === "string" &&
      typeof obj.iv === "string" &&
      typeof obj.ct === "string"
    ) {
      return obj as EncryptedWebdavBackupEnvelopeV1
    }

    return null
  } catch {
    return null
  }
}

/**
 * Encrypt a plaintext JSON backup string into an envelope.
 *
 * Uses:
 * - PBKDF2 (SHA-256) with a per-backup random salt
 * - AES-256-GCM with a per-backup random 12-byte IV
 */
export async function encryptWebdavBackupContent(params: {
  /**
   * The plaintext JSON backup string to encrypt.
   */
  content: string
  /**
   * The password used for encryption.
   */
  password: string
  /**
   * The number of iterations used for PBKDF2 key derivation (optional).
   */
  iterations?: number
}): Promise<EncryptedWebdavBackupEnvelopeV1> {
  const iterations =
    typeof params.iterations === "number" && params.iterations > 0
      ? params.iterations
      : 250_000

  const salt = getRandomBytes(16)
  const iv = getRandomBytes(12)

  const key = await deriveAesKeyFromPassword({
    password: params.password,
    salt,
    iterations,
  })

  const enc = new TextEncoder()
  const plaintextBytesRaw = enc.encode(params.content)
  const plaintextBytes = new Uint8Array(
    new ArrayBuffer(plaintextBytesRaw.byteLength),
  )
  plaintextBytes.set(plaintextBytesRaw)

  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    plaintextBytes,
  )

  return {
    type: WEBDAV_BACKUP_ENCRYPTION.TYPE,
    v: WEBDAV_BACKUP_ENCRYPTION.VERSION,
    kdf: WEBDAV_BACKUP_ENCRYPTION.KDF,
    cipher: WEBDAV_BACKUP_ENCRYPTION.CIPHER,
    iter: iterations,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ct: bytesToBase64(new Uint8Array(encrypted)),
  }
}

/**
 * Decrypt an encrypted WebDAV backup envelope and return the plaintext JSON
 * backup string.
 *
 * Throws when:
 * - the password is wrong
 * - the ciphertext is tampered
 * - the envelope parameters are invalid
 */
export async function decryptWebdavBackupEnvelope(params: {
  envelope: EncryptedWebdavBackupEnvelopeV1
  password: string
}): Promise<string> {
  const salt = base64ToBytes(params.envelope.salt)
  const iv = base64ToBytes(params.envelope.iv)
  const ct = base64ToBytes(params.envelope.ct)

  const ivFixed = new Uint8Array(new ArrayBuffer(iv.byteLength))
  ivFixed.set(iv)
  const ctFixed = new Uint8Array(new ArrayBuffer(ct.byteLength))
  ctFixed.set(ct)

  const key = await deriveAesKeyFromPassword({
    password: params.password,
    salt,
    iterations: params.envelope.iter,
  })

  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: ivFixed,
    },
    key,
    ctFixed,
  )

  const dec = new TextDecoder()
  return dec.decode(decrypted)
}
