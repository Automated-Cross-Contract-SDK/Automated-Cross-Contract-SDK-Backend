import { describe, it, expect, beforeEach, vi } from 'vitest'
import { deprecate, deprecateFn, clearDeprecationCache, getWarnedItems } from './deprecate.js'

describe('deprecate utilities', () => {
  beforeEach(() => {
    clearDeprecationCache()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('should emit deprecation warning once per unique message', () => {
    deprecate('Test warning', 'v1.0.0')
    deprecate('Test warning', 'v1.0.0')
    deprecate('Test warning', 'v1.0.0')

    expect(console.warn).toHaveBeenCalledTimes(1)
    expect(getWarnedItems()).toHaveLength(1)
  })

  it('should emit different warnings for different messages', () => {
    deprecate('Warning 1', 'v1.0.0')
    deprecate('Warning 2', 'v1.0.0')

    expect(console.warn).toHaveBeenCalledTimes(2)
    expect(getWarnedItems()).toHaveLength(2)
  })

  it('should treat same message with different version as different warnings', () => {
    deprecate('Test warning', 'v1.0.0')
    deprecate('Test warning', 'v2.0.0')

    expect(console.warn).toHaveBeenCalledTimes(2)
    expect(getWarnedItems()).toHaveLength(2)
  })

  it('should wrap function with deprecation warning', () => {
    const mockFn = vi.fn(() => 'result')
    const wrappedFn = deprecateFn(mockFn, 'Function is deprecated', 'v1.0.0')

    const result1 = wrappedFn()
    const result2 = wrappedFn()
    const result3 = wrappedFn()

    expect(result1).toBe('result')
    expect(result2).toBe('result')
    expect(result3).toBe('result')
    expect(mockFn).toHaveBeenCalledTimes(3)
    expect(console.warn).toHaveBeenCalledTimes(1)
  })

  it('should clear deprecation cache', () => {
    deprecate('Test warning', 'v1.0.0')
    expect(getWarnedItems()).toHaveLength(1)

    clearDeprecationCache()
    expect(getWarnedItems()).toHaveLength(0)

    deprecate('Test warning', 'v1.0.0')
    expect(console.warn).toHaveBeenCalledTimes(2) // Once before clear, once after
  })

  it('should track warned items correctly', () => {
    deprecate('Warning 1', 'v1.0.0')
    deprecate('Warning 2', 'v2.0.0')

    const warned = getWarnedItems()
    expect(warned).toContain('Warning 1:v1.0.0')
    expect(warned).toContain('Warning 2:v2.0.0')
  })

  it('should handle console.warn being undefined', () => {
    const originalWarn = console.warn
    // @ts-ignore - testing undefined case
    console.warn = undefined

    expect(() => deprecate('Test', 'v1.0.0')).not.toThrow()

    console.warn = originalWarn
  })
})
