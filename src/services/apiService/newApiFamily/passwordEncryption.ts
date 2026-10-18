import { passwordLoginRequest } from "~/services/accountLogin/passwordContent"
import { isRecord } from "~/utils/core/object"

// RSA-OAEP permits k - 2*hLen - 2 bytes with the SHA-256 hash.
const RSA_OAEP_SHA256_OVERHEAD_BYTES = 66
const AES_KEY_BYTES = 32
const AES_GCM_NONCE_BYTES = 12

/** Encode native protocol ciphertext without changing its bytes. */
function base64(buffer: ArrayBuffer): string {
  return btoa(
    Array.from(new Uint8Array(buffer), (byte) =>
      String.fromCharCode(byte),
    ).join(""),
  )
}

/**
 * QuantumNous/new-api@d032204 web/src/features/auth/lib/password-encryption.ts:
 * RSA-OAEP SHA-256; long UTF-8 passwords use the native v2 AES-GCM envelope.
 * A crypto/key failure never downgrades to a plaintext password request.
 */
export async function encryptNewApiPassword(password: string) {
  const response = await passwordLoginRequest("/api/user/login/encryption-key")
  const key = response.data
  if (
    response.success !== true ||
    !isRecord(key) ||
    typeof key.kid !== "string" ||
    !key.kid ||
    typeof key.public_key !== "string"
  )
    throw new Error("Encryption key unavailable")
  const pem = key.public_key
    .replace("-----BEGIN PUBLIC KEY-----", "")
    .replace("-----END PUBLIC KEY-----", "")
    .replace(/\s/g, "")
  const der = Uint8Array.from(atob(pem), (char) => char.charCodeAt(0))
  const publicKey = await crypto.subtle.importKey(
    "spki",
    der,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  )
  const plaintext = new TextEncoder().encode(password)
  const algorithm = publicKey.algorithm as RsaHashedKeyAlgorithm
  let encrypted: string
  if (
    plaintext.byteLength <=
    algorithm.modulusLength / 8 - RSA_OAEP_SHA256_OVERHEAD_BYTES
  ) {
    encrypted = base64(
      await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, plaintext),
    )
  } else {
    const secret = crypto.getRandomValues(new Uint8Array(AES_KEY_BYTES))
    const nonce = crypto.getRandomValues(new Uint8Array(AES_GCM_NONCE_BYTES))
    const aes = await crypto.subtle.importKey("raw", secret, "AES-GCM", false, [
      "encrypt",
    ])
    const [wrapped, ciphertext] = await Promise.all([
      crypto.subtle.encrypt(
        { name: "RSA-OAEP", label: new TextEncoder().encode("password-v2") },
        publicKey,
        secret,
      ),
      crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv: nonce,
          additionalData: new TextEncoder().encode(`password-v2:${key.kid}`),
        },
        aes,
        plaintext,
      ),
    ])
    encrypted = [
      "v2",
      base64(wrapped),
      base64(nonce.buffer),
      base64(ciphertext),
    ].join(".")
  }
  return { password_encrypted: encrypted, encryption_key_id: key.kid }
}
