import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('size-limit: package budgets', () => {
  const sizeLimitPath = path.join(process.cwd(), '.size-limit.json');

  it('should have size-limit configuration', () => {
    expect(fs.existsSync(sizeLimitPath)).toBe(
      true,
      '.size-limit.json should exist'
    );
  });

  it('should enforce SDK core budget < 60KB gzip', () => {
    const config = JSON.parse(fs.readFileSync(sizeLimitPath, 'utf-8'));
    const sdkEntry = config.find(
      (entry: any) => entry.name === '@soroban-resurrect/sdk'
    );

    expect(sdkEntry).toBeDefined('SDK entry should exist in size-limit config');
    expect(sdkEntry.gzip).toBe(true, 'SDK should measure gzip size');

    const limitKB = parseInt(sdkEntry.limit);
    expect(limitKB).toBeLessThanOrEqual(
      60,
      'SDK core should be limited to < 60KB gzip'
    );
  });

  it('should enforce adapter budgets < 15KB gzip', () => {
    const config = JSON.parse(fs.readFileSync(sizeLimitPath, 'utf-8'));

    const adapterEntries = config.filter((entry: any) =>
      /adapter|plugin/.test(entry.name.toLowerCase())
    );

    for (const adapter of adapterEntries) {
      const limitKB = parseInt(adapter.limit);
      expect(limitKB).toBeLessThanOrEqual(
        15,
        `Adapter ${adapter.name} should be limited to < 15KB gzip`
      );
    }
  });

  it('should fail CI on size regression', () => {
    const config = JSON.parse(fs.readFileSync(sizeLimitPath, 'utf-8'));

    expect(config).toBeDefined('Size-limit config should be defined');
    expect(Array.isArray(config)).toBe(true, 'Config should be an array');
    expect(config.length).toBeGreaterThan(0, 'Config should have entries');

    for (const entry of config) {
      expect(entry.name).toBeDefined('Each entry should have a name');
      expect(entry.path).toBeDefined('Each entry should have a path');
      expect(entry.limit).toBeDefined('Each entry should have a limit');
      expect(entry.gzip).toBe(true, 'All entries should measure gzip size');
    }
  });

  it('should include all framework adapters in budget', () => {
    const config = JSON.parse(fs.readFileSync(sizeLimitPath, 'utf-8'));

    const adapterNames = new Set(
      config
        .filter((entry: any) => /adapter/.test(entry.name.toLowerCase()))
        .map((entry: any) => entry.name)
    );

    expect(adapterNames.size).toBeGreaterThan(
      0,
      'Should have adapter packages in size-limit config'
    );
  });

  it('should verify React adapter within budget', () => {
    const config = JSON.parse(fs.readFileSync(sizeLimitPath, 'utf-8'));
    const reactEntry = config.find(
      (entry: any) => entry.name === '@soroban-resurrect/react'
    );

    if (reactEntry) {
      const limitKB = parseInt(reactEntry.limit);
      expect(limitKB).toBeLessThanOrEqual(
        15,
        'React adapter should be < 15KB gzip'
      );
      expect(reactEntry.gzip).toBe(true);
    }
  });
});
