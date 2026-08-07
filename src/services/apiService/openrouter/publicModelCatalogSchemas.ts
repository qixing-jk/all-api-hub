import { z } from "zod"

export const openRouterPublicModelSchema = z
  .object({
    id: z.string().trim().min(1),
    name: z.unknown().optional(),
    description: z.unknown().optional(),
    context_length: z.unknown().optional(),
    pricing: z.unknown().optional(),
    architecture: z.unknown().optional(),
    top_provider: z.unknown().optional(),
  })
  .passthrough()

export const openRouterPublicModelCatalogPageSchema = z
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

export type OpenRouterPublicModel = z.infer<typeof openRouterPublicModelSchema>
