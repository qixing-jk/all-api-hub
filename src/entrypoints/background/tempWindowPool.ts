/** Background compatibility entrypoint for temporary-page execution and lifecycle. */
export { executeAuthorizedTempContextTask } from "~/services/browsingContext/tempPage/taskDispatch"
export {
  cleanupTempContextsOnSuspend,
  handleCloseTempWindow,
  setupTempWindowListeners,
  tempWindowBackgroundRuntime,
} from "~/services/browsingContext/tempPage/runtime"
export type {
  AuthorizeTempContextAtAcquire,
  ReportAuthorizedTempContextOutcome,
} from "~/services/browsingContext/tempPage/contracts"
