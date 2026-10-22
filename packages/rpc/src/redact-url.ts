/**
 * RPC endpoint URL redaction
 *
 * RPC endpoints often carry credentials, either as userinfo or as API key
 * query parameters. These helpers return a copy that is safe to put in error
 * messages and diagnostics. The original URL is never modified.
 *
 * Limitation: credentials embedded in a URL path segment (for example
 * `https://provider.example/v1/<key>`) cannot be told apart from ordinary
 * path segments and are not redacted.
 */

const REDACTED = 'REDACTED'
const INVALID_URL_PLACEHOLDER = '<invalid url>'

const SENSITIVE_PARAM_NAME = /key|token|secret|auth|password|signature/i

/**
 * Returns the URL with userinfo and sensitive query parameter values replaced
 * by `REDACTED`. An input that does not parse as a URL becomes a placeholder,
 * so the raw string is never echoed.
 */
export function redactRpcUrl(input: string): string {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    return INVALID_URL_PLACEHOLDER
  }

  if (url.username) url.username = REDACTED
  if (url.password) url.password = REDACTED

  for (const name of new Set(url.searchParams.keys())) {
    if (SENSITIVE_PARAM_NAME.test(name)) {
      url.searchParams.set(name, REDACTED)
    }
  }

  return url.toString()
}

/**
 * Redacts a single endpoint or a list of endpoints, preserving the shape.
 */
export function redactRpcUrls(rpcUrl: string): string
export function redactRpcUrls(rpcUrl: string[]): string[]
export function redactRpcUrls(rpcUrl: string | string[]): string | string[]
export function redactRpcUrls(rpcUrl: string | string[]): string | string[] {
  return Array.isArray(rpcUrl) ? rpcUrl.map(redactRpcUrl) : redactRpcUrl(rpcUrl)
}

/**
 * Redacts every http(s) URL that appears inside free-form text, such as an
 * error message produced by an upstream SDK.
 */
export function redactUrlsInText(text: string): string {
  return text.replace(/https?:\/\/[^\s'"<>]+/gi, match => redactRpcUrl(match))
}
