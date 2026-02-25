/**
 * Detect if an error is likely due to backend being unreachable (cold start, timeout, 5xx).
 */
export function isRetryableConnectionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; response?: { status?: number } };
  const status = err.response?.status;
  const code = err.code;
  // Network timeout or connection refused
  if (code === "ECONNABORTED" || code === "ERR_NETWORK") return true;
  // Server errors (cold backend often returns 502/503)
  if (status && status >= 500) return true;
  // No response (connection refused, etc.)
  if (!err.response && code) return true;
  return false;
}
