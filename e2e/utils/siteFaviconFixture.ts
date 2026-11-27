import { createServer } from "node:http"
import type { AddressInfo } from "node:net"

/** Serve a real page with a recognizably colored icon for browser cache tests. */
export async function openSiteFaviconFixture(port = 0) {
  const title = "Tab Guide"
  const faviconPath = "/site-icon.svg"
  const server = createServer((request, response) => {
    if (request.url === faviconPath) {
      response.setHeader("Content-Type", "image/svg+xml")
      response.end(
        '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#e62955"/></svg>',
      )
      return
    }
    response.setHeader("Content-Type", "text/html")
    response.end(
      `<!doctype html><title>${title}</title><link rel="icon" href="${faviconPath}"><h1>${title}</h1>`,
    )
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, "127.0.0.1", resolve)
  })
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return {
    title,
    origin,
    url: `${origin}/guide?lang=en#intro`,
    faviconUrl: origin + faviconPath,
    close: async () => {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    },
  }
}
