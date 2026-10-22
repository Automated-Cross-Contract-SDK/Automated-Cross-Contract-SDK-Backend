import { describe, it, expect } from 'vitest';

// Mock the i18n system for testing
interface I18nConfig {
  locale: 'en' | 'ko' | 'ja' | 'zh' | 'es';
}

interface LocalizedMessage {
  code: string;
  locale: string;
  message: string;
}

const localeMessages: Record<string, Record<string, string>> = {
  en: {
    'ERR_INVALID_XDR': 'Invalid XDR format: {0}',
    'ERR_KEY_NOT_FOUND': 'Key not found in ledger: {0}',
    'ERR_SIMULATION_FAILED': 'Simulation failed with error: {0}',
    'ERR_INSUFFICIENT_BALANCE': 'Insufficient balance: required {0}, available {1}',
    'ERR_INVALID_CONTRACT': 'Invalid contract address: {0}',
  },
  ko: {
    'ERR_INVALID_XDR': '잘못된 XDR 형식: {0}',
    'ERR_KEY_NOT_FOUND': '원장에서 키를 찾을 수 없음: {0}',
    'ERR_SIMULATION_FAILED': '시뮬레이션 실패: {0}',
    'ERR_INSUFFICIENT_BALANCE': '잔액 부족: 필요 {0}, 사용 가능 {1}',
    'ERR_INVALID_CONTRACT': '잘못된 계약 주소: {0}',
  },
  ja: {
    'ERR_INVALID_XDR': '無効なXDR形式: {0}',
    'ERR_KEY_NOT_FOUND': '台帳にキーが見つかりません: {0}',
    'ERR_SIMULATION_FAILED': 'シミュレーション失敗: {0}',
    'ERR_INSUFFICIENT_BALANCE': '残高不足: 必要 {0}, 利用可能 {1}',
    'ERR_INVALID_CONTRACT': '無効なコントラクトアドレス: {0}',
  },
  zh: {
    'ERR_INVALID_XDR': '无效的XDR格式: {0}',
    'ERR_KEY_NOT_FOUND': '在账本中未找到密钥: {0}',
    'ERR_SIMULATION_FAILED': '模拟失败: {0}',
    'ERR_INSUFFICIENT_BALANCE': '余额不足: 需要 {0}，可用 {1}',
    'ERR_INVALID_CONTRACT': '无效的合约地址: {0}',
  },
  es: {
    'ERR_INVALID_XDR': 'Formato XDR inválido: {0}',
    'ERR_KEY_NOT_FOUND': 'Clave no encontrada en el libro mayor: {0}',
    'ERR_SIMULATION_FAILED': 'Simulación fallida: {0}',
    'ERR_INSUFFICIENT_BALANCE': 'Saldo insuficiente: requerido {0}, disponible {1}',
    'ERR_INVALID_CONTRACT': 'Dirección de contrato inválida: {0}',
  },
};

class SorobanResurrectError extends Error {
  constructor(
    public code: string,
    public locale: string = 'en',
    ...args: any[]
  ) {
    super();
    this.message = this.formatMessage(args);
  }

  private formatMessage(args: any[]): string {
    const messages = localeMessages[this.locale] || localeMessages['en'];
    let template = messages[this.code] || `Unknown error: ${this.code}`;

    // Simple ICU-like message formatting
    args.forEach((arg, index) => {
      template = template.replace(`{${index}}`, String(arg));
    });

    return template;
  }

  getErrorInfo() {
    return {
      code: this.code,
      message: this.message,
      locale: this.locale,
    };
  }
}

