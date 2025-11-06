import { describe, expect, it } from "vitest"

import { ApiError } from "~/services/apiService/common/errors"

describe("ApiError", () => {
  describe("Constructor", () => {
    it("should create ApiError with message only", () => {
      const error = new ApiError("Test error")

      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe("Test error")
      expect(error.name).toBe("ApiError")
      expect(error.statusCode).toBeUndefined()
      expect(error.endpoint).toBeUndefined()
    })

    it("should create ApiError with message and statusCode", () => {
      const error = new ApiError("Not found", 404)

      expect(error.message).toBe("Not found")
      expect(error.statusCode).toBe(404)
      expect(error.endpoint).toBeUndefined()
    })

    it("should create ApiError with all parameters", () => {
      const error = new ApiError("Unauthorized", 401, "/api/user/self")

      expect(error.message).toBe("Unauthorized")
      expect(error.statusCode).toBe(401)
      expect(error.endpoint).toBe("/api/user/self")
    })

    it("should handle empty message", () => {
      const error = new ApiError("")

      expect(error.message).toBe("")
      expect(error.name).toBe("ApiError")
    })

    it("should handle various status codes", () => {
      const error400 = new ApiError("Bad Request", 400)
      const error500 = new ApiError("Internal Server Error", 500)
      const error503 = new ApiError("Service Unavailable", 503)

      expect(error400.statusCode).toBe(400)
      expect(error500.statusCode).toBe(500)
      expect(error503.statusCode).toBe(503)
    })
  })

  describe("Error properties", () => {
    it("should have correct prototype chain", () => {
      const error = new ApiError("Test")

      expect(error instanceof ApiError).toBe(true)
      expect(error instanceof Error).toBe(true)
    })

    it("should preserve stack trace", () => {
      const error = new ApiError("Test error")

      expect(error.stack).toBeDefined()
      expect(error.stack).toContain("ApiError")
    })

    it("should allow updating properties after creation", () => {
      const error = new ApiError("Test")

      error.statusCode = 404
      error.endpoint = "/api/test"

      expect(error.statusCode).toBe(404)
      expect(error.endpoint).toBe("/api/test")
    })
  })

  describe("Error scenarios", () => {
    it("should handle typical HTTP error scenarios", () => {
      const notFound = new ApiError("Resource not found", 404, "/api/accounts")
      const unauthorized = new ApiError("Invalid token", 401, "/api/user/self")
      const serverError = new ApiError("Database error", 500, "/api/data")

      expect(notFound.statusCode).toBe(404)
      expect(unauthorized.statusCode).toBe(401)
      expect(serverError.statusCode).toBe(500)
    })

    it("should be throwable and catchable", () => {
      expect(() => {
        throw new ApiError("Test error", 500)
      }).toThrow(ApiError)

      try {
        throw new ApiError("Caught error", 404, "/api/test")
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError)
        if (error instanceof ApiError) {
          expect(error.statusCode).toBe(404)
          expect(error.endpoint).toBe("/api/test")
        }
      }
    })
  })
})
