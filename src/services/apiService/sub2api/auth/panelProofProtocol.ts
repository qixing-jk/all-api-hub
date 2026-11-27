import { SUB2API_PANEL_KEY_ERRORS } from "~/services/apiService/sub2api/type"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { t } from "~/utils/i18n/core"

const encoder = new TextEncoder()
const clockOffsets = new Map<string, number>()
/** Follow the native client's response-clock calibration. */
function alignClock(origin: string, response: Response): void {
  const seconds = Number(response.headers.get("X-Panel-Time"))
  const timestamp =
    seconds > 0
      ? seconds * 1000
      : Date.parse(response.headers.get("Date") ?? "")
  if (Number.isFinite(timestamp))
    clockOffsets.set(origin, timestamp - Date.now())
}
const toBase64Url = (bytes: Uint8Array): string => {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")
}
const digest = async (bytes: Uint8Array<ArrayBuffer>) =>
  toBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))

/** A binding is relevant after protocol discovery; it proves neither protocol nor identity. */
export function readSub2ApiPanelTokenBinding(
  token: string,
): string | undefined {
  try {
    const payload = token.split(".")[1]
    if (!payload) return undefined
    const bytes = Uint8Array.from(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0),
    )
    const claims = JSON.parse(new TextDecoder().decode(bytes))
    return typeof claims.cnf?.jkt === "string" && claims.cnf.jkt
      ? claims.cnf.jkt
      : undefined
  } catch {
    return undefined
  }
}

/** Exact wire contract observed in the target's public index-pimFi1_5.js (2026-11-20). */
async function signRequest(
  url: URL,
  options: RequestInit,
  pair: CryptoKeyPair,
): Promise<RequestInit> {
  const prepared = new Request(url, options)
  const headers = new Headers(prepared.headers)
  const method = (options.method ?? "GET").toUpperCase()
  const token =
    /^Bearer\s+(\S+)$/i.exec(headers.get("Authorization") ?? "")?.[1] ?? ""
  const body = new Uint8Array(await prepared.arrayBuffer())
  const publicKey = await crypto.subtle.exportKey("jwk", pair.publicKey)
  const binding = readSub2ApiPanelTokenBinding(token)
  const thumbprint = await getSub2ApiPanelKeyThumbprint(pair)
  if (binding && binding !== thumbprint)
    throw new ApiError(
      t("messages:errors.api.browserProofLoginRequired"),
      401,
      url.pathname,
      API_ERROR_CODES.HTTP_401,
      SUB2API_PANEL_KEY_ERRORS.Mismatch,
    )
  const head = toBase64Url(
    encoder.encode(
      JSON.stringify({
        alg: "ES256",
        typ: "sub2api-panel-pop+jwt",
        jwk: { kty: "EC", crv: "P-256", x: publicKey.x, y: publicKey.y },
      }),
    ),
  )
  const refreshMode = headers.get("X-Panel-Refresh-Mode")
  const payload = toBase64Url(
    encoder.encode(
      JSON.stringify({
        v: 2,
        htm: method,
        htu: url.pathname + url.search,
        ct: (headers.get("Content-Type") ?? "").trim(),
        bht: await digest(body),
        ath: await digest(encoder.encode(token)),
        iat: Math.floor(
          (Date.now() + (clockOffsets.get(url.origin) ?? 0)) / 1000,
        ),
        jti: toBase64Url(crypto.getRandomValues(new Uint8Array(16))),
        ...(refreshMode ? { rm: refreshMode } : {}),
      }),
    ),
  )
  const input = `${head}.${payload}`
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    pair.privateKey,
    encoder.encode(input),
  )
  headers.set(
    "X-Panel-Proof",
    `${input}.${toBase64Url(new Uint8Array(signature))}`,
  )
  // The native client does not mark auth POSTs as dashboard API calls.
  headers.delete("X-User-UI-Request")
  headers.delete("X-Admin-UI-Request")
  if (
    url.pathname === "/api/v1/admin" ||
    url.pathname.startsWith("/api/v1/admin/")
  )
    headers.set("X-Admin-UI-Request", "1")
  else if (
    /^\/api\/v1\/(?:auth\/(?:me|revoke-all-sessions|oauth\/bind-token)|user(?:\/|$)|keys(?:\/|$)|groups\/(?:available|rates)|channels\/available|usage(?:\/|$)|announcements(?:\/|$)|redeem(?:\/|$)|subscriptions(?:\/|$)|channel-monitors(?:\/|$)|payment\/(?!public|webhook))/.test(
      url.pathname,
    )
  )
    headers.set("X-User-UI-Request", "1")
  options.signal?.throwIfAborted()
  return {
    ...options,
    ...(options.body == null ? {} : { body }),
    headers,
    redirect: "error",
  }
}

