import { z } from "zod"

export const openRouterPublicModelSchema = z
  .object({
    id: z.string().trim().min(1),
    alias_target: z.unknown().optional(),
    benchmarks: z.unknown().optional(),
    canonical_slug: z.unknown().optional(),
    name: z.unknown().optional(),
    description: z.unknown().optional(),
    created: z.unknown().optional(),
    context_length: z.unknown().optional(),
    default_parameters: z.unknown().optional(),
    expiration_date: z.unknown().optional(),
    hugging_face_id: z.unknown().optional(),
    knowledge_cutoff: z.unknown().optional(),
    links: z.unknown().optional(),
    per_request_limits: z.unknown().optional(),
    pricing: z.unknown().optional(),
    architecture: z.unknown().optional(),
    reasoning: z.unknown().optional(),
    supported_parameters: z.unknown().optional(),
    supported_voices: z.unknown().optional(),
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
