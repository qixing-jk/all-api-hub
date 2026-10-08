import { toOptionalString } from "~/services/apiService/rightcode/parsing"
import type { RightCodeEffectiveUpstream } from "~/services/apiService/rightcode/type"

export type RightCodeChannelInfo = {
  id: number
  name: string
  prefix: string
  protocol?: string | null
  copyWithV1?: boolean | null
  models: string[]
}

/**
 * Loads the channels one account may bind a key to, together with the model ids
 * each channel offers.
 *
 * `/models/effective` is the only account-scoped payload that carries both the
 * channel address rule (`copy_with_v1`) and the per-channel model list, so it
 * is the single source for key editors and exported addresses.
 */
export function toRightCodeChannelInfos(
  upstreams: readonly RightCodeEffectiveUpstream[],
): RightCodeChannelInfo[] {
  const channels: RightCodeChannelInfo[] = []

  for (const upstream of upstreams) {
    const id = upstream.upstream_id
    const prefix = toOptionalString(upstream.prefix) ?? ""
    if (!Number.isFinite(id) || !prefix) continue

    const models = (upstream.models ?? [])
      .filter((model) => model?.is_available !== false)
      .map((model) => toOptionalString(model?.name))
      .filter((name): name is string => Boolean(name))

    channels.push({
      id,
      name: toOptionalString(upstream.name) ?? prefix,
      prefix,
      protocol: toOptionalString(upstream.default_protocol) ?? null,
      copyWithV1: upstream.copy_with_v1 ?? null,
      models,
    })
  }

  return channels
}
