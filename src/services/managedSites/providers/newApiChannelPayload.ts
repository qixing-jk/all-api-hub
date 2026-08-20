import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/managedSite"
import type {
  ChannelFormData,
  ManagedSiteChannel,
  UpdateChannelPayload,
} from "~/types/managedSite"

/**
 * Builds a full New API update from the latest native detail.
 * The upstream controller validates the submitted object before loading the
 * stored channel, so provider-only fields must survive the edit projection:
 * https://github.com/QuantumNous/new-api/blob/f116414284162ad15d8925f7bca494c109b83e93/controller/channel.go
 */
export function buildNewApiUpdatePayload(
  native: ManagedSiteChannel,
  draft: ChannelFormData,
): UpdateChannelPayload {
  const payload: UpdateChannelPayload = {
    ...native,
    id: native.id,
    name: draft.name,
    type: draft.type,
    base_url: draft.base_url,
    models: draft.models.join(","),
    groups: draft.groups,
    group: draft.groups.join(","),
    priority: draft.priority,
    weight: draft.weight,
  }

  if (draft.status !== native.status) {
    payload.status = draft.status
  } else {
    delete payload.status
  }

  if (hasUsableManagedSiteChannelKey(draft.key)) {
    payload.key = draft.key.trim()
  } else {
    delete payload.key
  }

  return payload
}
