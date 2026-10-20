# Agent Execution and Safety Policy

## Autonomous Low-Risk Execution
- **Routine Actions**: Proceed autonomously with routine, non-destructive actions (code analysis, linting, running unit tests, formatting, creating non-destructive files, and targeted refactoring) without pausing for repetitive confirmations.
- **Workflow Continuity**: When a clear implementation plan is underway, carry out contiguous implementation steps directly.

## Guardrails & Explicit Confirmation Requirements
Always pause and request explicit user confirmation before executing any of the following:
1. **Destructive Operations**: Deleting files or directories (`rm`, `Remove-Item`), irreversible git commands (`git reset --hard`, `git clean -fd`, `git push --force`), dropping database schemas/tables, or pruning Docker volumes.
2. **Sensitive Data & Credentials**: Accessing, viewing, copying, or modifying credential files, `.env` files, production keys, auth tokens, passwords, or files outside the project root.
3. **Security Configurations**: Altering authentication/authorization middleware, network firewall rules, or security policy files unless specifically instructed.
4. **External Infrastructure**: Making unreviewed destructive changes to external cloud services, third-party APIs, or production deployments.

