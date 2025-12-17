import { setupServer } from "msw/node"

import { handlers } from "./handlers"

const resolvedHandlers = Array.isArray(handlers) ? handlers : []
export const server = setupServer(...resolvedHandlers)
