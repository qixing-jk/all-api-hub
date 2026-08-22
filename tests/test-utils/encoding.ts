/**
 * Encode text as unpadded Base64 for credential-extraction fixtures.
 */
export function encodeUnpaddedBase64(value: string): string {
  return btoa(value).replace(/=+$/, "")
}
