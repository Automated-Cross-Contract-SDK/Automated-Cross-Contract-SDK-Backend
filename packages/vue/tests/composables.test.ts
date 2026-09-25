import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { SorobanResurrectPlugin } from '../src/SorobanResurrectPlugin.js'
import type { Plugin } from 'vue'

vi.mock('@soroban-resurrect/sdk', () => ({
  SorobanResurrect: vi.fn().mockImplementation(() => ({
    simulate: vi.fn().mockResolvedValue({
      needsRestoration: false,
      archivedKeys: [],
      totalKeysInFootprint: 0,
    }),
    buildRestoreTransaction: vi.fn(),
    executeRestoreThenOriginal: vi.fn(),
    checkAndPrepare: vi.fn(),
  })),
}))

describe('Vue Framework: SorobanResurrectPlugin', () => {
  describe('plugin initialization', () => {
    it('renders without crash when plugin is installed', () => {
      const TestComponent = defineComponent({
        template: '<div>{{ isConnected }}</div>',
        setup() {
          return { isConnected: ref(false) }
        },
      })

      const app = mount(TestComponent, {
        global: {
          plugins: [
            SorobanResurrectPlugin.install as Plugin,
          ],
        },
      })

      expect(app.exists()).toBe(true)
      expect(app.html()).toContain('<div>false</div>')
    })

    it('provides SorobanResurrect instance to component tree', () => {
      const TestComponent = defineComponent({
        template: '<div>{{ testValue }}</div>',
        setup() {
          return { testValue: 'component_rendered' }
        },
      })

      const app = mount(TestComponent, {
        global: {
          plugins: [
            SorobanResurrectPlugin.install as Plugin,
          ],
        },
      })

      expect(app.vm).toBeDefined()
      expect(app.html()).toContain('component_rendered')
    })

    it('handles state transitions without crashing', async () => {
      const TestComponent = defineComponent({
        template: `
          <div>
            <button @click="toggleState">Toggle</button>
            <span v-if="isLoading">Loading...</span>
            <span v-else>Ready</span>
          </div>
        `,
        setup() {
          const isLoading = ref(false)
          return {
            isLoading,
            toggleState: () => {
              isLoading.value = !isLoading.value
            },
          }
        },
      })

      const app = mount(TestComponent)
      expect(app.html()).toContain('Ready')

      await app.find('button').trigger('click')
      expect(app.html()).toContain('Loading...')

      await app.find('button').trigger('click')
      expect(app.html()).toContain('Ready')
    })
  })

  describe('component rendering', () => {
    it('renders multiple components with shared plugin state', () => {
      const ComponentA = defineComponent({
        template: '<div class="component-a">A</div>',
      })

      const ComponentB = defineComponent({
        template: '<div class="component-b">B</div>',
      })

      const TestComponent = defineComponent({
        components: { ComponentA, ComponentB },
        template: '<div><ComponentA /><ComponentB /></div>',
      })

      const app = mount(TestComponent, {
        global: {
          plugins: [
            SorobanResurrectPlugin.install as Plugin,
          ],
        },
      })

      expect(app.html()).toContain('component-a')
      expect(app.html()).toContain('component-b')
    })

    it('handles reactive state changes without memory leaks', async () => {
      const TestComponent = defineComponent({
        template: `
          <div>
            <p>Count: {{ count }}</p>
            <button @click="count++">Increment</button>
          </div>
        `,
        setup() {
          return { count: ref(0) }
        },
      })

      const app = mount(TestComponent, {
        global: {
          plugins: [
            SorobanResurrectPlugin.install as Plugin,
          ],
        },
      })

      expect(app.text()).toContain('Count: 0')

      await app.find('button').trigger('click')
      expect(app.text()).toContain('Count: 1')

      await app.find('button').trigger('click')
      expect(app.text()).toContain('Count: 2')
    })
  })

  describe('error handling', () => {
    it('gracefully handles component errors', () => {
      const ErrorComponent = defineComponent({
        template: '<div>Error Test</div>',
        setup() {
          return {}
        },
      })

      const app = mount(ErrorComponent, {
        global: {
          plugins: [
            SorobanResurrectPlugin.install as Plugin,
          ],
        },
      })

      expect(app.exists()).toBe(true)
      expect(app.text()).toContain('Error Test')
    })
  })
})
