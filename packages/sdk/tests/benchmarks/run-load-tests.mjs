#!/usr/bin/env node

/**
 * Load test runner script — executes the load testing suite and outputs
 * a JSON report suitable for GitHub Pages dashboards.
 *
 * Usage:
 *   node packages/sdk/tests/benchmarks/run-load-tests.mjs
 *
 * Or via npm script:
 *   npm run test:load -w packages/sdk
 */

import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RESULTS_DIR = join(__dirname, 'results')
const DASHBOARD_DIR = join(__dirname, '..', '..', '..', 'docs', 'benchmarks')

// Ensure directories exist
if (!existsSync(RESULTS_DIR)) {
  mkdirSync(RESULTS_DIR, { recursive: true })
}
if (!existsSync(DASHBOARD_DIR)) {
  mkdirSync(DASHBOARD_DIR, { recursive: true })
}

console.log('Running load tests...')

try {
  execSync('npx vitest run tests/benchmarks/load-test.suite.ts --config vitest.config.ts', {
    cwd: join(__dirname, '..', '..'),
    stdio: 'inherit',
    env: {
      ...process.env,
      RUN_LOAD_TESTS: 'true',
    },
  })
} catch (err) {
  console.error('Load tests failed:', err)
  process.exit(1)
}

// Generate HTML dashboard from the JSON report
const reportPath = join(RESULTS_DIR, 'load-test-report.json')
if (existsSync(reportPath)) {
  const report = JSON.parse(readFileSync(reportPath, 'utf-8'))

  const html = generateDashboardHtml(report)
  const dashboardPath = join(DASHBOARD_DIR, 'index.html')
  writeFileSync(dashboardPath, html, 'utf-8')
  console.log(`Dashboard written to: ${dashboardPath}`)
}

// ── HTML generator ──────────────────────────────────────────────────────────

function generateDashboardHtml(report: any): string {
  const rows = report.results
    .map(
      (r: any) => `
    <tr>
      <td>${r.scale}</td>
      <td>${r.keyCount}</td>
      <td>${r.batchCount}</td>
      <td>${r.totalTimeMs}ms</td>
      <td>${r.heapUsedMB}MB</td>
      <td>${r.rpcCallCount}</td>
      <td>${(r.successRate * 100).toFixed(1)}%</td>
      <td>${Math.round(r.throughput)} keys/s</td>
    </tr>`,
    )
    .join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Soroban-Resurrect Load Test Benchmarks</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0d1117; color: #c9d1d9; padding: 2rem; }
    h1 { color: #58a6ff; margin-bottom: 0.5rem; }
    .meta { color: #8b949e; font-size: 0.85rem; margin-bottom: 2rem; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 2rem; }
    th, td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid #21262d; }
    th { color: #58a6ff; font-weight: 600; background: #161b22; }
    tr:hover { background: #161b22; }
    .summary { background: #161b22; border: 1px solid #21262d; border-radius: 6px; padding: 1rem; margin-top: 1rem; }
    .summary h2 { color: #58a6ff; font-size: 1rem; margin-bottom: 0.5rem; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
    .summary-item { background: #0d1117; border: 1px solid #21262d; border-radius: 6px; padding: 1rem; }
    .summary-item .label { color: #8b949e; font-size: 0.8rem; text-transform: uppercase; }
    .summary-item .value { color: #c9d1d9; font-size: 1.4rem; font-weight: 600; margin-top: 0.25rem; }
  </style>
</head>
<body>
  <h1>Batch Restoration Load Test Benchmarks</h1>
  <div class="meta">
    Generated: ${report.generatedAt} | Config: ${report.config.rpcUrl}
  </div>
  <table>
    <thead>
      <tr>
        <th>Scale</th>
        <th>Keys</th>
        <th>Batches</th>
        <th>Time</th>
        <th>Heap</th>
        <th>RPC Calls</th>
        <th>Success Rate</th>
        <th>Throughput</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="summary">
    <h2>Summary</h2>
    <div class="summary-grid">
      <div class="summary-item">
        <div class="label">Average Throughput</div>
        <div class="value">${report.summary.avgThroughput} keys/s</div>
      </div>
      <div class="summary-item">
        <div class="label">Average Time</div>
        <div class="value">${report.summary.avgTimeMs}ms</div>
      </div>
      <div class="summary-item">
        <div class="label">Total Scales Tested</div>
        <div class="value">${report.summary.totalScales}</div>
      </div>
    </div>
  </div>
</body>
</html>`
}
