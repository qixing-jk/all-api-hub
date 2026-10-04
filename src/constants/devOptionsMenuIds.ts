/**
 * Dev-only options page menu ids.
 *
 * Keep these out of `MENU_ITEM_IDS` so the production `OptionsMenuItemId` union
 * stays stable and does not include developer-only routes.
 */
export const DEV_MENU_ITEM_IDS = {
  BROWSER_API_LAB: "browserApiLab",
  MESH_GRADIENT_LAB: "meshGradientLab",
  UNIFIED_API_GUIDANCE_PREVIEW: "unifiedApiGuidancePreview",
  STAR_PROMOTION_PREVIEW: "starPromotionPreview",
} as const

export type DevOptionsMenuItemId =
  (typeof DEV_MENU_ITEM_IDS)[keyof typeof DEV_MENU_ITEM_IDS]

/**
 * Checks whether an options menu item id belongs to the developer-only routes.
 */
export function isDevMenuItemId(id: string): id is DevOptionsMenuItemId {
  return Object.values(DEV_MENU_ITEM_IDS).includes(id as DevOptionsMenuItemId)
}
