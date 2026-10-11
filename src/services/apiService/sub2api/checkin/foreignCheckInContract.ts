import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"

/**
 * A check-in status endpoint answered with a structurally valid success
 * envelope whose `data` belongs to a different deployment's contract.
 *
 * Only a recognized, valid sibling status establishes a foreign contract;
 * a missing discriminator alone remains an inconclusive invalid response.
 * Shared paths make this an everyday occurrence rather than a failure:
 * `GET /api/v1/user/checkin/status` serves both the Genius Programmer DTO
 * (`today_checked_in`) and the clawhud DTO (`checked_in_today`). Discovery
 * must classify it as "this method is not served here" (unsupported), not as
 * an inconclusive probe — one unknown sibling poisons the unique-match
 * decision for the method that did match.
 */
export class ForeignCheckInContractError extends ApiError {
  constructor(
    endpoint: string,
    public readonly actualData: unknown,
  ) {
    super(
      `Check-in endpoint ${endpoint} serves a different deployment contract`,
      undefined,
      endpoint,
      API_ERROR_CODES.FEATURE_UNSUPPORTED,
    )
    this.name = "ForeignCheckInContractError"
  }
}

/** Discovery predicate: an answered foreign contract is unsupported, not unknown. */
export const isForeignCheckInContract = (error: unknown): boolean =>
  error instanceof ForeignCheckInContractError
