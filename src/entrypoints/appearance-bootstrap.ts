import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"

import { initializeCompactPageSizing } from "~/entrypoints/shared/compactPageSizing"
import { bootstrapAppearance } from "~/utils/ui/bootstrapAppearance"

export default defineUnlistedScript(() => {
  initializeCompactPageSizing()
  void bootstrapAppearance()
})
