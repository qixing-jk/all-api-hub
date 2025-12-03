// ============= 错误处理 =============
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public endpoint?: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}
