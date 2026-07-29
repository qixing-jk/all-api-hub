export class OpenRouterManagementKeyRequiredError extends Error {
  constructor() {
    super("OpenRouter management key required")
    this.name = "OpenRouterManagementKeyRequiredError"
  }
}
