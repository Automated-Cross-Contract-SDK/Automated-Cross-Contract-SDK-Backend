# Security Policy

## Supported Versions

We follow semantic versioning (major.minor.patch). The project is currently pre-1.0 (`0.1.x`), and per the pre-1.0 policy in `GOVERNANCE.md` §7.4, breaking changes bump the minor version. Security updates are provided for:

- Current release line: Latest patch releases
- Older release lines: Critical security fixes only
- End-of-life versions: No longer receive updates

| Version | Status             |
|---------|------------------|
| 0.1.x   | ✅ Supported      |
| < 0.1.0 | ❌ End of Life    |

## Reporting a Vulnerability

**DO NOT** open a public issue to report a security vulnerability.

### Responsible Disclosure

Please report security vulnerabilities responsibly by emailing:

- **Security Contact**: security@automated-cross-contract-sdk.org
- **PGP Key**: Available upon request (contact above)

Include in your report:
- Description of the vulnerability
- Affected versions
- Proof of concept (if applicable)
- Impact assessment
- Suggested remediation

## Response Time

- **Initial Response**: Within 48 hours of report submission
- **Status Updates**: Every 14 days (for long-term issues)
- **Target Fix Timeline**: 90 days from confirmation
- **Security Advisory Publication**: After fix release and 30-day disclosure window

## Bug Bounty Information

Currently, we do not have an active bug bounty program. However, we acknowledge and appreciate responsible security researchers who report issues.

Contributors who responsibly disclose security vulnerabilities will be:
- Credited in security advisories (if desired)
- Recognized in release notes
- Offered a thank-you token or contribution opportunity

## Security-Related Configuration Checklist

When integrating this SDK, ensure:

- [ ] Keep the SDK and dependencies updated to latest patch versions
- [ ] Validate all inputs from untrusted sources
- [ ] Use HTTPS only for RPC endpoints
- [ ] Store private keys securely (never commit to version control)
- [ ] Enable contract verification features when available
- [ ] Monitor transaction logs for unusual activity
- [ ] Implement rate limiting on contract calls

## Known Security Considerations

### Soroban Limitations

- **Footprint Restoration**: Ensure sufficient XDR size allocations
- **Transaction Fees**: Validate fee estimates from RPC nodes
- **Key Restoration**: Verify all restored keys match contract expectations
- **Simulation Results**: Don't rely solely on simulation for security decisions

### Best Practices

1. **Private Key Management**
   - Use hardware wallets or secure enclaves
   - Never store keys in environment variables without encryption
   - Rotate keys regularly

2. **Contract Interaction**
   - Verify contract addresses before deployment
   - Test on testnet before mainnet deployment
   - Monitor function call results for anomalies

3. **Error Handling**
   - Handle all `SorobanResurrectError` exceptions
   - Log security-related errors securely
   - Never expose sensitive data in error messages

## Attack Surface

The SDK consumes data it does not control. These are the inputs that should be treated
as hostile:

- **XDR parsing**: transaction envelopes and ledger keys are decoded by
  `@soroban-resurrect/footprint-parser` and its WebAssembly build
  (`@soroban-resurrect/footprint-parser-wasm`). Malformed XDR must produce a safe
  failure, never a crash or unbounded allocation. Memory safety of the WASM parser is
  tracked in #90.
- **RPC responses**: simulation results, ledger entries, and TTL data come from
  configured RPC endpoints, which may be misbehaving or compromised, so their output is
  not trusted without checks. Endpoints should use HTTPS; plain HTTP requires
  `allowHttp: true`.
- **Wallet adapter messages**: signatures and account data returned by user wallets
  are untrusted until verified against the expected transaction.
- **Tracing headers**: trace context propagated to RPC endpoints is passed through as
  opaque values. Do not place secrets in trace or baggage headers.

## Threat Model: Failover Across Independent RPC Providers

> **Status: forward-looking proposal.** This section documents the intended threat model
> and supported behavior for multi-provider RPC failover. It is not a report of a
> confirmed defect. Where the current implementation does not yet enforce a guarantee
> below, that gap is called out explicitly so integrators can compensate.

### Supported behavior

When more than one RPC endpoint is configured, the SDK may fail over between them. The
supported contract is:

- **Failover is availability-oriented, not trust-oriented.** Failover exists to keep the
  SDK responsive when a provider is down or degraded. It does **not** turn a set of
  providers into a trusted quorum.
- **Single-provider trust per request.** Each request is served by one provider at a
  time. The SDK does not currently cross-check responses across providers before using
  them.
- **Ordered fallback.** Providers are tried in configured order; a provider that fails
  (transport error, timeout, or malformed response) is skipped for that request.
- **No silent downgrade of transport security.** A plain-HTTP endpoint is only used when
  explicitly opted in via `allowHttp: true`; failover never relaxes this.

### Threats and edge cases

- **Provider collusion.** If several configured providers are operated by the same
  party, or collude, failover provides no independent corroboration. "Independent"
  providers must be independently operated for the availability benefit to hold.
- **Correlated outages.** Providers that share infrastructure, a cloud region, or an
  upstream dependency can fail together. Failover does not protect against correlated
  failure; diversify operators and regions.
- **Stale or divergent responses.** A lagging provider may return an older ledger view
  than another. Because responses are not cross-checked, a caller can observe state that
  differs from another provider's view. Treat ledger-dependent decisions as
  best-effort and re-validate against a known-good source when correctness is critical.
- **Malicious provider.** A compromised provider can return fabricated simulation
  results, ledger entries, or TTL data. Failover does not detect this; responses remain
  untrusted input (see *Attack Surface*).
- **Quorum assumptions.** The SDK does **not** implement quorum or majority voting
  across providers. Do not assume that configuring N providers yields N-of-M agreement.
- **Failover amplification.** Retrying across many providers can multiply load and
  latency; bound the number of attempts and set per-request timeouts.

### Integrator guidance

- Configure providers from **distinct operators and regions** to reduce correlated
  failure and collusion risk.
- Do **not** rely on failover for correctness or consensus; validate security-critical
  results independently.
- Keep `allowHttp` disabled in production and prefer HTTPS endpoints only.
- Bound retry counts and timeouts to avoid failover amplification.

## Coordinated Disclosure Timeline

| Stage | Target |
|-------|--------|
| Acknowledge report | Within 48 hours |
| Triage and confirm severity | Within 7 days |
| Fix target, high or critical severity | Within 30 days of confirmation |
| Fix target, other severities | Within 90 days of confirmation |
| Public advisory | After the fix release and a 30-day disclosure window |

Reporters are kept updated at least every 14 days until the issue is resolved.

## Fuzzing

XDR parsing is fuzzed continuously:

- **Harness**: `packages/sdk/tests/fuzz/xdr-parsing.fuzz.ts`. It generates malformed XDR
  and checks that the footprint parser entry points never throw an uncaught exception.
- **Run locally**: `npm run test:fuzz` in `packages/sdk`. Pass `-- -max_total_time=<seconds>`
  to change the duration.
- **Nightly**: `.github/workflows/nightly-fuzz.yml` runs the harness for 15 minutes every
  night at 02:00 UTC and fails the workflow if an uncaught exception is found. Crash
  details are in the workflow logs. Any crash is triaged under the timeline above.

## Security Update Process

When a vulnerability is confirmed:

1. Developers create a fix in a private repository
2. Security advisory is prepared
3. Patch version is released
4. CVE is published (if applicable)
5. Affected users are notified

## Contact

For security concerns:
- Email: security@automated-cross-contract-sdk.org
- Do not use issues or public communications for security vulnerabilities
