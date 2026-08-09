# Security Policy

## Supported versions

Matter Field is a public preview and has not been published to npm. Security
fixes are applied to the latest commit on `main`; no versioned support window
exists yet.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting form for
`instruktlabs/matter-field`. Do not open a public issue for a suspected
vulnerability or include exploit details in a public hardware receipt.

Include, when possible:

- the affected commit or file;
- reproduction steps or a minimal proof of concept;
- impact and realistic attack conditions;
- browser, Node, operating system, and dependency versions;
- any suggested mitigation.

Maintainers will acknowledge reports on a best-effort basis, investigate the
scope, and coordinate disclosure when a fix is available. Please avoid testing
against systems or data you do not own or have permission to use.

## Relevant scope

Security-relevant surfaces include:

- package code and generated shader graphs;
- the browser parity runner and local HTTP servers;
- GitHub Pages build output;
- CI and release automation;
- dependency or supply-chain issues.

Numeric disagreement, an unsupported GPU, or a field exceeding its declared
drift budget is normally a correctness issue rather than a security issue.
Use the public bug form unless the behavior creates a concrete security impact.

## Secrets and reports

The adapter core has zero required runtime dependencies and should require no
credentials. The optional TypeGPU subpaths use pinned `typegpu`,
`@typegpu/three`, `three`, and `@types/three` peers; treat updates to that build
and runtime chain as supply-chain-sensitive changes. Do not add API keys,
tokens, browser profiles, or private machine data to a receipt. Review generated
JSON before submitting it; GPU, driver, browser, and operating-system details
are expected to become public.
