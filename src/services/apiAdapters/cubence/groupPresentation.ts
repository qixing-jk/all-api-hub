import type { CubenceGroup } from "~/services/apiService/cubence/keys"

/** Cubence embeds rate annotations in names; separate only a suffix matching the published multiplier. */
export function getCubenceGroupDisplayName(
  group: Pick<CubenceGroup, "name" | "multiplier">,
): string {
  const suffix =
    /\s*\((?:base\s*)?(?:[x×]\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*[x×]?)\)\s*$/i.exec(
      group.name,
    )
  if (!suffix || Number(suffix[1] ?? suffix[2]) !== group.multiplier)
    return group.name
  return group.name.slice(0, suffix.index).trim() || group.name
}
