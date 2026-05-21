export interface AgentTaskError {
  readonly code: string;
  readonly message: string;
  readonly cause?: unknown;
  readonly retryable?: boolean;
}

export function toAgentTaskError(error: unknown, code = "execution_failed"): AgentTaskError {
  if (error instanceof Error) {
    return {
      code,
      message: error.message,
      cause: error,
      retryable: false
    };
  }

  return {
    code,
    message: String(error),
    cause: error,
    retryable: false
  };
}
