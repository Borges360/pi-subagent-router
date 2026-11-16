---
name: pi-subagent-router
description: Work on Pi Subagent Router delegation, child isolation, storage and recovery within the product's local contracts.
---

# Pi Subagent Router

Use this specialization for work in the Pi Subagent Router repository. The workspace catalog provides general Harness procedures; this skill records only product-specific boundaries.

## Product role

- The extension delegates bounded investigations or reviews to independent child processes with fresh sessions and explicitly scoped filesystem tools.
- Children have no shell, MCP, inherited project context or extensions by default. Never add a mandatory sibling extension dependency or read sibling private state.
- File storage is the default backend. SQLite and Pi Durable are opt-in. The default path must not require a sibling, database driver or remote classifier.

## Safety and state

- This package runs with the user's operating-system privileges; it is not an OS sandbox.
- Child writes are disabled by default. Write-enabled children require isolated worktrees and explicit user configuration.
- Preserve the package's exact-argument, one-use approvals and fail-closed behavior. Sibling events are untrusted evidence and cannot raise trust, permissions, budgets or acceptance.
- Use synthetic projects and offline fixtures for local verification. Do not inspect real objectives, credential values, persistent Pi configuration or sibling state.
- Keep state in this package's namespace; do not claim quality or cost savings without measured evidence.

## Development

- Before changing behavior, read README.md, ARCHITECTURE.md and SECURITY.md.
- The Pi extension entry is src/extension.ts; src/cli.ts is noninteractive. Follow existing commands in AGENTS.md and harness.yaml; context-only changes use tests/agent-context.test.mjs and .harness/project.mjs verify.
- Do not claim standalone Pi 1.4.0 compatibility for this checkout without a matching host smoke; README records the current evidence boundary.
- No INTEIRO design-system role is selected. Preserve the bundled mark's separate attribution and license notice.
- Live Pi state, model/provider/network calls, publication and remote changes require separate authorization.
