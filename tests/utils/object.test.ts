import { describe, expect, it } from "vitest"

import { isPlainObject } from "~/utils/core/object"

describe("isPlainObject", () => {
  it("returns true for plain objects", () => {
    // Arrange
    const emptyObject = {}
    const keyedObject = { key: "value" }
    const value = Object.create(null) as Record<string, unknown>
    value.key = "value"

    // Act
    const emptyObjectResult = isPlainObject(emptyObject)
    const keyedObjectResult = isPlainObject(keyedObject)
    const nullPrototypeObjectResult = isPlainObject(value)

    // Assert
    expect(emptyObjectResult).toBe(true)
    expect(keyedObjectResult).toBe(true)
    expect(nullPrototypeObjectResult).toBe(true)
  })

  it("returns false for arrays, primitives, and non-plain objects", () => {
    // Arrange
    class Example {
      value = 1
    }

    const arrayValue: unknown = []
    const stringValue: unknown = "value"
    const numberValue: unknown = 123
    const booleanValue: unknown = true
    const nullValue: unknown = null
    const undefinedValue: unknown = undefined
    const dateValue: unknown = new Date("2026-01-01T00:00:00.000Z")
    const mapValue: unknown = new Map()
    const classInstanceValue: unknown = new Example()

    // Act
    const arrayResult = isPlainObject(arrayValue)
    const stringResult = isPlainObject(stringValue)
    const numberResult = isPlainObject(numberValue)
    const booleanResult = isPlainObject(booleanValue)
    const nullResult = isPlainObject(nullValue)
    const undefinedResult = isPlainObject(undefinedValue)
    const dateResult = isPlainObject(dateValue)
    const mapResult = isPlainObject(mapValue)
    const classInstanceResult = isPlainObject(classInstanceValue)

    // Assert
    expect(arrayResult).toBe(false)
    expect(stringResult).toBe(false)
    expect(numberResult).toBe(false)
    expect(booleanResult).toBe(false)
    expect(nullResult).toBe(false)
    expect(undefinedResult).toBe(false)
    expect(dateResult).toBe(false)
    expect(mapResult).toBe(false)
    expect(classInstanceResult).toBe(false)
  })
})
