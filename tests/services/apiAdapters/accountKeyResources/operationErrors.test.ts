import { expect, it } from "vitest"

import { classifyResourceChangedMutation } from "~/services/apiAdapters/accountKeyResources/operationErrors"
import {
  ACCOUNT_KEY_MUTATION_CERTAINTIES,
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  AccountKeyResourceError,
} from "~/services/apiAdapters/contracts/accountKeyResource"

it("only classifies an actual rejected baseline comparison as not applied", () => {
  const failure = { code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ResourceChanged }
  expect(
    classifyResourceChangedMutation(new AccountKeyResourceError(failure)),
  ).toBe(ACCOUNT_KEY_MUTATION_CERTAINTIES.NotApplied)
  expect(classifyResourceChangedMutation({ failure })).toBeUndefined()
})

it("keeps other errors unclassified for the mutation runner to inspect", () => {
  expect(
    classifyResourceChangedMutation(
      new AccountKeyResourceError({
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
      }),
    ),
  ).toBeUndefined()
  expect(
    classifyResourceChangedMutation(new Error("resource_changed")),
  ).toBeUndefined()
  expect(classifyResourceChangedMutation(null)).toBeUndefined()
})
