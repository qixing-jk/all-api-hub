import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"

export class OpenRouterManagementKeyRequiredError extends ApiError {
  constructor() {
    super(
      "OpenRouter management key required",
      401,
      undefined,
      API_ERROR_CODES.HTTP_401,
    )
    this.name = "OpenRouterManagementKeyRequiredError"
  }
}
