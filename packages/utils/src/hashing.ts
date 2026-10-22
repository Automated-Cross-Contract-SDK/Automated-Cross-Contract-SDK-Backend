/**
 * Simple hash function for strings
 * Uses a basic DJB2-like algorithm for consistent hashing
 */
export function hashString(input: string): string {
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0 // Convert to 32-bit unsigned
  }
  return hash.toString(16)
}
