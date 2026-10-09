import { runAbortableTask } from "~/services/apiTransport/abortableTask"
import bundledWechatImage from "~~/resources/wechat_group.png"

import {
  acceptCommunityResourceResponse,
  readCommunityResourceCache,
} from "./communityResourceCache"
import {
  bundledCommunityResources,
  type CommunityQrCode,
} from "./communityResources"

const GROUP_EXPIRES_AT_HEADER = "x-community-group-expires-at"

type CommunityWechatImage = (
  | { source: "remote" | "cached"; blob: Blob }
  | { source: "bundled"; url: string }
) &
  Pick<CommunityQrCode, "expiresAt">

/** Only complete, decodable images may replace the last successful offline copy. */
async function validateImage(blob: Blob): Promise<void> {
  if (
    !blob.type.startsWith("image/") ||
    !blob.size ||
    blob.size > 5 * 1024 * 1024
  ) {
    throw new Error("Invalid community image response")
  }
  const bitmap = await createImageBitmap(blob)
  bitmap.close()
}

/** Resolves actual image bytes independently of whether the directory came from cache. */
export async function loadCommunityWechatImage(
  qrCode: CommunityQrCode,
  signal: AbortSignal,
): Promise<CommunityWechatImage> {
  const requestStartedAt = Date.now()
  try {
    const blob = await runAbortableTask(
      async (requestSignal) => {
        const imageUrl = new URL(qrCode.url)
        imageUrl.searchParams.set("_refresh", String(requestStartedAt))
        const response = await fetch(imageUrl.toString(), {
          cache: "no-store",
          credentials: "omit",
          signal: requestSignal,
        })
        if (!response.ok)
          throw new Error(`Community image HTTP ${response.status}`)
        const image = await response.blob()
        await validateImage(image)
        return image
      },
      { signals: [signal], timeoutMs: 10_000 },
    )
    signal.throwIfAborted()
    const headers = new Headers({ "Content-Type": blob.type })
    if (qrCode.expiresAt) headers.set(GROUP_EXPIRES_AT_HEADER, qrCode.expiresAt)
    await acceptCommunityResourceResponse(
      "image",
      new Response(blob, { headers }),
      requestStartedAt,
      signal,
    )
    signal.throwIfAborted()
    return { source: "remote", blob, expiresAt: qrCode.expiresAt }
  } catch {
    signal.throwIfAborted()
  }

  try {
    const response = await readCommunityResourceCache("image")
    if (response) {
      const blob = await runAbortableTask(
        async () => {
          const image = await response.blob()
          await validateImage(image)
          return image
        },
        { signals: [signal], timeoutMs: 10_000 },
      )
      signal.throwIfAborted()
      // Metadata belongs to these bytes, even when the current catalog points to a newer image.
      return {
        source: "cached",
        blob,
        expiresAt: response.headers.get(GROUP_EXPIRES_AT_HEADER) ?? undefined,
      }
    }
  } catch {
    signal.throwIfAborted()
  }
  signal.throwIfAborted()
  return {
    source: "bundled",
    url: bundledWechatImage,
    expiresAt: bundledCommunityResources.find(
      (channel) => channel.id === "wechat",
    )?.qrCode.expiresAt,
  }
}
