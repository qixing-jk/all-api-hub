import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"

import { bootstrapAppearance } from "~/utils/ui/bootstrapAppearance"

export default defineUnlistedScript(() => {
  void bootstrapAppearance()
})
