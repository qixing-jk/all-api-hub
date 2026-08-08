import { z } from "zod"

import { openRouterPublicModelSchema } from "./publicModelCatalogSchemas"

// Ticket 01 verified that personalized rows use the public row contract with
// optional-field variation; the authenticated envelope remains independently
// validated so protocol drift cannot silently cross scopes.
export const openRouterPersonalizedModelCatalogPageSchema = z
  .object({
    success: z.boolean().optional(),
    data: z.array(openRouterPublicModelSchema),
    total_count: z.number().int().nonnegative(),
    links: z
      .object({
        next: z.string().nullable(),
      })
      .passthrough(),
  })
  .passthrough()
