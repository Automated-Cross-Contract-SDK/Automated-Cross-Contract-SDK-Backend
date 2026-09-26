# Releasing

## Publishing

Packages are published by the `publish` job in `.github/workflows/ci.yml` when a
GitHub Release is published. The job runs with `id-token: write` and publishes
with `npm publish --provenance --access public`, so every release carries an
[npm provenance](https://docs.npmjs.com/generating-provenance-statements)
attestation linking the tarball to this repository and the workflow run.

## Signed tags

Create release tags signed with GPG or SSH:

```bash
git config --global tag.gpgSign true      # or: git config --global gpg.format ssh
git tag -s vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
```

## npm 2FA

Enable two-factor authentication for publishing on the npm org/packages
(`Require 2FA and automation tokens`). CI uses an automation token stored in the
`NPM_TOKEN` secret.

## Verifying as a consumer

```bash
npm audit signatures        # verifies registry signatures and provenance
npm view <pkg> --json | jq '.dist.attestations'
```

## SBOM and artifact attestation

`.github/workflows/sbom-attestation.yml` runs when a GitHub Release is
published. It generates a CycloneDX SBOM (`sbom.cdx.json`), attaches it to the
release, and creates GitHub build-provenance and SBOM attestations for the
packed workspace tarballs. Verify a downloaded tarball with:

```bash
gh attestation verify <package>.tgz --repo Automated-Cross-Contract-SDK/Automated-Cross-Contract-SDK-Backend
```
