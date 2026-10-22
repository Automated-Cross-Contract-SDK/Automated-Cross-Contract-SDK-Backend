import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('dependency-cruiser: layering rules', () => {
  const sdkPath = path.join(process.cwd(), 'packages/sdk/src');
  const reactPath = path.join(process.cwd(), 'packages/react/src');
  const vuePath = path.join(process.cwd(), 'packages/vue/src');
  const sveltePath = path.join(process.cwd(), 'packages/svelte/src');

  const frameworkPackages = [
    'react',
    'vue',
    '@vue/composition-api',
    'svelte',
    '@angular/core',
    'angular',
  ];

  function getFilesRecursively(dirPath: string): string[] {
    if (!fs.existsSync(dirPath)) {
      return [];
    }

    const files: string[] = [];

    function walk(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (
          entry.isFile() &&
          (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))
        ) {
          files.push(fullPath);
        }
      }
    }

    walk(dirPath);
    return files;
  }

  function hasFrameworkImports(filePath: string): {
    hasImports: boolean;
    frameworks: string[];
  } {
    const content = fs.readFileSync(filePath, 'utf-8');
    const frameworks: string[] = [];

    for (const framework of frameworkPackages) {
      const patterns = [
        new RegExp(`from\\s+['"](${framework})['"]`),
        new RegExp(`import\\s+['"](${framework})['"]`),
        new RegExp(`require\\s*\\(\\s*['"](${framework})['"]\s*\\)`),
      ];

      for (const pattern of patterns) {
        if (pattern.test(content)) {
          frameworks.push(framework);
          break;
        }
      }
    }

    return {
      hasImports: frameworks.length > 0,
      frameworks,
    };
  }

  it('sdk must not import framework packages', () => {
    const sdkFiles = getFilesRecursively(sdkPath);
    const violators: { file: string; frameworks: string[] }[] = [];

    for (const file of sdkFiles) {
      const { hasImports, frameworks } = hasFrameworkImports(file);
      if (hasImports) {
        violators.push({
          file: path.relative(process.cwd(), file),
          frameworks,
        });
      }
    }

    expect(violators).toEqual(
      [],
      `SDK files must not import framework packages. Violations:\n${violators
        .map((v) => `  ${v.file}: ${v.frameworks.join(', ')}`)
        .join('\n')}`
    );
  });

  it('react may import sdk', () => {
    const reactFiles = getFilesRecursively(reactPath);
    const sdkImports = reactFiles.filter((file) => {
      const content = fs.readFileSync(file, 'utf-8');
      return /from\s+['"](@soroban-resurrect\/)?sdk['"]/.test(content);
    });

    expect(sdkImports.length).toBeGreaterThan(
      0,
      'React package should import from SDK'
    );
  });

  it('react may import react framework', () => {
    const reactFiles = getFilesRecursively(reactPath);
    const hasReactImport = reactFiles.some((file) => {
      const { frameworks } = hasFrameworkImports(file);
      return frameworks.includes('react');
    });

    expect(hasReactImport).toBe(
      true,
      'React package should import react framework'
    );
  });

  it('vue may import sdk', () => {
    const vueFiles = getFilesRecursively(vuePath);
    const sdkImports = vueFiles.filter((file) => {
      const content = fs.readFileSync(file, 'utf-8');
      return /from\s+['"](@soroban-resurrect\/)?sdk['"]/.test(content);
    });

    expect(sdkImports.length).toBeGreaterThan(
      0,
      'Vue package should import from SDK'
    );
  });

  it('svelte may import sdk', () => {
    const svelteFiles = getFilesRecursively(sveltePath);
    const sdkImports = svelteFiles.filter((file) => {
      const content = fs.readFileSync(file, 'utf-8');
      return /from\s+['"](@soroban-resurrect\/)?sdk['"]/.test(content);
    });

    expect(sdkImports.length).toBeGreaterThan(
      0,
      'Svelte package should import from SDK'
    );
  });
});
