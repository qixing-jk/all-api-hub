import { randomBytes } from "node:crypto"

import { hashAccessKey } from "./accessAuth.js"

const accessKey = randomBytes(18).toString("base64url")
process.stdout.write(
  `${JSON.stringify(
    {
      accessKey,
      accessKeyHash: hashAccessKey(accessKey),
    },
    null,
    2,
  )}\n`,
)
