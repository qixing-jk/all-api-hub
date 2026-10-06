import { collectAccountRuntimeKeySecrets } from "~/services/accounts/accountRuntimeKeys"

export const addRedactionSecrets = (
  secretsToRedact: Set<string>,
  secrets: Array<string | undefined>,
) => {
  secrets.forEach((secret) => {
    if (secret) {
      secretsToRedact.add(secret)
    }
  })
}

export const addRuntimeKeyRedactionSecrets = (
  secretsToRedact: Set<string>,
  runtimeKeys: Parameters<typeof collectAccountRuntimeKeySecrets>[0],
) => {
  collectAccountRuntimeKeySecrets(runtimeKeys).forEach((secret) =>
    secretsToRedact.add(secret),
  )
}
