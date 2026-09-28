// Internationalization module for SorobanResurrectError
import { en } from './en';
import { ko } from './ko';
import { ja } from './ja';
import { zh } from './zh';
import { es } from './es';

export type Locale = 'en' | 'ko' | 'ja' | 'zh' | 'es';

/**
 * Error codes emitted by the SorobanResurrectError package.
 * The `en` catalog is typed as a total `Record` over these codes so that
 * adding a new code (or deleting a key from `en`) fails typecheck.
 */
export type SorobanResurrectErrorCode =
  | 'resurrect_invalid_ledger_key'
  | 'resurrect_missing_ledger_entry'
  | 'resurrect_expired_ledger_entry'
  | 'resurrect_unsupported_protocol_version'
  | 'resurrect_invalid_footprint'
  | 'resurrect_restore_failed'
  | 'resurrect_unknown_error';

/** Total catalog: every error code must be present. */
export type LocaleMessages = Record<SorobanResurrectErrorCode, string>;

/** Non-`en` catalogs may be partial and fall back to `en` at runtime. */
export type PartialLocaleMessages = Partial<LocaleMessages>;

export const locales: Record<Locale, PartialLocaleMessages> = {
  en,
  ko,
  ja,
  zh,
  es,
};

/**
 * Resolve a locale's catalog, falling back to `en` for any missing keys.
 * Returns a total `LocaleMessages` so callers always get a string per code.
 */
export function loadLocale(locale: string): LocaleMessages {
  const messages = locales[locale as Locale] || locales['en'];
  return { ...locales['en'], ...messages } as LocaleMessages;
}

export function formatMessage(template: string, ...args: any[]): string {
  return args.reduce((result, arg, index) => {
    return result.replace(`{${index}}`, String(arg));
  }, template);
}

export function getMessage(locale: string, code: string, ...args: any[]): string {
  const messages = loadLocale(locale);
  const template = messages[code as SorobanResurrectErrorCode] || `Unknown error: ${code}`;
  return formatMessage(template, ...args);
}
