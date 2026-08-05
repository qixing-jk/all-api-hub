import { z } from "zod"

const finiteNumber = z.number().finite()
const optionalNullableString = z.string().nullable().optional()

// Keep documented fields strict while allowing compatible future response fields.
// https://github.com/OpenRouterTeam/docs/blob/main/openapi/openapi.yaml
export const openRouterKeyInfoSchema = z
  .object({
    hash: z.string().trim().min(1),
    name: z.string(),
    label: z.string(),
    disabled: z.boolean(),
    limit: finiteNumber.nullable(),
    limit_remaining: finiteNumber.nullable(),
    limit_reset: z.string().nullable(),
    include_byok_in_limit: z.boolean(),
    usage: finiteNumber,
    usage_daily: finiteNumber,
    usage_weekly: finiteNumber,
    usage_monthly: finiteNumber,
    byok_usage: finiteNumber,
    byok_usage_daily: finiteNumber,
    byok_usage_weekly: finiteNumber,
    byok_usage_monthly: finiteNumber,
    created_at: z.string(),
    updated_at: z.string().nullable(),
    expires_at: optionalNullableString,
    workspace_id: z.string().trim().min(1),
    creator_user_id: z.string().nullable(),
  })
  .passthrough()

export const openRouterKeyListResponseSchema = z
  .object({ data: z.array(openRouterKeyInfoSchema) })
  .passthrough()

export const openRouterKeyResponseSchema = z
  .object({ data: openRouterKeyInfoSchema })
  .passthrough()

export const openRouterCreateKeyResponseSchema = z
  .object({ data: openRouterKeyInfoSchema, key: z.string().trim().min(1) })
  .passthrough()

export const openRouterDeleteKeyResponseSchema = z
  .object({ deleted: z.literal(true) })
  .passthrough()

export const openRouterWorkspaceSchema = z
  .object({
    id: z.string().trim().min(1),
    default_guardrail_id: z.string().trim().min(1),
    name: z.string(),
    slug: z.string().trim().min(1),
    description: z.string().nullable(),
    default_text_model: z.string().nullable(),
    default_image_model: z.string().nullable(),
    default_provider_sort: z.string().nullable(),
    is_observability_io_logging_enabled: z.boolean(),
    is_observability_broadcast_enabled: z.boolean(),
    is_data_discount_logging_enabled: z.boolean(),
    io_logging_sampling_rate: finiteNumber,
    io_logging_api_key_ids: z.array(z.number().int()).nullable(),
    created_at: z.string(),
    updated_at: z.string().nullable(),
    created_by: z.string().nullable(),
    include_byok_in_budgets: z.boolean().optional(),
  })
  .passthrough()

export const openRouterWorkspaceMemberSchema = z
  .object({
    id: z.string().trim().min(1),
    user_id: z.string().trim().min(1),
    workspace_id: z.string().trim().min(1),
    role: z.enum(["admin", "member"]),
    created_at: z.string(),
  })
  .passthrough()

export const openRouterWorkspaceResponseSchema = z
  .object({ data: openRouterWorkspaceSchema })
  .passthrough()

export const openRouterWorkspaceListResponseSchema = z
  .object({
    data: z.array(openRouterWorkspaceSchema),
    total_count: z.number().int().nonnegative(),
  })
  .passthrough()

export const openRouterWorkspaceMemberListResponseSchema = z
  .object({
    data: z.array(openRouterWorkspaceMemberSchema),
    total_count: z.number().int().nonnegative(),
  })
  .passthrough()

const nullableLimitReset = z.enum(["daily", "weekly", "monthly"]).nullable()

export const openRouterCreateKeyInputSchema = z
  .object({
    name: z.string().trim().min(1),
    limit: finiteNumber.nullable().optional(),
    limitReset: nullableLimitReset.optional(),
    includeByokInLimit: z.boolean().optional(),
    expiresAt: z.string().nullable().optional(),
    workspaceId: z.string().trim().min(1).optional(),
    creatorUserId: z.string().trim().min(1).nullable().optional(),
  })
  .strict()

export const openRouterUpdateKeyInputSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    disabled: z.boolean().optional(),
    limit: finiteNumber.nullable().optional(),
    limitReset: nullableLimitReset.optional(),
    includeByokInLimit: z.boolean().optional(),
  })
  .strict()

export const openRouterWorkspacePaginationInputSchema = z
  .object({
    offset: z.number().int().nonnegative().optional(),
    limit: z.number().int().positive().max(100).optional(),
  })
  .strict()

export const openRouterWorkspaceMemberPaginationInputSchema = z
  .object({
    offset: z.number().int().nonnegative().optional(),
    limit: z.number().int().positive().max(100).optional(),
  })
  .strict()

export const openRouterKeyListInputSchema = z
  .object({
    includeDisabled: z.boolean().optional(),
    offset: z.number().int().nonnegative().optional(),
    workspaceId: z.string().trim().min(1).optional(),
  })
  .strict()

export type OpenRouterKeyInfo = z.infer<typeof openRouterKeyInfoSchema>
export type OpenRouterPaginatedResult<T> = {
  data: T[]
  totalCount: number
}
export type OpenRouterWorkspace = z.infer<typeof openRouterWorkspaceSchema>
export type OpenRouterWorkspaceMember = z.infer<
  typeof openRouterWorkspaceMemberSchema
>
export type OpenRouterCreateKeyInput = z.infer<
  typeof openRouterCreateKeyInputSchema
>
export type OpenRouterUpdateKeyInput = z.infer<
  typeof openRouterUpdateKeyInputSchema
>
export type OpenRouterWorkspacePaginationInput = z.infer<
  typeof openRouterWorkspacePaginationInputSchema
>
export type OpenRouterWorkspaceMemberPaginationInput = z.infer<
  typeof openRouterWorkspaceMemberPaginationInputSchema
>
export type OpenRouterKeyListInput = z.infer<
  typeof openRouterKeyListInputSchema
>
