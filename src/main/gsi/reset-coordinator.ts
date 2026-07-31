interface GSIResetHooks {
  suspend: () => Promise<void>
  resume: () => void
}

let resetHooks: GSIResetHooks | null = null

export function registerGSIResetHooks(hooks: GSIResetHooks): void {
  resetHooks = hooks
}

export async function suspendGSIProcessingForMatchReset(): Promise<void> {
  await resetHooks?.suspend()
}

export function resumeGSIProcessingAfterMatchReset(): void {
  resetHooks?.resume()
}
