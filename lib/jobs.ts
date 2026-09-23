export function failedJobState(attemptsMade: number, maxAttempts: number): { status: "QUEUED" | "FAILED"; canRetry: boolean } {
  const canRetry = attemptsMade < maxAttempts;
  return { status: canRetry ? "QUEUED" : "FAILED", canRetry };
}
