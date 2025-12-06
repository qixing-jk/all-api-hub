import { ChannelType } from "~/constants"
import { ChannelTypeNames } from "~/constants/newApi"

/**
 * Resolve a user-facing name for the provided channel type.
 * Falls back to Unknown when the type is unmapped.
 * @param type Enum value coming from Channel metadata.
 */
export function getChannelTypeName(type: ChannelType): string {
  return ChannelTypeNames[type] ?? ChannelTypeNames[ChannelType.Unknown]
}
