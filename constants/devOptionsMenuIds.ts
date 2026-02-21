/**
 * Dev-only options page menu ids.
 *
 * Keep these out of `MENU_ITEM_IDS` so the production `OptionsMenuItemId` union
 * stays stable and does not include developer-only routes.
 */
export const DEV_MENU_ITEM_IDS = {
  MESH_GRADIENT_LAB: "meshGradientLab",
} as const
