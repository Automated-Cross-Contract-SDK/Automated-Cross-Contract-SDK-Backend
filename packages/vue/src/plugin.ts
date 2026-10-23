import type { App, Plugin } from 'vue';

type ListenerTarget = {
  addEventListener?: (type: string, listener: EventListenerOrEventListenerObject, options?: unknown) => void;
  removeEventListener?: (type: string, listener: EventListenerOrEventListenerObject, options?: unknown) => void;
};

interface RegisteredListener {
  target: ListenerTarget;
  type: string;
  listener: EventListenerOrEventListenerObject;
  options?: unknown;
}

const appListeners = new WeakMap<App, RegisteredListener[]>();

function getTarget(): ListenerTarget | undefined {
  if (typeof window !== 'undefined') {
    return window as unknown as ListenerTarget;
  }
  if (typeof globalThis !== 'undefined') {
    return globalThis as unknown as ListenerTarget;
  }
  return undefined;
}

/**
 * Register a DOM/global event listener that is automatically removed when the
 * given Vue app instance is unmounted. Listeners registered after the app has
 * already been unmounted are ignored so they cannot leak.
 */
export function addAppListener(
  app: App,
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: unknown,
): void {
  const target = getTarget();
  if (!target || typeof target.addEventListener !== 'function') {
    return;
  }

  const existing = appListeners.get(app);
  if (existing === undefined) {
    // App was already unmounted (or never tracked); do not register.
    return;
  }

  target.addEventListener(type, listener, options);
  existing.push({ target, type, listener, options });
}

function cleanupAppListeners(app: App): void {
  const listeners = appListeners.get(app);
  if (!listeners) {
    return;
  }
  for (const { target, type, listener, options } of listeners) {
    if (typeof target.removeEventListener === 'function') {
      target.removeEventListener(type, listener, options);
    }
  }
  appListeners.set(app, []);
}

/**
 * Vue plugin that tracks listeners registered via {@link addAppListener} and
 * detaches them when the app instance is unmounted.
 */
export const listenerCleanupPlugin: Plugin = {
  install(app: App) {
    appListeners.set(app, []);

    const originalUnmount = app.unmount.bind(app);
    app.unmount = () => {
      cleanupAppListeners(app);
      originalUnmount();
    };
  },
};

export default listenerCleanupPlugin;
