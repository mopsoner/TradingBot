# OpenClaw reference alignment

This folder adds a machine-readable project manifest (`project.template.json`) to keep this repository aligned with the OpenClaw reference structure used in `docs/reference`.

Because this runtime cannot reach GitHub directly, the manifest mirrors the strategy, components, modes, and safety rules already defined by:
- `AGENTS.md`
- `agents/eth-liquidity-trader/config.json`
- `docs/architecture.md`

When network access is available, compare this file to the latest OpenClaw reference and update `template_version` if required.
