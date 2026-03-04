import type { ApiToken } from "~/types/index"

export type AccountToken = ApiToken & {
  accountId: string
  accountName: string
}
