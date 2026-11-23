/**
 * Validates and normalizes internal redirect paths to prevent open redirect vulnerabilities.
 *
 * Rules:
 * - Must be a non-empty string.
 * - Must start with a single forward slash '/'.
 * - Must NOT start with '//' (protocol-relative external redirect).
 * - Must NOT contain backslashes '\\'.
 * - Must NOT contain schemes ('http:', 'https:', 'javascript:', etc.).
 */
export function getSafeRedirectPath(rawPath?: string | null): string {
  if (!rawPath || typeof rawPath !== 'string') {
    return '/'
  }

  const trimmed = rawPath.trim()

  if (
    !trimmed.startsWith('/') ||
    trimmed.startsWith('//') ||
    trimmed.includes('\\') ||
    /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
  ) {
    return '/'
  }

  return trimmed
}
