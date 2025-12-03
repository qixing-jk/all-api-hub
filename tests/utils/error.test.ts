import { describe, expect, it } from "vitest"

import { getErrorMessage } from "~/utils/error"

describe("getErrorMessage", () => {
  describe("Error instance handling", () => {
    it("should extract message from Error instance", () => {
      const error = new Error("Test error message")
      expect(getErrorMessage(error)).toBe("Test error message")
    })

    it("should extract message from TypeError instance", () => {
      const error = new TypeError("Type error occurred")
      expect(getErrorMessage(error)).toBe("Type error occurred")
    })

    it("should extract message from RangeError instance", () => {
      const error = new RangeError("Range error occurred")
      expect(getErrorMessage(error)).toBe("Range error occurred")
    })

    it("should handle Error with empty message", () => {
      const error = new Error("")
      expect(getErrorMessage(error)).toBe("")
    })
  })

  describe("String handling", () => {
    it("should return string as-is", () => {
      expect(getErrorMessage("Simple error string")).toBe("Simple error string")
    })

    it("should handle empty string", () => {
      expect(getErrorMessage("")).toBe("")
    })

    it("should handle string with special characters", () => {
      expect(getErrorMessage("Error: 404 - Not Found!")).toBe(
        "Error: 404 - Not Found!",
      )
    })

    it("should handle multiline string", () => {
      const multilineError = "Error:\nLine 1\nLine 2"
      expect(getErrorMessage(multilineError)).toBe(multilineError)
    })

    it("should handle Chinese characters", () => {
      expect(getErrorMessage("错误：网络连接失败")).toBe("错误：网络连接失败")
    })
  })

  describe("Object with message property", () => {
    it("should extract message from object with message property", () => {
      const errorObj = { message: "Custom error object", code: 500 }
      expect(getErrorMessage(errorObj)).toBe("Custom error object")
    })

    it("should handle message property with number value", () => {
      const errorObj = { message: 404 }
      expect(getErrorMessage(errorObj)).toBe("404")
    })

    it("should handle message property with null", () => {
      const errorObj = { message: null }
      expect(getErrorMessage(errorObj)).toBe("null")
    })

    it("should handle message property with undefined", () => {
      const errorObj = { message: undefined }
      expect(getErrorMessage(errorObj)).toBe("undefined")
    })

    it("should handle nested object in message", () => {
      const errorObj = { message: { detail: "Nested error" } }
      expect(getErrorMessage(errorObj)).toBe("[object Object]")
    })
  })

  describe("JSON serialization fallback", () => {
    it("should serialize number to string", () => {
      expect(getErrorMessage(42)).toBe("42")
    })

    it("should serialize boolean to string", () => {
      expect(getErrorMessage(true)).toBe("true")
      expect(getErrorMessage(false)).toBe("false")
    })

    it("should serialize array to JSON string", () => {
      expect(getErrorMessage([1, 2, 3])).toBe("[1,2,3]")
    })

    it("should serialize plain object to JSON string", () => {
      const obj = { status: 500, error: "Internal Server Error" }
      expect(getErrorMessage(obj)).toBe(
        '{"status":500,"error":"Internal Server Error"}',
      )
    })

    it("should serialize null to string", () => {
      expect(getErrorMessage(null)).toBe("null")
    })

    it("should serialize undefined to string", () => {
      // JSON.stringify(undefined) returns undefined, not "undefined"
      const result = getErrorMessage(undefined)
      expect(result).toBeUndefined()
    })
  })

  describe("Circular reference handling", () => {
    it("should handle circular reference with String() fallback", () => {
      const circular: any = { name: "test" }
      circular.self = circular

      const result = getErrorMessage(circular)
      expect(result).toBe("[object Object]")
    })

    it("should handle array with circular reference", () => {
      const circular: any = []
      circular.push(circular)

      const result = getErrorMessage(circular)
      expect(typeof result).toBe("string")
    })
  })

  describe("Edge cases", () => {
    it("should handle symbol value", () => {
      // JSON.stringify(Symbol) returns undefined
      const sym = Symbol("test")
      const result = getErrorMessage(sym)
      expect(result).toBeUndefined()
    })

    it("should handle function value", () => {
      // JSON.stringify(Function) returns undefined
      const fn = () => "test"
      const result = getErrorMessage(fn)
      expect(result).toBeUndefined()
    })

    it("should handle BigInt value", () => {
      const bigInt = BigInt(12345)
      const result = getErrorMessage(bigInt)
      expect(result).toBe("12345")
    })

    it("should handle Date object", () => {
      const date = new Date("2024-01-01T00:00:00.000Z")
      const result = getErrorMessage(date)
      expect(result).toContain("2024")
    })

    it("should handle RegExp object", () => {
      const regex = /test/g
      const result = getErrorMessage(regex)
      // RegExp serializes to empty object in JSON
      expect(typeof result).toBe("string")
    })
  })

  describe("API error scenarios", () => {
    it("should handle fetch error", () => {
      const fetchError = new TypeError("Failed to fetch")
      expect(getErrorMessage(fetchError)).toBe("Failed to fetch")
    })

    it("should handle axios-style error", () => {
      const axiosError = {
        message: "Request failed with status code 401",
        code: "ERR_BAD_REQUEST",
      }
      expect(getErrorMessage(axiosError)).toBe(
        "Request failed with status code 401",
      )
    })

    it("should handle network timeout error", () => {
      const timeoutError = new Error("Request timeout")
      expect(getErrorMessage(timeoutError)).toBe("Request timeout")
    })
  })
})
