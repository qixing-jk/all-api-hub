import { md5HexUtf8 } from "./md5"

/**
 * The per-call material `POST /client/common/getConfig` returns alongside the
 * session token. Grsai issues fresh values on every call, and a signature is
 * only accepted while the material it was built from is still the session's.
 */
export type GrsaiSignatureMaterial = {
  kis: string
  ra1: string
  ra2: string
  random: string | number
}

/** Separator the deployment uses to split the decoded `kis` blob into parts. */
const KIS_SEPARATOR = "=sj+Ow2R/v"

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = ""
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize))
  }
  return btoa(binary)
}

const base64ToBytes = (base64: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

const importAesCbcKey = (
  keyMaterial: string,
  usage: KeyUsage,
): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(keyMaterial),
    { name: "AES-CBC" },
    false,
    [usage],
  )

const decryptAesCbc = async (
  keyMaterial: string,
  ivMaterial: string,
  ciphertext: string,
): Promise<string> => {
  const key = await importAesCbcKey(keyMaterial, "decrypt")
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-CBC", iv: new TextEncoder().encode(ivMaterial) },
    key,
    base64ToBytes(ciphertext),
  )
  return new TextDecoder().decode(plaintext)
}

const encryptAesCbc = async (
  keyMaterial: string,
  ivMaterial: string,
  plaintext: string,
): Promise<string> => {
  const key = await importAesCbcKey(keyMaterial, "encrypt")
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv: new TextEncoder().encode(ivMaterial) },
    key,
    new TextEncoder().encode(plaintext),
  )
  return bytesToBase64(new Uint8Array(ciphertext))
}

const readIndex = (digits: string): number => {
  const value = Number.parseInt(digits, 10)
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("invalid_grsai_signature_material")
  }
  return value
}

/**
 * Resolves the pair of `kis` part indices from the `random` digit string.
 *
 * `random` is shaped `<widthA>?<widthA digits><widthB digits>` where the leading
 * digit gives how many digits index A uses and the trailing digit how many index
 * B uses, with one digit skipped between each field.
 */
const resolveBlobIndexes = (random: string): { a: number; b: number } => {
  const digits = random.split("")
  const widthA = Number.parseInt(digits[0] ?? "", 10)
  const widthB = Number.parseInt(digits[digits.length - 1] ?? "", 10)
  if (
    !Number.isInteger(widthA) ||
    !Number.isInteger(widthB) ||
    widthA < 1 ||
    digits.length < 4 + widthA + widthB
  ) {
    throw new Error("invalid_grsai_signature_material")
  }

  return {
    a: readIndex(digits.slice(2, 2 + widthA).join("")),
    b: readIndex(digits.slice(4 + widthA, 4 + widthA + widthB).join("")),
  }
}

/**
 * Serializes the request body the way the console does before encrypting it:
 * keys in ascending ASCII order, each value JSON-encoded and base64-encoded,
 * joined as `key=value` pairs. `null` and `undefined` are dropped, matching the
 * console's loose `value == undefined` guard.
 */
const serializeSignedPayload = (body: Record<string, unknown>): string => {
  return Object.keys(body)
    .sort()
    .reduce((payload, key) => {
      const value = body[key]
      if (value === undefined || value === null) return payload
      const encoded = bytesToBase64(
        new TextEncoder().encode(JSON.stringify(value)),
      )
      return `${payload}${key}=${encoded}`
    }, "")
}

/**
 * Computes the `xtx` header value for one console request.
 *
 * Verified against the site's own bundle (module 59658 of
 * `_next/static/chunks/dbc7289c88ff1382.js`) and cross-checked against `xtx`
 * values the console itself produced for the same material:
 *
 *   payload = sorted, base64-encoded body pairs
 *   key/iv  = two `kis` parts selected by the indices encoded in `random`
 *   key     = AES-CBC-decrypt(key/iv, ra1)   iv = AES-CBC-decrypt(key/iv, ra2)
 *   xtx     = md5(base64(AES-CBC-encrypt(key, iv, payload)))
 *
 * The `kis` parts are used verbatim as UTF-8 key material, not base64-decoded:
 * the console parses both sides of that step with `CryptoJS.enc.Utf8.parse`.
 * Mutating console endpoints reject a missing or unmatched `xtx` with
 * `{ code: -3, msg: "参数格式错误" }`.
 */
export async function computeGrsaiSignature(
  material: GrsaiSignatureMaterial,
  body: Record<string, unknown>,
): Promise<string> {
  const parts = atob(material.kis).split(KIS_SEPARATOR)
  const { a, b } = resolveBlobIndexes(String(material.random))

  const keyPart = parts[a]
  const ivPart = parts[b]
  if (!keyPart || !ivPart) {
    throw new Error("invalid_grsai_signature_material")
  }

  const payloadKey = await decryptAesCbc(keyPart, ivPart, material.ra1)
  const payloadIv = await decryptAesCbc(keyPart, ivPart, material.ra2)

  return md5HexUtf8(
    await encryptAesCbc(payloadKey, payloadIv, serializeSignedPayload(body)),
  )
}
