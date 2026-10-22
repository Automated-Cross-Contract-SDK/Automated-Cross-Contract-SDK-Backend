import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

interface BenchmarkResult {
  name: string;
  duration: number;
  iterations: number;
  opsPerSecond: number;
  timestamp: string;
}

interface BenchmarkReport {
  methodology: {
    hardware: string;
    network: string;
    sorobanVersion: string;
  };
  benchmarks: {
    [keyCount: number]: BenchmarkResult[];
  };
  latencyBreakdown: {
    simulate: number;
    detect: number;
    build: number;
    restore: number;
  };
  batchSizeImpact: {
    batchSize: number;
    latency: number;
    throughput: number;
  }[];
  memoryUsage: {
    peak: number;
    average: number;
    unit: string;
  };
  comparisonWithNaive: {
    withRestoration: number;
    withoutRestoration: number;
    improvement: string;
  };
  recommendations: string[];
  rawData: any;
}

describe('Performance Benchmarking Report', () => {
  let reportPath: string;

  beforeAll(() => {
    reportPath = path.join(__dirname, '../../..', 'docs', 'PERFORMANCE_REPORT.json');
  });

  it('should generate comprehensive performance benchmarking report', () => {
    expect(fs.existsSync(reportPath)).toBe(true);
  });

  it('should include methodology section with hardware specs', () => {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8')) as BenchmarkReport;

    expect(report.methodology).toBeDefined();
    expect(report.methodology.hardware).toBeDefined();
    expect(report.methodology.network).toBeDefined();
    expect(report.methodology.sorobanVersion).toBeDefined();
  });

  it('should have benchmarks across multiple key counts', () => {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8')) as BenchmarkReport;

    expect(report.benchmarks).toBeDefined();
    const keyCounts = Object.keys(report.benchmarks).map(Number);

    // Should include key counts: 10, 50, 100, 500, 1000
    expect(keyCounts).toContain(10);
    expect(keyCounts).toContain(50);
    expect(keyCounts).toContain(100);
    expect(keyCounts).toContain(500);
    expect(keyCounts).toContain(1000);
  });

  it('should provide latency breakdown', () => {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8')) as BenchmarkReport;

    expect(report.latencyBreakdown).toBeDefined();
    expect(report.latencyBreakdown.simulate).toBeGreaterThan(0);
    expect(report.latencyBreakdown.detect).toBeGreaterThan(0);
    expect(report.latencyBreakdown.build).toBeGreaterThan(0);
    expect(report.latencyBreakdown.restore).toBeGreaterThan(0);

    const total =
      report.latencyBreakdown.simulate +
      report.latencyBreakdown.detect +
      report.latencyBreakdown.build +
      report.latencyBreakdown.restore;

    expect(total).toBeGreaterThan(0);
  });

  it('should analyze batch size impact', () => {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8')) as BenchmarkReport;

    expect(report.batchSizeImpact).toBeDefined();
    expect(Array.isArray(report.batchSizeImpact)).toBe(true);
    expect(report.batchSizeImpact.length).toBeGreaterThan(0);

    // Each batch size entry should have required metrics
    for (const entry of report.batchSizeImpact) {
      expect(entry.batchSize).toBeGreaterThan(0);
      expect(entry.latency).toBeGreaterThanOrEqual(0);
      expect(entry.throughput).toBeGreaterThan(0);
    }
  });

  it('should report memory usage metrics', () => {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8')) as BenchmarkReport;

    expect(report.memoryUsage).toBeDefined();
    expect(report.memoryUsage.peak).toBeGreaterThan(0);
    expect(report.memoryUsage.average).toBeGreaterThan(0);
    expect(['MB', 'GB', 'KB']).toContain(report.memoryUsage.unit);
  });

  it('should compare restoration vs naive approach', () => {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8')) as BenchmarkReport;

    expect(report.comparisonWithNaive).toBeDefined();
    expect(report.comparisonWithNaive.withRestoration).toBeGreaterThan(0);
    expect(report.comparisonWithNaive.withoutRestoration).toBeGreaterThan(0);
    expect(report.comparisonWithNaive.improvement).toBeDefined();

    // Restoration should be faster
    expect(report.comparisonWithNaive.withRestoration).toBeLessThan(
      report.comparisonWithNaive.withoutRestoration
    );
  });

  it('should provide optimization recommendations', () => {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8')) as BenchmarkReport;

    expect(report.recommendations).toBeDefined();
    expect(Array.isArray(report.recommendations)).toBe(true);
    expect(report.recommendations.length).toBeGreaterThan(0);

    // Should include recommendations for configuration
    const recommendationText = report.recommendations.join(' ').toLowerCase();
    expect(recommendationText).toMatch(/batch|optimal|configuration/);
  });

  it('should include raw benchmark data for analysis', () => {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8')) as BenchmarkReport;

    expect(report.rawData).toBeDefined();
  });

  it('should have valid benchmark result entries', () => {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8')) as BenchmarkReport;

    for (const [keyCount, results] of Object.entries(report.benchmarks)) {
      expect(Array.isArray(results)).toBe(true);

      for (const result of results as BenchmarkResult[]) {
        expect(result.name).toBeDefined();
        expect(result.duration).toBeGreaterThan(0);
        expect(result.iterations).toBeGreaterThan(0);
        expect(result.opsPerSecond).toBeGreaterThan(0);
        expect(result.timestamp).toBeDefined();
      }
    }
  });
});
