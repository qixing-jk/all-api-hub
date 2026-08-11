import { describe, expect, it } from "vitest"

import {
  mapAccountKeyResourceFailure,
  mapAccountKeyResourceUncertainFailure,
} from "~/services/apiAdapters/accountKeyResources/failure"
import {
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  AccountKeyResourceError,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"

describe("account key resource failure mapping", () => {
  it("preserves controlled failures and safe optional details", () => {
    const failure = {
      code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ValidationFailed,
      message: "Invalid field",
      upstreamCode: "INVALID_FIELD",
      fieldIssues: [{ fieldId: "name", code: "required" }],
    }

    expect(mapAccountKeyResourceFailure(failure)).toEqual(failure)
    expect(
      mapAccountKeyResourceFailure(new AccountKeyResourceError(failure)),
    ).toEqual(failure)
  })

  it.each([
    [
      API_ERROR_CODES.HTTP_401,
      ACCOUNT_KEY_RESOURCE_FAILURE_CODES.AuthenticationFailed,
    ],
    [
      API_ERROR_CODES.HTTP_403,
      ACCOUNT_KEY_RESOURCE_FAILURE_CODES.PermissionDenied,
    ],
    [API_ERROR_CODES.HTTP_429, ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable],
    [
      API_ERROR_CODES.NETWORK_ERROR,
      ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable,
    ],
    [
      API_ERROR_CODES.CONTENT_TYPE_MISMATCH,
      ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable,
    ],
    [
      API_ERROR_CODES.JSON_PARSE_ERROR,
      ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable,
    ],
    [
      API_ERROR_CODES.TOKEN_SECRET_UNAVAILABLE,
      ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable,
    ],
    [
      API_ERROR_CODES.BUSINESS_ERROR,
      ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected,
    ],
  ])("maps API code %s to %s", (apiCode, failureCode) => {
    expect(
      mapAccountKeyResourceFailure(
        new ApiError("provider failure", undefined, undefined, apiCode),
      ),
    ).toEqual({ code: failureCode, message: "provider failure" })
  })

  it.each([
    [499, ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Aborted],
    [401, ACCOUNT_KEY_RESOURCE_FAILURE_CODES.AuthenticationFailed],
    [403, ACCOUNT_KEY_RESOURCE_FAILURE_CODES.PermissionDenied],
    [404, ACCOUNT_KEY_RESOURCE_FAILURE_CODES.NotFound],
    [408, ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable],
    [429, ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable],
    [503, ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable],
    [422, ACCOUNT_KEY_RESOURCE_FAILURE_CODES.UpstreamRejected],
  ])("maps HTTP status %s to %s", (status, failureCode) => {
    expect(
      mapAccountKeyResourceFailure({
        response: { status },
        message: "provider failure",
        upstreamCode: "PROVIDER_CODE",
      }),
    ).toEqual({
      code: failureCode,
      message: "provider failure",
      upstreamCode: "PROVIDER_CODE",
    })
  })

  it("maps aborts and unknown values without fabricating details", () => {
    expect(
      mapAccountKeyResourceFailure(
        Object.assign(new Error("cancelled"), { name: "AbortError" }),
      ),
    ).toEqual({
      code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Aborted,
      message: "cancelled",
    })
    expect(mapAccountKeyResourceFailure(null)).toEqual({
      code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected,
    })
    expect(mapAccountKeyResourceFailure([])).toEqual({
      code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected,
    })
  })

  it("makes uncertain writes explicit while retaining only safe provider detail", () => {
    expect(mapAccountKeyResourceUncertainFailure()).toEqual({
      code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
    })
    expect(
      mapAccountKeyResourceUncertainFailure(
        new ApiError(
          "connection closed",
          undefined,
          undefined,
          API_ERROR_CODES.NETWORK_ERROR,
          "CONNECTION_CLOSED",
        ),
      ),
    ).toEqual({
      code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
      message: "connection closed",
      upstreamCode: "CONNECTION_CLOSED",
    })
  })
})
