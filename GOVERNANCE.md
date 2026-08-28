# Project Governance

This document defines how the **Soroban-Resurrect** project
(`Automated-Cross-Contract-SDK` / `Automated-Cross-Contract-SDK-Backend`) is
governed: who makes decisions, how they are made, and how contributors move into
positions of greater responsibility.

It is adapted from the governance models of
[Node.js](https://github.com/nodejs/node/blob/main/GOVERNANCE.md),
[Rust](https://forge.rust-lang.org/governance/index.html), and
[Kubernetes](https://github.com/kubernetes/community/blob/master/governance.md),
scaled down to fit a small, focused SDK project.

- **Status:** Active
- **Last updated:** 2026-08-28

---

## 1. Guiding principles

1. **Open by default.** Discussion, decisions, and rationale happen in public
   (GitHub issues, pull requests, discussions). Private channels are for
   security reports and conduct matters only.
2. **Lazy consensus.** Most changes proceed unless someone objects. Silence is
   agreement.
3. **Earned trust.** Responsibility is granted based on a sustained track record
   of good judgment, not tenure or affiliation.
4. **Technical merit.** Decisions are made on engineering grounds — correctness,
   maintainability, user impact, security — not on who proposed them.

---

## 2. Roles and responsibilities

### 2.1 Contributor

Anyone who submits an issue, pull request, review comment, documentation fix, or
support answer. No formal process; you are a contributor the moment you
participate.

**Expectations:**

- Follow the [Code of Conduct](#8-code-of-conduct) and
  [`CONTRIBUTING.md`](./CONTRIBUTING.md).
- Keep pull requests focused and described.
- Be responsive to review feedback on your own PRs.

### 2.2 Triager

A contributor granted issue-triage permissions (label, assign, close
duplicates/invalid, request info). Triagers do not have merge rights.

**Expectations:**

- Label and route incoming issues within a reasonable time.
- Reproduce or request reproduction for bug reports.
- Close stale/invalid issues with a courteous explanation.

**How to become one:** Ask any maintainer after a few weeks of consistent triage
help, or be nominated by a maintainer. Granted by lazy consensus of the
maintainers.

### 2.3 Maintainer

A contributor with write access to the repository and the right to merge pull
requests. Maintainers collectively own the project's technical direction.

**Responsibilities:**

- Review and merge pull requests (see [§5](#5-code-review-expectations)).
- Uphold quality, security, and API-stability standards.
- Participate in RFC discussions and votes.
- Respond to security reports they are assigned.
- Mentor contributors and identify future maintainers.
- Share the release-manager rotation ([§7](#7-releases)).

**Expectations:**

- Act in the interest of the project and its users, not any single employer.
- Do not merge your own non-trivial changes without a second maintainer's
  approval (see [§5](#5-code-review-expectations)).
- Disclose conflicts of interest.
- Step back gracefully (see [§2.5](#25-emeritus)) if you can no longer commit
  time.

### 2.4 Lead Maintainer (Steering)

The maintainers select **one to three** Lead Maintainers to form the steering
group. This is a tie-breaking and coordination role, not a position of unilateral
authority.

**Responsibilities:**

- Break deadlocks that lazy consensus and maintainer votes cannot resolve
  ([§4.4](#44-escalation-and-tie-breaking)).
- Own the roadmap document and keep it current.
- Act as the final decision-maker on Code of Conduct enforcement and on adding or
  removing maintainers.
- Represent the project in external forums (e.g. the Stellar / Soroban protocol
  discussions).
- Manage credentials: npm publish tokens, GitHub org owner seats, signing keys.

**Term:** 12 months, renewable. Chosen by maintainer vote
([§4.3](#43-formal-votes)).

### 2.5 Emeritus

A former maintainer or lead who has stepped back. Emeritus members lose write
access but keep recognition in [`MAINTAINERS.md`](./MAINTAINERS.md) and may
return via a lightweight re-onboarding (a single maintainer nomination + lazy
consensus) within 12 months of departure.

A maintainer is moved to Emeritus by their own request, or automatically after
**6 months** of no reviews, merges, votes, or discussion participation (the lead
maintainers send a heads-up first; it is not a judgment, just hygiene).

---

## 3. The contribution ladder

```
Contributor  ──►  Triager  ──►  Maintainer  ──►  Lead Maintainer
     ▲                                │
     └────────────  Emeritus  ◄───────┘
```

| Step | Prerequisite | Who decides | Mechanism |
|---|---|---|---|
| → Triager | ~1 month of useful triage activity | Maintainers | Lazy consensus on a nomination issue |
| → Maintainer | ~10 non-trivial merged PRs **and** sustained quality reviews over ~3 months | Existing maintainers | Formal vote ([§4.3](#43-formal-votes)); 2 supporting nominations required |
| → Lead Maintainer | Existing maintainer in good standing | Maintainers | Annual vote |
| → Emeritus | Request or 6-month inactivity | Self / Leads | Notice + record update |

Nominations are made by opening an issue titled `Nomination: <name> for <role>`
with links to representative work. The nominee must publicly accept. A nomination
stays open for a minimum of **5 business days**.

---

## 4. Decision-making process

### 4.1 Lazy consensus (default)

Almost everything — bug fixes, docs, dependency bumps, additive non-breaking
features, refactors — proceeds by lazy consensus:

1. Open a PR (or issue for non-code changes).
2. If no maintainer objects and CI passes, any maintainer other than the author
   may merge after the review requirements in [§5](#5-code-review-expectations)
   are met.
3. A single **"please hold"** from any maintainer blocks the merge until the
   concern is resolved or withdrawn.

### 4.2 RFCs (for significant changes)

An RFC is required for:

- Breaking changes to any published package's public API.
- New packages or removal of existing ones.
- Changes to the release process, supported runtimes, or this governance
  document.
- Anything a maintainer designates as needing broader review.

**RFC process:**

1. Open a PR adding a document under `docs/rfcs/NNNN-short-title.md` using
   `docs/rfcs/0000-template.md`.
2. Announce it in GitHub Discussions.
3. Minimum comment period: **10 business days**.
4. A designated maintainer (not the author) summarizes the discussion and moves
   the RFC to **Final Comment Period (FCP)** with a proposed disposition
   (accept / reject / postpone).
5. FCP lasts **5 business days**. If no new blocking concerns appear, the
   disposition takes effect.
6. Accepted RFCs are merged with status `Accepted` and tracked to completion by a
   linked issue.

### 4.3 Formal votes

Used only for: adding/removing maintainers, selecting lead maintainers, resolving
an RFC where the summary is contested, and overriding a sustained objection.

- Eligible voters: all non-emeritus maintainers.
- Voting happens on the relevant issue/PR with 👍 / 👎 / 🙌 (abstain), or via a
  linked poll, over a **5 business day** window.
- **Quorum:** more than 50% of eligible maintainers must vote.
- **Passing:** a two-thirds majority of non-abstaining votes.
- The author of a proposal may vote on it.

### 4.4 Escalation and tie-breaking

If lazy consensus fails and a vote does not reach quorum or ends in a tie, the
Lead Maintainer group decides by simple majority (or the sole Lead decides). Lead
decisions are recorded publicly with rationale. A Lead decision can be revisited
by a new RFC after 60 days.

---

## 5. Code review expectations

### For authors

- One logical change per PR. Split unrelated changes.
- Fill in the PR description: what, why, and how it was verified.
- Link the issue(s) the PR closes.
- Keep the branch current with `main`; resolve conflicts before requesting
  review.
- Respond to review threads; don't silently force-push over unresolved comments.

### For reviewers

- **Response-time goal:** first review within **3 business days**. If you can't,
  say so or unassign.
- Review for: correctness, security, public-API impact, test coverage,
  documentation, and consistency with existing patterns.
- Distinguish **blocking** requests from **non-blocking** suggestions (prefix
  nits with `nit:`).
- Approve only what you actually understand. "LGTM" implies you read it.
- Be kind. Critique the code, not the person. Explain the "why" behind a request.

### Merge requirements

| Change type | Required approvals | Extra rules |
|---|---|---|
| Docs, comments, CI-only | 1 maintainer | Author may self-merge trivial typo fixes |
| Bug fix, additive feature | 1 maintainer (not the author) | CI green |
| Public API change / new dependency | 2 maintainers (not the author) | RFC if breaking |
| Security fix | 2 maintainers | Coordinated with [§9](#9-security) |
| This document | 2 maintainers + FCP | Per [§4.2](#42-rfcs-for-significant-changes) |

- Maintainers must not merge their own change unless it is trivial (typo,
  comment, obvious lint fix) **and** CI is green.
- Squash-merge is the default. The squash commit message must be meaningful.
- Never merge with a failing required check or an unresolved "please hold".

---

## 6. Conflict resolution

Most disagreements are resolved in the PR/issue thread through discussion. When
they are not:

1. **Restate and narrow.** A neutral maintainer summarizes each position and
   identifies the smallest point of actual disagreement.
2. **Seek a third opinion.** Pull in a maintainer who has not participated.
3. **Time-box it.** If unresolved after **1 week**, it escalates per
   [§4.4](#44-escalation-and-tie-breaking).
4. **Decide and document.** The deciding party records the decision, the
   rationale, and the dissent. The dissenting party is expected to
   [disagree and commit](https://en.wikipedia.org/wiki/Disagree_and_commit).

**Interpersonal conflict** (as opposed to technical) goes directly to the Lead
Maintainers, or — if a Lead is involved — to the remaining Leads and, if
necessary, to the Stellar Development Foundation's community team as an external
mediator. Code of Conduct violations follow [§8](#8-code-of-conduct), not this
section.

---

## 7. Releases

### 7.1 Release manager rotation

- Maintainers take turns as **release manager**, one per release, in a rotation
  tracked in a pinned issue.
- A maintainer may pass their turn; the next in rotation takes it.
- The release manager for a given release:
  1. Confirms `main` is green and the changelog is complete.
  2. Runs `npm run build && npm run test` across the workspace.
  3. Bumps versions (see [§7.2](#72-versioning)) and updates
     [`CHANGELOG.md`](./CHANGELOG.md).
  4. Tags the release and publishes affected packages to npm.
  5. Writes the GitHub Release notes.
  6. Announces in Discussions.

### 7.2 Versioning

- All published packages follow [Semantic Versioning](https://semver.org/).
- Pre-1.0 (`0.x`): breaking changes bump the **minor**; features and fixes bump
  the **patch**. Every breaking change still needs an RFC per
  [§4.2](#42-rfcs-for-significant-changes).
- Packages are versioned independently but released together when they share a
  breaking boundary.

### 7.3 Cadence

There is **no fixed release schedule**. Releases are cut when there is meaningful
user-facing value on `main`, or immediately for a security fix. The release
manager may batch minor changes for up to ~2 weeks to avoid churn.

### 7.4 Support policy

- Only the latest minor of each `0.x` line receives fixes.
- Security fixes may be backported one minor version at the Lead Maintainers'
  discretion.

---

## 8. Code of Conduct

The project follows the
[Contributor Covenant v2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).
Reports go to the Lead Maintainers at the address listed in
[`MAINTAINERS.md`](./MAINTAINERS.md). Reports are handled confidentially.

Enforcement ladder: private correction → formal warning → temporary ban →
permanent ban. The Lead Maintainers decide; a maintainer who is the subject of a
report recuses themselves. Decisions and (anonymized) outcomes are recorded.

---

## 9. Security

- Vulnerabilities are reported privately per [`SECURITY.md`](./SECURITY.md) (or,
  until that file exists, via a
  [GitHub private security advisory](https://docs.github.com/en/code-security/security-advisories)).
- The Lead Maintainers assign two maintainers to triage and fix under embargo.
- Coordinated disclosure: a fix is prepared, released, and only then is the
  advisory published with credit to the reporter.
- No security issue is discussed in public channels before a fix ships.

---

## 10. Meetings

The project runs **asynchronously by default**. There is no standing meeting.

- If recurring synchronous coordination becomes necessary, the Lead Maintainers
  schedule a monthly 30-minute public call, announced in Discussions, with notes
  posted to the repository afterward.
- Any maintainer may call an **ad-hoc** video call to unblock a specific
  decision; the outcome must be written back to the relevant issue/PR so
  non-attendees can review and object.

---

## 11. Amending this document

Changes to `GOVERNANCE.md` follow the RFC process
([§4.2](#42-rfcs-for-significant-changes)) and require two maintainer approvals
plus a Final Comment Period. The Lead Maintainers ratify the merged result.

---

## 12. Changelog

- **2026-08-28:** Initial governance model established.
