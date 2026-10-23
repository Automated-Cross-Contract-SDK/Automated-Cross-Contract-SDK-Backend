/**
 * Browser telemetry for the wallet SDK.
 *
 * Telemetry is **opt-in**: nothing is collected or sent until a consumer
 * explicitly calls {@link enableTelemetry} (or {@link setConsent} with `true`).
 * Consent is persisted in `localStorage` when available; when storage is
 * unavailable (private mode, SSR, non-browser runtimes) consent defaults to
 * disabled and enabling only affects the current in-memory session.
 *
 * Collected fields (and nothing else):
 * - `event`: a fixed, allow-listed event name (see {@link TelemetryEventName}).
 * - `timestamp`: epoch milliseconds when the event was recorded.
 * - `sdkVersion`: the SDK version string, when provided by the host.
 * - `properties`: a small, allow-listed bag of primitive values.
 *
 * Never collected: wallet addresses, private keys, signatures, RPC URLs,
 * request/response payloads, IP addresses, or any free-form user input.
 * Property values are truncated to {@link MAX_PROPERTY_LENGTH} characters and
 * only primitives are accepted; nested objects/arrays are dropped.
 */

export type TelemetryEventName =
  | 'wallet_connect'
  | 'wallet_disconnect'
  | 'transaction_sign'
  | 'transaction_send'
  | 'rpc_error';

export type TelemetryPropertyValue = string | number | boolean;

export interface TelemetryEvent {
  event: TelemetryEventName;
  timestamp: number;
  sdkVersion?: string;
  properties?: Record<string, TelemetryPropertyValue>;
}

export type TelemetrySink = (event: TelemetryEvent) => void;

export interface TelemetryOptions {
  /** Transport that receives events. Only invoked after opt-in. */
  sink?: TelemetrySink;
  /** SDK version reported with each event. */
  sdkVersion?: string;
  /** Storage key used to persist consent. Defaults to {@link CONSENT_STORAGE_KEY}. */
  storageKey?: string;
}

/** Maximum length of a string property value before truncation. */
export const MAX_PROPERTY_LENGTH = 128;

/** Default `localStorage` key used to persist opt-in consent. */
export const CONSENT_STORAGE_KEY = 'handsoff.telemetry.consent';

const ALLOWED_EVENTS: ReadonlySet<TelemetryEventName> = new Set([
  'wallet_connect',
  'wallet_disconnect',
  'transaction_sign',
  'transaction_send',
  'rpc_error',
]);

interface TelemetryState {
  enabled: boolean;
  sink?: TelemetrySink;
  sdkVersion?: string;
  storageKey: string;
}

const state: TelemetryState = {
  enabled: false,
  storageKey: CONSENT_STORAGE_KEY,
};

function getStorage(): Storage | undefined {
  try {
    if (typeof globalThis === 'undefined') return undefined;
    const storage = (globalThis as { localStorage?: Storage }).localStorage;
    if (!storage) return undefined;
    // Probe access; some browsers throw on read/write in private mode.
    const probeKey = '__handsoff_telemetry_probe__';
    storage.setItem(probeKey, '1');
    storage.removeItem(probeKey);
    return storage;
  } catch {
    return undefined;
  }
}

function readPersistedConsent(storageKey: string): boolean {
  const storage = getStorage();
  if (!storage) return false;
  try {
    return storage.getItem(storageKey) === 'true';
  } catch {
    return false;
  }
}

function persistConsent(storageKey: string, enabled: boolean): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    if (enabled) {
      storage.setItem(storageKey, 'true');
    } else {
      storage.removeItem(storageKey);
    }
  } catch {
    // Storage may become unavailable; consent stays in-memory only.
  }
}

/**
 * Configure the telemetry transport and restore any persisted opt-in consent.
 * Calling this does **not** enable telemetry by itself.
 */
export function configureTelemetry(options: TelemetryOptions = {}): void {
  state.sink = options.sink;
  state.sdkVersion = options.sdkVersion;
  state.storageKey = options.storageKey ?? CONSENT_STORAGE_KEY;
  state.enabled = readPersistedConsent(state.storageKey);
}

/** Returns whether telemetry is currently enabled (opt-in). */
export function isTelemetryEnabled(): boolean {
  return state.enabled;
}

/** Explicitly opt in to telemetry and persist consent when possible. */
export function enableTelemetry(): void {
  state.enabled = true;
  persistConsent(state.storageKey, true);
}

/** Revoke consent; no further events are recorded or sent. */
export function disableTelemetry(): void {
  state.enabled = false;
  persistConsent(state.storageKey, false);
}

/** Set consent explicitly. Equivalent to enable/disable. */
export function setConsent(enabled: boolean): void {
  if (enabled) {
    enableTelemetry();
  } else {
    disableTelemetry();
  }
}

function sanitizeProperties(
  properties: Record<string, unknown> | undefined,
): Record<string, TelemetryPropertyValue> | undefined {
  if (!properties) return undefined;
  const sanitized: Record<string, TelemetryPropertyValue> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === 'string') {
      sanitized[key] = value.slice(0, MAX_PROPERTY_LENGTH);
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      sanitized[key] = value;
    } else if (typeof value === 'boolean') {
      sanitized[key] = value;
    }
    // Nested objects, arrays, functions, null, and non-finite numbers are dropped.
  }
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

/**
 * Record a telemetry event. No-op unless telemetry has been explicitly enabled.
 * Unknown event names are ignored.
 */
export function trackEvent(
  event: TelemetryEventName,
  properties?: Record<string, unknown>,
): void {
  if (!state.enabled) return;
  if (!ALLOWED_EVENTS.has(event)) return;

  const payload: TelemetryEvent = {
    event,
    timestamp: Date.now(),
  };
  if (state.sdkVersion) payload.sdkVersion = state.sdkVersion;
  const sanitized = sanitizeProperties(properties);
  if (sanitized) payload.properties = sanitized;

  try {
    state.sink?.(payload);
  } catch {
    // A failing sink must never break wallet flows.
  }
}

/** Reset in-memory state. Intended for tests. */
export function __resetTelemetryForTests(): void {
  state.enabled = false;
  state.sink = undefined;
  state.sdkVersion = undefined;
  state.storageKey = CONSENT_STORAGE_KEY;
}
