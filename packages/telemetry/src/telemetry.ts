/**
 * Browser telemetry.
 *
 * Telemetry is **opt-in**: nothing is collected or sent until the user
 * explicitly grants consent via {@link setTelemetryConsent}(true). Consent is
 * persisted in `localStorage` when available; if storage is unavailable the
 * in-memory consent flag is still honored for the current session.
 *
 * Collected fields (and nothing else):
 *   - `event`: a fixed, allow-listed event name (see {@link TelemetryEvent})
 *   - `timestamp`: ISO-8601 time the event was recorded
 *   - `appVersion`: the client version string, when provided
 *   - `properties`: a small, allow-listed bag of primitive values
 *
 * Never collected: wallet addresses, private keys, seed phrases, RPC URLs,
 * transaction payloads, or any free-form user input. Property values are
 * coerced to primitives and truncated to {@link MAX_PROPERTY_LENGTH}.
 */

export type TelemetryEvent =
  | 'app_started'
  | 'wallet_connected'
  | 'wallet_disconnected'
  | 'transaction_submitted'
  | 'rpc_error';

export type TelemetryPropertyValue = string | number | boolean;

export type TelemetryProperties = Record<string, TelemetryPropertyValue>;

export interface TelemetryPayload {
  event: TelemetryEvent;
  timestamp: string;
  appVersion?: string;
  properties?: TelemetryProperties;
}

export type TelemetrySink = (payload: TelemetryPayload) => void | Promise<void>;

export interface TelemetryOptions {
  /** Sink that receives payloads once consent is granted. */
  sink?: TelemetrySink;
  /** Client version reported with each event. */
  appVersion?: string;
  /** Storage key used to persist consent. Defaults to {@link CONSENT_STORAGE_KEY}. */
  storageKey?: string;
}

export const CONSENT_STORAGE_KEY = 'handsoff.telemetry.consent';
export const MAX_PROPERTY_LENGTH = 128;

const ALLOWED_EVENTS: ReadonlySet<TelemetryEvent> = new Set<TelemetryEvent>([
  'app_started',
  'wallet_connected',
  'wallet_disconnected',
  'transaction_submitted',
  'rpc_error',
]);

function getStorage(): Storage | undefined {
  try {
    if (typeof globalThis === 'undefined') return undefined;
    const storage = (globalThis as { localStorage?: Storage }).localStorage;
    return storage ?? undefined;
  } catch {
    // Accessing localStorage can throw (e.g. disabled cookies / sandboxed iframe).
    return undefined;
  }
}

function sanitizeProperties(
  properties: TelemetryProperties | undefined,
): TelemetryProperties | undefined {
  if (!properties) return undefined;
  const result: TelemetryProperties = {};
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === 'string') {
      result[key] = value.slice(0, MAX_PROPERTY_LENGTH);
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      result[key] = value;
    } else if (typeof value === 'boolean') {
      result[key] = value;
    }
    // Anything else (objects, functions, NaN, Infinity) is dropped.
  }
  return result;
}

export class Telemetry {
  private readonly sink?: TelemetrySink;
  private readonly appVersion?: string;
  private readonly storageKey: string;
  private consent: boolean;

  constructor(options: TelemetryOptions = {}) {
    this.sink = options.sink;
    this.appVersion = options.appVersion;
    this.storageKey = options.storageKey ?? CONSENT_STORAGE_KEY;
    this.consent = this.readConsent();
  }

  private readConsent(): boolean {
    const storage = getStorage();
    if (!storage) return false;
    try {
      return storage.getItem(this.storageKey) === 'true';
    } catch {
      return false;
    }
  }

  /** Whether the user has opted in to telemetry. */
  isEnabled(): boolean {
    return this.consent;
  }

  /**
   * Grant or revoke telemetry consent. Revoking takes effect immediately and
   * stops all further collection.
   */
  setConsent(granted: boolean): void {
    this.consent = granted;
    const storage = getStorage();
    if (!storage) return;
    try {
      if (granted) {
        storage.setItem(this.storageKey, 'true');
      } else {
        storage.removeItem(this.storageKey);
      }
    } catch {
      // Persistence is best-effort; in-memory consent still applies.
    }
  }

  /**
   * Record a telemetry event. No-op unless the user has opted in and a sink is
   * configured. Unknown event names are ignored.
   */
  track(event: TelemetryEvent, properties?: TelemetryProperties): void {
    if (!this.consent || !this.sink) return;
    if (!ALLOWED_EVENTS.has(event)) return;

    const payload: TelemetryPayload = {
      event,
      timestamp: new Date().toISOString(),
    };
    if (this.appVersion) payload.appVersion = this.appVersion;
    const sanitized = sanitizeProperties(properties);
    if (sanitized && Object.keys(sanitized).length > 0) {
      payload.properties = sanitized;
    }

    try {
      void this.sink(payload);
    } catch {
      // Telemetry must never break the app.
    }
  }
}