/** Missing proof is an explicit pre-handler rejection, never an uncertain network result. */
export async function readSub2ApiPanelProofRejection(
  response: Response,
): Promise<string | undefined> {
  if (response.status !== 401) return undefined
  const body = await response
    .clone()
    .json()
    .catch(() => null)
  return body?.code === 401 &&
    ["PANEL_PROOF_INVALID", "PANEL_PROOF_TIME"].includes(body.reason)
    ? body.reason
    : undefined
}

/** Keeps unsigned deployments unchanged and recovers only the known proof middleware. */
export async function fetchSub2ApiPanelProofRequest(
  url: string,
  options: RequestInit,
  dispatch: (options: RequestInit) => Promise<Response>,
  keys: {
    read(origin: string): Promise<CryptoKeyPair | undefined>
    get(origin: string): Promise<CryptoKeyPair>
  },
): Promise<Response> {
  const target = new URL(url)
  const headers = new Headers(options.headers)
  const eligible =
    target.pathname.startsWith("/api/v1/") &&
    (/^Bearer\s+\S+$/i.test(headers.get("Authorization") ?? "") ||
      (options.method?.toUpperCase() === "POST" &&
        target.pathname.startsWith("/api/v1/auth/")))
  if (!eligible) return await dispatch(options)
  const existing = await keys.read(target.origin).catch(() => {
    // Unsigned deployments do not need this store. A proof middleware rejection
    // still requires successful key persistence before its bounded retry.
    return undefined
  })
  const response = await dispatch(
    existing ? await signRequest(target, options, existing) : options,
  )
  alignClock(target.origin, response)
  const reason = await readSub2ApiPanelProofRejection(response)
  if (!reason) return response
  options.signal?.throwIfAborted()
  let signedOptions: RequestInit
  try {
    signedOptions = await signRequest(
      target,
      options,
      await keys.get(target.origin),
    )
  } catch (error) {
    options.signal?.throwIfAborted()
    if (error instanceof ApiError) throw error
    // The middleware has confirmed this protocol even if key persistence fails.
    // Keep that evidence so optional discovery cannot select native login.
    throw new ApiError(
      t("messages:errors.api.browserProofRejected"),
      401,
      target.pathname,
      API_ERROR_CODES.REQUEST_PROOF_INVALID,
    )
  }
  let signed = await dispatch(signedOptions)
  alignClock(target.origin, signed)
  if (
    reason !== "PANEL_PROOF_TIME" &&
    (await readSub2ApiPanelProofRejection(signed)) === "PANEL_PROOF_TIME"
  ) {
    options.signal?.throwIfAborted()
    signed = await dispatch(
      await signRequest(target, options, await keys.get(target.origin)),
    )
  }
  if (await readSub2ApiPanelProofRejection(signed))
    throw new ApiError(
      t("messages:errors.api.browserProofRejected"),
      401,
      target.pathname,
      API_ERROR_CODES.REQUEST_PROOF_INVALID,
    )
  return signed
}

/** RFC 7638 thumbprint: fixed lexicographic member order. */
export async function getSub2ApiPanelKeyThumbprint(
  pair: CryptoKeyPair,
): Promise<string> {
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey)
  return digest(
    encoder.encode(
      JSON.stringify({ crv: "P-256", kty: "EC", x: jwk.x, y: jwk.y }),
    ),
  )
}
