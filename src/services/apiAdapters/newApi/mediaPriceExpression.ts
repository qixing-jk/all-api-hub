const MAX_MEDIA_EXPRESSION_TOKENS = 2048
const MAX_MEDIA_EXPRESSION_DEPTH = 32

type Facts = { resolution?: string; video_input?: boolean }
type Price = (facts: Facts) => number
type Condition = (facts: Facts) => boolean

/** Parse only finite prices and media selection trees, never JavaScript or upstream code. */
export function parseMediaPriceExpression(body: string) {
  const tokens = body.match(
    /\s+|[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|"[^"\\\r\n]*"|resolution|video_input|==|\|\||&&|[()?:]/g,
  )
  if (
    !tokens ||
    tokens.join("") !== body ||
    tokens.length > MAX_MEDIA_EXPRESSION_TOKENS
  )
    return undefined
  const input = tokens.filter((token) => token.trim())
  let position = 0
  let depth = 0
  const resolutions = new Set<string>()
  let usesVideoInput = false
  const consume = (token: string) => {
    if (input[position] !== token) throw new Error("Unsupported media price")
    position++
  }
  const conditionAtom = (): Condition => {
    if (++depth > MAX_MEDIA_EXPRESSION_DEPTH)
      throw new Error("Media expression depth")
    let result: Condition
    if (input[position] === "(") {
      position++
      result = condition()
      consume(")")
    } else if (input[position] === "video_input") {
      position++
      usesVideoInput = true
      result = (facts) => facts.video_input === true
    } else {
      consume("resolution")
      consume("==")
      const literal = input[position++]
      if (!/^"[^"\\]+"$/.test(literal ?? ""))
        throw new Error("Resolution literal required")
      const value = literal.slice(1, -1)
      resolutions.add(value)
      result = (facts) => facts.resolution === value
    }
    depth--
    return result
  }
  const conjunction = (): Condition => {
    let left = conditionAtom()
    while (input[position] === "&&") {
      position++
      const prior = left
      const right = conditionAtom()
      left = (facts) => prior(facts) && right(facts)
    }
    return left
  }
  const condition = (): Condition => {
    let left = conjunction()
    while (input[position] === "||") {
      position++
      const prior = left
      const right = conjunction()
      left = (facts) => prior(facts) || right(facts)
    }
    return left
  }
  const price = (): Price => {
    if (++depth > MAX_MEDIA_EXPRESSION_DEPTH)
      throw new Error("Media expression depth")
    const start = position
    const startingDepth = depth
    let predicate: Condition | undefined
    try {
      predicate = condition()
      consume("?")
    } catch {
      position = start
      predicate = undefined
    }
    depth = startingDepth
    let result: Price
    if (predicate) {
      const yes = price()
      consume(":")
      const no = price()
      result = (facts) => (predicate(facts) ? yes(facts) : no(facts))
    } else if (input[position] === "(") {
      position++
      result = price()
      consume(")")
    } else {
      const literal = input[position++]
      if (!/^[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/.test(literal ?? ""))
        throw new Error("Price literal required")
      const amount = Number(literal)
      if (!Number.isFinite(amount)) throw new Error("Finite price required")
      result = () => amount
    }
    depth--
    return result
  }
  try {
    const evaluate = price()
    if (position !== input.length) return undefined
    return { evaluate, resolutions, usesVideoInput }
  } catch {
    return undefined
  }
}
