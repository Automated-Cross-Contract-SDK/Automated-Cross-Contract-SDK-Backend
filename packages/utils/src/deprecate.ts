/**
 * Deprecation utilities for the SDK
 * 
 * This module provides runtime deprecation warnings to help users migrate
 * from deprecated APIs to their replacements.
 */

let warnedItems = new Set<string>()

/**
 * Emit a deprecation warning once per unique message
 * 
 * @param message The deprecation message to display
 * @param version The version when this will be removed (e.g., "v1.0.0")
 */
export function deprecate(message: string, version: string = 'v1.0.0'): void {
  const key = `${message}:${version}`
  
  if (warnedItems.has(key)) {
    return // Only warn once per unique message
  }
  
  warnedItems.add(key)
  
  const warning = `[DEPRECATION WARNING] ${message}. This will be removed in ${version}.`
  
  if (typeof console !== 'undefined' && console.warn) {
    console.warn(warning)
  }
}

/**
 * Wrap a function with a deprecation warning
 * 
 * @param fn The function to wrap
 * @param message The deprecation message
 * @param version The version when this will be removed
 * @returns A wrapped function that emits a warning on first call
 */
export function deprecateFn<T extends (...args: any[]) => any>(
  fn: T,
  message: string,
  version: string = 'v1.0.0'
): T {
  let hasWarned = false
  
  return ((...args: any[]) => {
    if (!hasWarned) {
      deprecate(message, version)
      hasWarned = true
    }
    return fn(...args)
  }) as T
}

/**
 * Clear the warning cache (useful for testing)
 */
export function clearDeprecationCache(): void {
  warnedItems = new Set<string>()
}

/**
 * Get the list of items that have been warned about (useful for testing)
 */
export function getWarnedItems(): string[] {
  return Array.from(warnedItems)
}
