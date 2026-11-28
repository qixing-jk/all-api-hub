/**
 * WebDAV uses its explicit Authorization header, never the browser's cookies
 * or HTTP authentication cache. A rejected login returns to our error UI
 * instead of starting browser-managed authentication. Caller headers remain.
 */
export function webdavFetch(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, { ...init, credentials: "omit" })
}
