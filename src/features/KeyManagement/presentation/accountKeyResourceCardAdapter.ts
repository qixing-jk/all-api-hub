import type { TFunction } from "i18next"

import type { NativeKeyManagementRow } from "~/features/KeyManagement/types"
import type { AccountKeyResourceFacts } from "~/services/apiAdapters/contracts/accountKeyResource"

import type {
  KeyResourceCardPresentation,
  KeyResourceFact,
} from "./keyResourceCard"

/** Site-owned projection and detail formatting used by the shared resource list. */
export type AccountKeyResourceCardAdapter = {
  buildPresentation: (
    row: NativeKeyManagementRow,
    t: TFunction,
    options: { hasAssociatedSecret: boolean },
  ) => KeyResourceCardPresentation
  buildDetailFacts: (
    facts: AccountKeyResourceFacts,
    t: TFunction,
  ) => KeyResourceFact[]
  getDetailsLoadFailedMessage: (t: TFunction) => string
}
