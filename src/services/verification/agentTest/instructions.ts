/** Delivery contract supplied by a test, independently of its user prompt. */
export type AgentTestTask = {
  artifactPath: string
}

const ENVIRONMENT_INSTRUCTIONS =
  "You are working in a disposable virtual workspace. File tools and JavaScript execution are available. No real filesystem, shell, network or browser APIs are available."

/** Combine the shared environment description with this run's delivery contract. */
export function createAgentTestInstructions(task: AgentTestTask): string {
  return `${ENVIRONMENT_INSTRUCTIONS}\n\nTask delivery: Save the final artifact to ${JSON.stringify(task.artifactPath)} in the virtual workspace. The artifact is read from that file, not from your final reply.`
}
