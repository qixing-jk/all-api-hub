import { z } from "zod"

import { runAbortableTask } from "~/services/apiTransport/abortableTask"
import bundledCatalog from "~~/public/community-resources.v1.json"

import {
  acceptCommunityResourceResponse,
  readCommunityResourceCache,
} from "./communityResourceCache"

const COMMUNITY_RESOURCES_URL =
  "https://raw.githubusercontent.com/qixing-jk/all-api-hub/main/public/community-resources.v1.json"

const httpsUrl = z.url().refine((value) => {
  const url = new URL(value)
  return url.protocol === "https:" && !url.username && !url.password
})

const communityResourcesSchema = z.object({
  schemaVersion: z.literal(1),
  channels: z
    .array(
      z.discriminatedUnion("id", [
        z.object({
          id: z.enum(["telegram", "discord", "qq", "discussions"]),
          url: httpsUrl,
        }),
        z.object({
          id: z.literal("wechat"),
          qrCode: z.object({
            url: httpsUrl,
            expiresAt: z.iso.datetime({ offset: true }).optional(),
          }),
        }),
      ]),
    )
    .max(5)
    .refine(
      (channels) =>
        new Set(channels.map(({ id }) => id)).size === channels.length,
    ),
})

export type CommunityChannel = z.infer<
  typeof communityResourcesSchema
>["channels"][number]
export type CommunityQrCode = Extract<
  CommunityChannel,
  { id: "wechat" }
>["qrCode"]

export type CommunityResourceSource = "remote" | "cached" | "bundled"

// Use the schema's optional-field types even when the bundled JSON omits a channel or its expiry.
export const bundledCommunityResources =
  communityResourcesSchema.parse(bundledCatalog).channels

/** Tries the current directory, then the last successful response, then the bundled directory. */
export async function resolveCommunityResources(signal: AbortSignal): Promise<{
  channels: CommunityChannel[]
  source: CommunityResourceSource
}> {
  const requestStartedAt = Date.now()
  try {
    const channels = await runAbortableTask(
      (requestSignal) => loadCommunityResources(requestSignal ?? signal),
      { signals: [signal], timeoutMs: 10_000 },
    )
    signal.throwIfAborted()
    await acceptCommunityResourceResponse(
      "catalog",
      new Response(JSON.stringify({ schemaVersion: 1, channels })),
      requestStartedAt,
      signal,
    )
    signal.throwIfAborted()
    return { channels, source: "remote" }
  } catch {
    signal.throwIfAborted()
  }

  try {
    const cached = await readCommunityResourceCache("catalog")
    if (cached) {
      const channels = communityResourcesSchema.parse(
        await cached.json(),
      ).channels
      signal.throwIfAborted()
      return { channels, source: "cached" }
    }
  } catch {
    signal.throwIfAborted()
  }
  signal.throwIfAborted()
  return {
    channels: bundledCommunityResources,
    source: "bundled",
  }
}

/** Fetches the published community directory without using the browser HTTP cache. */
export async function loadCommunityResources(
  signal: AbortSignal,
): Promise<CommunityChannel[]> {
  const response = await fetch(COMMUNITY_RESOURCES_URL, {
    cache: "no-store",
    credentials: "omit",
    signal,
  })
  if (!response.ok)
    throw new Error(`Community resources HTTP ${response.status}`)
  return communityResourcesSchema.parse(await response.json()).channels
}
