import { FEEDBACK_SCAN_LIMITS } from "./scanLimits"

export const KEYWORDS = [
  "checkin",
  "check-in",
  "check_in",
  "check in",
  "signin",
  "sign-in",
  "sign_in",
  "sign in",
  "签到",
  "簽到",
  "打卡",
  "daily",
  "reward",
  "redeem",
  "attendance",
] as const
const ROUTE_KEYWORDS = /check.?in|sign.?in|redeem|daily|reward|attendance/i

/** Decode common bundled string escapes without evaluating website code. */
export function decodeSource(source: string): string {
  return source
    .replace(/\\u([\da-f]{4})|\\x([\da-f]{2})/gi, (_, unicode, hex) =>
      String.fromCharCode(parseInt(unicode ?? hex, 16)),
    )
    .replaceAll("\\/", "/")
}

/** Discover public text assets from HTML and bundler imports/dependency tables. */
export function discoverAssets(
  source: string,
  base: string,
  html: boolean,
): string[] {
  const references: string[] = []
  if (html) {
    for (const tag of source.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
      const attrs = new Map<string, string>()
      for (const attr of tag[0].matchAll(
        /\b([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g,
      )) {
        const [, rawName, doubleQuoted, singleQuoted, bare] = attr
        const value = doubleQuoted ?? singleQuoted ?? bare
        if (!rawName || value === undefined) continue
        attrs.set(rawName.toLowerCase(), value)
      }
      if (/^<script/i.test(tag[0])) {
        if (attrs.has("src")) references.push(attrs.get("src")!)
      } else if (
        /^(?:modulepreload|preload|stylesheet)$/i.test(attrs.get("rel") ?? "")
      ) {
        if (attrs.has("href")) references.push(attrs.get("href")!)
      }
    }
    // Inline module imports and dependency tables are also ordinary page resources.
    for (const script of source.matchAll(
      /<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi,
    )) {
      const scriptBody = script[1]
      if (scriptBody === undefined) continue
      references.push(...discoverAssets(scriptBody, base, false))
    }
  } else {
    for (const match of source.matchAll(
      /["'`]([^"'`\s<>]{1,1000}\.(?:m?js|css|json)(?:\?[^"'`\s<>]*)?)["'`]/gi,
    )) {
      // Vite dependency tables use document-relative assets/ paths, whereas
      // module specifiers starting with ./ or ../ resolve against the importer.
      const reference = match[1]
      if (reference === undefined) continue
      references.push(
        reference.startsWith("assets/") ? `/${reference}` : reference,
      )
    }
  }
  return normalizeAssetUrls(references, base)
}

/** Keeps only same-origin text resources from document or browser resource records. */
export function normalizeAssetUrls(
  references: string[],
  base: string,
): string[] {
  const origin = new URL(base).origin
  const assets = new Set<string>()
  for (const reference of references) {
    try {
      const url = new URL(reference.replaceAll("&amp;", "&"), base)
      if (
        url.origin !== origin ||
        url.username ||
        url.password ||
        !/\.(?:m?js|css|json)$/i.test(url.pathname)
      )
        continue
      url.hash = ""
      assets.add(url.href)
    } catch {
      // Ignore malformed references.
    }
  }
  return [...assets]
}

/** Extracts bounded path clues, never executing or requesting the discovered strings. */
export function extractCheckInRoutes(source: string): string[] {
  const routes = new Set<string>()
  for (const match of decodeSource(source).matchAll(
    /["'`]([^"'`\r\n]{1,1000})["'`]/g,
  )) {
    const rawLiteral = match[1]
    if (rawLiteral === undefined) continue
    const literal = rawLiteral.replaceAll("\\/", "/")
    if (!ROUTE_KEYWORDS.test(literal) || !/^(?:\/|https?:\/\/)/i.test(literal))
      continue
    try {
      const path = new URL(literal, "https://scan.invalid").pathname
      if (path.length > 200 || !/^\/[a-zA-Z0-9/_{}:.%-]*$/.test(path)) continue
      if (/(?:sk-|eyJ)[a-zA-Z0-9_-]{12,}|[a-zA-Z0-9_-]{40,}/.test(path))
        continue
      routes.add(path)
      if (routes.size >= FEEDBACK_SCAN_LIMITS.routes) break
    } catch {
      // A malformed candidate is not a route clue.
    }
  }
  return [...routes]
}

/** Includes only ordinary top-level key names from JSON-shaped status responses. */
export function getResponseKeys(text: string): string[] {
  try {
    const value: unknown = JSON.parse(text)
    if (!value || typeof value !== "object" || Array.isArray(value)) return []
    return Object.keys(value)
      .filter(
        (key) =>
          /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(key) &&
          !/token|cookie|authorization|secret|password|api.?key/i.test(key),
      )
      .slice(0, 20)
  } catch {
    return []
  }
}
