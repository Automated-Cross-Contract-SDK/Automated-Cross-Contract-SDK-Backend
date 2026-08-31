# Security Policy

## Supported Versions

We follow semantic versioning (major.minor.patch). Security updates are provided for:

- Current major version: Latest patch releases
- Previous major version: Critical security fixes only
- End-of-life versions: No longer receive updates

| Version | Status             |
|---------|------------------|
| 2.x     | ✅ Supported      |
| 1.x     | ⚠️ Limited Support |
| < 1.0   | ❌ End of Life    |

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
