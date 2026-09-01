// Internationalization module for SorobanResurrectError
import { en } from './en';
import { ko } from './ko';
import { ja } from './ja';
import { zh } from './zh';
import { es } from './es';

export type Locale = 'en' | 'ko' | 'ja' | 'zh' | 'es';

export interface LocaleMessages {
  [key: string]: string;
}

export const locales: Record<Locale, LocaleMessages> = {
  en,
  ko,
  ja,
  zh,
  es,
};

export function loadLocale(locale: string): LocaleMessages {
  return locales[locale as Locale] || locales['en'];
}

export function formatMessage(template: string, ...args: any[]): string {
  return args.reduce((result, arg, index) => {
    return result.replace(`{${index}}`, String(arg));
  }, template);
}

export function getMessage(locale: string, code: string, ...args: any[]): string {
  const messages = loadLocale(locale);
  const template = messages[code] || `Unknown error: ${code}`;
  return formatMessage(template, ...args);
}