describe('Internationalization for Error Messages', () => {
  it('should support English locale by default', () => {
    const error = new SorobanResurrectError('ERR_INVALID_XDR', 'en', 'abc123');
    expect(error.message).toBe('Invalid XDR format: abc123');
    expect(error.code).toBe('ERR_INVALID_XDR');
  });

  it('should support Korean locale', () => {
    const error = new SorobanResurrectError('ERR_INVALID_XDR', 'ko', 'abc123');
    expect(error.message).toBe('잘못된 XDR 형식: abc123');
  });

  it('should support Japanese locale', () => {
    const error = new SorobanResurrectError('ERR_INVALID_XDR', 'ja', 'abc123');
    expect(error.message).toBe('無効なXDR形式: abc123');
  });

  it('should support Chinese locale', () => {
    const error = new SorobanResurrectError('ERR_INVALID_XDR', 'zh', 'abc123');
    expect(error.message).toBe('无效的XDR格式: abc123');
  });

  it('should support Spanish locale', () => {
    const error = new SorobanResurrectError('ERR_INVALID_XDR', 'es', 'abc123');
    expect(error.message).toBe('Formato XDR inválido: abc123');
  });

  it('should keep error code in English regardless of locale', () => {
    const errorKo = new SorobanResurrectError('ERR_KEY_NOT_FOUND', 'ko', 'key123');
    const errorJa = new SorobanResurrectError('ERR_KEY_NOT_FOUND', 'ja', 'key123');

    expect(errorKo.code).toBe('ERR_KEY_NOT_FOUND');
    expect(errorJa.code).toBe('ERR_KEY_NOT_FOUND');
    expect(errorKo.code).toBe(errorJa.code);
  });

  it('should handle ICU format with multiple parameters', () => {
    const error = new SorobanResurrectError(
      'ERR_INSUFFICIENT_BALANCE',
      'en',
      '1000 XLM',
      '500 XLM'
    );
    expect(error.message).toBe('Insufficient balance: required 1000 XLM, available 500 XLM');
  });

  it('should handle ICU format in Korean with multiple parameters', () => {
    const error = new SorobanResurrectError(
      'ERR_INSUFFICIENT_BALANCE',
      'ko',
      '1000 XLM',
      '500 XLM'
    );
    expect(error.message).toBe('잔액 부족: 필요 1000 XLM, 사용 가능 500 XLM');
  });

  it('should fall back to English for unsupported locale', () => {
    const error = new SorobanResurrectError('ERR_INVALID_XDR', 'unsupported' as any, 'test');
    expect(error.message).toContain('Invalid XDR format');
  });

  it('should fall back to English for unknown error code', () => {
    const error = new SorobanResurrectError('ERR_UNKNOWN_CODE', 'en');
    expect(error.message).toBe('Unknown error: ERR_UNKNOWN_CODE');
  });

  it('should provide error info with locale', () => {
    const error = new SorobanResurrectError('ERR_KEY_NOT_FOUND', 'ja', 'test-key');
    const info = error.getErrorInfo();

    expect(info.code).toBe('ERR_KEY_NOT_FOUND');
    expect(info.locale).toBe('ja');
    expect(info.message).toContain('キー');
  });

  it('should have all required locales for all error codes', () => {
    const errorCodes = Object.keys(localeMessages['en']);
    const locales = Object.keys(localeMessages) as Array<keyof typeof localeMessages>;

    for (const code of errorCodes) {
      for (const locale of locales) {
        expect(localeMessages[locale]).toHaveProperty(code);
      }
    }
  });

  it('should support all required locales', () => {
    const requiredLocales = ['en', 'ko', 'ja', 'zh', 'es'];
    const availableLocales = Object.keys(localeMessages);

    for (const locale of requiredLocales) {
      expect(availableLocales).toContain(locale);
    }
  });

  it('should have translations for simulation error', () => {
    const locales: Array<'en' | 'ko' | 'ja' | 'zh' | 'es'> = ['en', 'ko', 'ja', 'zh', 'es'];

    for (const locale of locales) {
      const error = new SorobanResurrectError('ERR_SIMULATION_FAILED', locale, 'timeout');
      expect(error.message).toBeDefined();
      expect(error.message).not.toContain('{0}');
    }
  });

  it('should properly format messages without parameters', () => {
    const error = new SorobanResurrectError('ERR_SIMULATION_FAILED', 'en');
    expect(error.message).toContain('Simulation failed');
  });
});
