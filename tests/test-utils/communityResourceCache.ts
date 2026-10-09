import { Blob as NativeBlob } from "node:buffer"
import { vi } from "vitest"

/** Models persistent response bodies across component mounts; browser E2E covers the native API. */
export function mockCommunityResourceCache() {
  const responses = new Map<string, Response>()
  const match = vi.fn(async (key: string) => responses.get(key)?.clone())
  const put = vi.fn(async (key: string, response: Response) => {
    responses.set(key, response.clone())
  })
  vi.stubGlobal("caches", { open: vi.fn(async () => ({ match, put })) })
  return { responses, match, put }
}

/** Leaves image decoding and object URL ownership observable in DOM tests. */
export function mockCommunityImageBrowserApis() {
  // jsdom's Blob is not recognized by Node's native Response body conversion.
  vi.stubGlobal("Blob", NativeBlob)
  const createObjectURL = vi.fn(() => "blob:community-wechat")
  const revokeObjectURL = vi.fn()
  vi.stubGlobal(
    "URL",
    class extends URL {
      static override createObjectURL = createObjectURL
      static override revokeObjectURL = revokeObjectURL
    },
  )
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ close: vi.fn() })),
  )
  return { createObjectURL, revokeObjectURL }
}

export const communityImageResponse = () =>
  new Response("qr-image-bytes", { headers: { "Content-Type": "image/png" } })
