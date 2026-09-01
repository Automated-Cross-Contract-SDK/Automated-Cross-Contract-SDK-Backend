# Observability dashboards

Pre-built dashboard templates for visualising `@soroban-resurrect/sdk` metrics.

| File | Platform | Import path |
|------|----------|-------------|
| [`grafana-dashboard.json`](./grafana-dashboard.json) | Grafana (Prometheus datasource) | *Dashboards → New → Import → Upload JSON* |
| [`datadog-dashboard.json`](./datadog-dashboard.json) | Datadog | *Dashboards → New Dashboard → Configuration (gear) → Import Dashboard JSON* |

## Expected metrics

The templates assume the following instruments are exported from your
application. The SDK does not ship a metrics exporter itself — emit these from
your `onLog` handler, from the tracing `SpanExporter` hook
([distributed tracing docs](../docs/distributed_tracing.md)), or from your own
wrapper around the SDK.

| Metric | Type | Labels / tags | Meaning |
|--------|------|---------------|---------|
| `soroban_resurrect_restorations_total` | counter | `result` = `success` \| `failure` | Restore transactions attempted |
| `soroban_resurrect_keys_restored_total` | counter | `contract_id` | Individual ledger keys restored |
| `soroban_resurrect_restoration_duration_seconds` | histogram | `result` | End-to-end restore latency |
| `soroban_resurrect_rpc_errors_total` | counter | `error_code` (`SIMULATION_FAILED`, `RESTORE_FAILED`, `NETWORK_ERROR`, …) | RPC / SDK errors by code |
| `soroban_resurrect_active_restorations` | gauge | — | Restores currently in flight |
| `soroban_resurrect_batch_size` | histogram | — | Keys per restore batch |
| `soroban_resurrect_rpc_duration_seconds` | histogram | `rpc_method` (`simulateTransaction`, `getLedgerEntries`, `sendTransaction`, …) | Soroban RPC call latency |

Prometheus histogram metrics are expected to expose the usual
`_bucket` / `_sum` / `_count` series. Datadog panels use distribution metrics
(`p50`, `p95`, `p99`).

## Customising

- **Grafana**: the template uses a `${DS_PROMETHEUS}` datasource variable and a
  `$contract_id` template variable — set these on import.
- **Datadog**: adjust the `$env` template variable and replace the metric
  namespace (`soroban_resurrect.`) if you export under a different prefix.
