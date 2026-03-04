import type { ApiToken } from "~/src/types/index"

export type AccountToken = ApiToken & {
  accountId: string
  accountName: string
}
