import { SITE_TYPES } from "~/constants/siteType"

import type { SiteAdapter } from "../contracts/siteAdapter"
import { aihubmixAccountCompletion } from "./accountCompletion"
import { aihubmixKeyManagement } from "./keyManagement"

export const aihubmixAdapter: SiteAdapter = {
  siteType: SITE_TYPES.AIHUBMIX,
  accountCompletion: aihubmixAccountCompletion,
  keyManagement: aihubmixKeyManagement,
}
