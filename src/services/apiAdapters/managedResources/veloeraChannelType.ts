import { ChannelType, ChannelTypeNames } from "~/constants/newApi"
import {
  VeloeraChannelType,
  VeloeraChannelTypeNames,
} from "~/constants/veloera"

type StrictChannelTypeMapping<T> =
  | { status: "mapped"; value: T }
  | { status: "unsupported" }

const hasOwn = (value: object, key: PropertyKey) =>
  Object.prototype.hasOwnProperty.call(value, key)

/**
 * Maps Veloera's pinned channel vocabulary into the product canonical type.
 * The shared numeric values match except Veloera 49 (GitHub Models), while the
 * product/New API vocabulary uses 49 for Coze:
 * https://github.com/Veloera/Veloera/blob/6525dfce816beaa270e78f0d8b762e19e54d13b8/web/src/constants/channel.constants.js
 */
export function mapVeloeraChannelTypeToChannelTypeStrict(
  value: unknown,
): StrictChannelTypeMapping<ChannelType> {
  const numeric = Number(value)
  if (
    !Number.isInteger(numeric) ||
    numeric === VeloeraChannelType.GitHubModels ||
    !hasOwn(VeloeraChannelTypeNames, numeric) ||
    !hasOwn(ChannelTypeNames, numeric)
  ) {
    return { status: "unsupported" }
  }
  return { status: "mapped", value: numeric as ChannelType }
}

/** Maps a canonical channel type to the exact Veloera numeric contract. */
export function mapChannelTypeToVeloeraChannelTypeStrict(
  value: ChannelType,
): StrictChannelTypeMapping<VeloeraChannelType> {
  if (
    value === ChannelType.Coze ||
    !hasOwn(ChannelTypeNames, value) ||
    !hasOwn(VeloeraChannelTypeNames, value)
  ) {
    return { status: "unsupported" }
  }
  return { status: "mapped", value: value as VeloeraChannelType }
}
