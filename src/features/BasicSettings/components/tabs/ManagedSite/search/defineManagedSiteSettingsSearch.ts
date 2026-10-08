import type { ManagedSiteType } from "~/constants/siteType"
import type { OptionsSearchItemDefinition } from "~/features/OptionsSearch/types"

/** Binds every search target to the same settings owner, preserving extra visibility rules. */
export function defineManagedSiteSettingsSearch<
  SiteType extends ManagedSiteType,
>(
  siteType: SiteType,
  sections: OptionsSearchItemDefinition[],
  controls: OptionsSearchItemDefinition[],
) {
  const bind = (items: OptionsSearchItemDefinition[]) =>
    items.map((item) => ({
      ...item,
      isVisible: (
        context: Parameters<
          NonNullable<OptionsSearchItemDefinition["isVisible"]>
        >[0],
      ) =>
        context.managedSiteType === siteType &&
        (item.isVisible?.(context) ?? true),
    }))
  return { siteType, sections: bind(sections), controls: bind(controls) }
}
