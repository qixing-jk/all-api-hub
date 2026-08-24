import { describe, expect, it } from "vitest"

import {
  getSub2ApiAuthPersistenceStatus,
  SUB2API_AUTH_PERSISTENCE_STATUSES,
} from "~/services/apiService/sub2api/authSession"

describe("Sub2API auth-session errors", () => {
  it("reads a controlled persistence status from an error result", () => {
    expect(
      getSub2ApiAuthPersistenceStatus(
        Object.assign(new Error("persistence failed"), {
          result: {
            status: SUB2API_AUTH_PERSISTENCE_STATUSES.ACCOUNT_MISSING,
          },
        }),
      ),
    ).toBe(SUB2API_AUTH_PERSISTENCE_STATUSES.ACCOUNT_MISSING)
  })

  it.each([
    null,
    new Error("missing result"),
    { result: null },
    { result: { status: "unexpected" } },
  ])("rejects an uncontrolled error shape", (error) => {
    expect(getSub2ApiAuthPersistenceStatus(error)).toBeUndefined()
  })
})
