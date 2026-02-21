import type { ApiToken } from "../../../../types"

export type AccountToken = ApiToken & { accountId: string; accountName: string }
