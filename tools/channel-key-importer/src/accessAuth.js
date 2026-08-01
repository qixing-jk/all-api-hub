import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto"

const HASH_PREFIX = "scrypt:v1"
const COOKIE_NAME = "dataeyesai_access"
const DEFAULT_SESSION_MS = 12 * 60 * 60 * 1000
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 5

export function hashAccessKey(accessKey, salt = randomBytes(16)) {
  const normalized = String(accessKey || "")
  if (normalized.length < 12) {
    throw new Error("系统访问密钥至少需要 12 个字符")
  }
  const derived = scryptSync(normalized, salt, 32)
  return `${HASH_PREFIX}:${salt.toString("base64")}:${derived.toString("base64")}`
}

export function verifyAccessKey(accessKey, encodedHash) {
  const parts = String(encodedHash || "").split(":")
  if (parts.length !== 4 || `${parts[0]}:${parts[1]}` !== HASH_PREFIX) {
    return false
  }
  try {
    const salt = Buffer.from(parts[2], "base64")
    const expected = Buffer.from(parts[3], "base64")
    const actual = scryptSync(String(accessKey || ""), salt, expected.length)
    return expected.length > 0 && timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

function parseCookies(header) {
  return Object.fromEntries(
    String(header || "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([name, value]) => name && value)
      .map(([name, ...value]) => [name, value.join("=")]),
  )
}

export class AccessSessionManager {
  #sessions = new Map()
  #attempts = new Map()

  constructor({
    accessKeyHash = process.env.DATAEYESAI_ACCESS_KEY_HASH || "",
    secureCookie = process.env.DATAEYESAI_SECURE_COOKIE === "1",
    sessionMs = DEFAULT_SESSION_MS,
    now = () => Date.now(),
  } = {}) {
    this.accessKeyHash = String(accessKeyHash).trim()
    this.secureCookie = secureCookie
    this.sessionMs = sessionMs
    this.now = now
  }

  get enabled() {
    return Boolean(this.accessKeyHash)
  }

  #cookie(token, maxAgeSeconds) {
    return [
      `${COOKIE_NAME}=${token}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Strict",
      this.secureCookie ? "Secure" : "",
      `Max-Age=${maxAgeSeconds}`,
    ]
      .filter(Boolean)
      .join("; ")
  }

  login(address, accessKey) {
    if (!this.enabled) return { token: "", cookie: "" }
    const now = this.now()
    const key = String(address || "unknown")
    const attempt = this.#attempts.get(key)
    if (attempt?.blockedUntil > now) {
      throw new Error("尝试次数过多，请 15 分钟后再试")
    }
    if (!verifyAccessKey(accessKey, this.accessKeyHash)) {
      const withinWindow = attempt && now - attempt.firstAt < ATTEMPT_WINDOW_MS
      const next = withinWindow
        ? { ...attempt, count: attempt.count + 1 }
        : { count: 1, firstAt: now, blockedUntil: 0 }
      if (next.count >= MAX_ATTEMPTS) {
        next.blockedUntil = now + ATTEMPT_WINDOW_MS
      }
      this.#attempts.set(key, next)
      throw new Error("系统访问密钥不正确")
    }
    this.#attempts.delete(key)
    const token = randomBytes(32).toString("base64url")
    this.#sessions.set(token, now + this.sessionMs)
    return {
      token,
      cookie: this.#cookie(token, Math.floor(this.sessionMs / 1000)),
    }
  }

  authenticate(cookieHeader) {
    if (!this.enabled) return true
    const token = parseCookies(cookieHeader)[COOKIE_NAME]
    const expiresAt = token ? this.#sessions.get(token) : 0
    if (!expiresAt || expiresAt <= this.now()) {
      if (token) this.#sessions.delete(token)
      return false
    }
    return true
  }

  logout(cookieHeader) {
    const token = parseCookies(cookieHeader)[COOKIE_NAME]
    if (token) this.#sessions.delete(token)
    return this.#cookie("", 0)
  }
}
