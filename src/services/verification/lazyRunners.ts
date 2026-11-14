/** Page callers load provider SDKs only after the user starts verification. */
export const runApiVerificationProbe: typeof import("./aiApiVerification/apiVerificationService").runApiVerificationProbe =
  async (...args) => {
    const runner = await import("./aiApiVerification/apiVerificationService")
    return runner.runApiVerificationProbe(...args)
  }

/** Preserve the streaming and cancellation contract across the loading boundary. */
export const runQuestionAnswerTest: typeof import("./modelQuality/questionAnswer").runQuestionAnswerTest =
  async (...args) => {
    const runner = await import("./modelQuality/questionAnswer")
    return runner.runQuestionAnswerTest(...args)
  }

/** Keep context probing and its tokenizer out of page startup. */
export const runContextCapacity: typeof import("./modelQuality/contextCapacityRun").runContextCapacity =
  async (...args) => {
    const runner = await import("./modelQuality/contextCapacityRun")
    return runner.runContextCapacity(...args)
  }

/** Load the drawing executor when a drawing test is requested. */
export const runPelicanTest: typeof import("./modelQuality/pelican").runPelicanTest =
  async (...args) => {
    const runner = await import("./modelQuality/pelican")
    return runner.runPelicanTest(...args)
  }
