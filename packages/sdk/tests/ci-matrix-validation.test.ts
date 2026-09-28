import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('CI: matrix configuration', () => {
  const ciWorkflowPath = path.join(
    process.cwd(),
    '.github/workflows/ci.yml'
  );

  function getWorkflowContent() {
    return fs.readFileSync(ciWorkflowPath, 'utf-8');
  }

  it('should include Node 24 in test matrix', () => {
    const content = getWorkflowContent();
    const matrixMatch = content.match(/node-version:\s*\[([\d\s,]+)\]/);

    expect(matrixMatch).toBeDefined('Node version matrix should exist');
    expect(matrixMatch?.[1]).toMatch(/24/, 'Node 24 should be in the matrix');
  });

  it('should maintain backward compatibility with Node 18, 20, 22', () => {
    const content = getWorkflowContent();
    const matrixMatch = content.match(/node-version:\s*\[([\d\s,]+)\]/);

    expect(matrixMatch?.[1]).toMatch(/18/, 'Node 18 should still be supported');
    expect(matrixMatch?.[1]).toMatch(/20/, 'Node 20 should still be supported');
    expect(matrixMatch?.[1]).toMatch(/22/, 'Node 22 should still be supported');
  });

  it('should use npm cache in setup-node action', () => {
    const content = getWorkflowContent();
    const hasNodeSetup = /actions\/setup-node/.test(content);
    const hasCacheNpm = /cache:\s*npm/.test(content);

    expect(hasNodeSetup).toBe(true, 'Should use setup-node action');
    expect(hasCacheNpm).toBe(true, 'setup-node should cache npm workspace');
  });

  it('should run npm ci for clean installs', () => {
    const content = getWorkflowContent();
    expect(content).toMatch(/run:\s*npm ci/, 'Should use npm ci for clean installs');
  });

  it('should run build and test commands', () => {
    const content = getWorkflowContent();
    expect(content).toMatch(/run:\s*npm run build/, 'Should run build step');
    expect(content).toMatch(/run:\s*npm run test/, 'Should run test step');
  });

  it('should verify TypeScript compilation for key packages', () => {
    const content = getWorkflowContent();
    const tscMatches = content.match(/npx tsc --noEmit/g);

    expect(tscMatches?.length).toBeGreaterThanOrEqual(
      2,
      'Should check TypeScript compilation for SDK and React'
    );
  });

  it('should have quality job as prerequisite for other jobs', () => {
    const content = getWorkflowContent();

    const fuzzJobMatch = content.match(/fuzz:[\s\S]*?needs:\s*\[([\s\w,\[\]]*)\]/);
    const coverageJobMatch = content.match(/coverage:[\s\S]*?needs:\s*\[([\s\w,\[\]]*)\]/);

    expect(fuzzJobMatch?.[1]).toMatch(/quality/);
    expect(coverageJobMatch?.[1]).toMatch(/quality/);
  });

  it('should cache npm dependencies', () => {
    const content = getWorkflowContent();
    expect(content).toMatch(/cache:\s*npm/, 'Should cache npm to speed up CI runs');
  });
});
