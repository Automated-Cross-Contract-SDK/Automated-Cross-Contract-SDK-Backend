/**
 * Lightweight dependency injection container for the Soroban-Resurrect SDK.
 *
 * Supports constructor-based injection via a simple bind/resolve API that is
 * entirely runtime-level (no TypeScript decorators, no reflect-metadata).
 *
 * @example
 * ```ts
 * const container = new Container();
 * container.bind(SorobanRpcClient).to(MockRpcClient);
 * container.bind(RetryPolicy).to(CustomRetryPolicy);
 * const resurrect = container.resolve(SorobanResurrect);
 * ```
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Constructor<T = unknown> = new (...args: any[]) => T

/** A factory function that the container calls when it resolves a token. */
type Factory<T> = () => T

/** Binding descriptor stored inside the container. */
type Binding<T> =
  | { kind: 'class'; impl: Constructor<T> }
  | { kind: 'factory'; factory: Factory<T> }
  | { kind: 'value'; value: T }

/**
 * Opaque token used to identify a dependency binding.
 * Use class constructors directly or create named tokens via `Token.for()`.
 */
export class Token<T = unknown> {
  readonly description: string

  constructor(description: string) {
    this.description = description
  }

  /** Create a named token with a descriptive identifier. */
  static for<T>(description: string): Token<T> {
    return new Token<T>(description)
  }

  toString(): string {
    return `Token(${this.description})`
  }
}

/** Anything that can be used as a binding key. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BindingKey<T = unknown> = Constructor<T> | Token<T>

/**
 * Fluent binding builder returned by `container.bind(key)`.
 */
export class BindingBuilder<T> {
  private readonly container: Container
  private readonly key: BindingKey<T>

  constructor(container: Container, key: BindingKey<T>) {
    this.container = container
    this.key = key
  }

  /** Bind to a concrete class that the container will instantiate. */
  to(impl: Constructor<T>): Container {
    this.container['_register'](this.key, { kind: 'class', impl })
    return this.container
  }

  /** Bind to a factory function. */
  toFactory(factory: Factory<T>): Container {
    this.container['_register'](this.key, { kind: 'factory', factory })
    return this.container
  }

  /** Bind to a pre-built instance (singleton value). */
  toValue(value: T): Container {
    this.container['_register'](this.key, { kind: 'value', value })
    return this.container
  }
}

/**
 * Lightweight dependency injection container.
 *
 * Features:
 * - Bind class constructors, factory functions, or pre-built values.
 * - Child containers inherit parent bindings and can override them locally.
 * - Singleton scope: resolved instances are cached after first creation.
 * - `resolve()` works on any class even if it has no registered binding —
 *   the container will attempt to instantiate it with zero arguments.
 */
export class Container {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly bindings = new Map<BindingKey<any>, Binding<any>>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly singletons = new Map<BindingKey<any>, any>()
  private readonly parent?: Container

  constructor(parent?: Container) {
    this.parent = parent
  }

  /** Register a binding (called internally by BindingBuilder). */
  private _register<T>(key: BindingKey<T>, binding: Binding<T>): void {
    this.bindings.set(key, binding)
    // Evict cached singleton when re-binding
    this.singletons.delete(key)
  }

  /**
   * Start a fluent binding chain.
   *
   * @example
   * container.bind(SorobanRpcClient).to(MockRpcClient);
   * container.bind(Token.for('apiKey')).toValue('secret');
   */
  bind<T>(key: BindingKey<T>): BindingBuilder<T> {
    return new BindingBuilder<T>(this, key)
  }

  /**
   * Check whether a binding exists for the given key in this container
   * or any ancestor.
   */
  has<T>(key: BindingKey<T>): boolean {
    return this.bindings.has(key) || (this.parent?.has(key) ?? false)
  }

  /**
   * Remove a binding from this container (does not affect parent).
   * Clears the cached singleton for that key as well.
   */
  unbind<T>(key: BindingKey<T>): void {
    this.bindings.delete(key)
    this.singletons.delete(key)
  }

  /**
   * Resolve a dependency.
   *
   * Resolution order:
   * 1. Singleton cache (this container, then parent)
   * 2. Registered binding (this container, then parent)
   * 3. Direct class instantiation with zero arguments (fallback)
   *
   * @throws {ContainerError} when the token cannot be resolved and is not a
   *   constructor that can be called with no arguments.
   */
  resolve<T>(key: BindingKey<T>): T {
    // Check singleton cache in this container first
    if (this.singletons.has(key)) {
      return this.singletons.get(key) as T
    }

    // Check local bindings
    if (this.bindings.has(key)) {
      const binding = this.bindings.get(key) as Binding<T>
      const instance = this._createFromBinding(binding)
      this.singletons.set(key, instance)
      return instance
    }

    // Delegate to parent container
    if (this.parent?.has(key)) {
      return this.parent.resolve(key)
    }

    // Fallback: attempt zero-argument instantiation for class constructors
    if (typeof key === 'function') {
      try {
        const instance = new (key as Constructor<T>)()
        this.singletons.set(key, instance)
        return instance
      } catch (err) {
        throw new ContainerError(
          `Cannot resolve "${(key as Constructor<T>).name}": no binding registered and zero-argument construction failed. ` +
          `Register a binding via container.bind(${(key as Constructor<T>).name}).to(impl).`,
          key,
          err,
        )
      }
    }

    throw new ContainerError(
      `Cannot resolve token "${String(key)}": no binding registered.`,
      key,
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _createFromBinding<T>(binding: Binding<T>): T {
    switch (binding.kind) {
      case 'class':
        return new binding.impl()
      case 'factory':
        return binding.factory()
      case 'value':
        return binding.value
    }
  }

  /**
   * Create a child container that inherits all bindings from this container.
   * The child can override bindings locally without affecting the parent.
   */
  createChild(): Container {
    return new Container(this)
  }

  /**
   * Reset all bindings and cached singletons in this container.
   * Does not affect the parent container.
   */
  reset(): void {
    this.bindings.clear()
    this.singletons.clear()
  }
}

/**
 * Error thrown when the container cannot resolve a dependency.
 */
export class ContainerError extends Error {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly key: BindingKey<any>
  readonly cause?: unknown

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(message: string, key: BindingKey<any>, cause?: unknown) {
    super(message)
    this.name = 'ContainerError'
    this.key = key
    this.cause = cause
  }
}
