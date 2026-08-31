import type { PollingOptions } from './types.js'

/**
 * Delay execution for a specified number of milliseconds
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Poll a condition function until it returns true or max attempts is reached
 */
export async function pollWithRetry<T>(
  condition: () => Promise<T | null | undefined>,
  options: PollingOptions = {},
): Promise<T> {
  const intervalMs = options.intervalMs || 1000
  const maxAttempts = options.maxAttempts || 30
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await condition()
    if (result !== null && result !== undefined) {
      return result
    }
    
    if (attempt < maxAttempts) {
      await delay(intervalMs)
    }
  }
  
  throw new Error(`Polling failed after ${maxAttempts} attempts`)
}
