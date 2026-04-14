# Repository Agent Rules

This file defines repository-level delivery expectations for agents working in this project.

## Branch Completion Requirement

- Every time a branch-level implementation is finished, the agent must provide a `.xpi` package for manual installation and testing by the user.
- The agent must not treat code changes as fully handed off until it reports the generated `.xpi` path.
- The expected human verification flow is:
  1. Build the plugin into an `.xpi`
  2. Tell the user the exact output path
  3. Ask the user to manually install the `.xpi` in Zotero and test it

## Required Build Script

- Use `npm run build:xpi` as the default packaging command.
- This command must produce a versioned `.xpi` copy under `dist/` and print the final path.
- The raw scaffold output remains at `.scaffold/build/zotero-resource-search-mcp.xpi`, but branch handoff should prefer the versioned copy in `dist/`.

## Agent Handoff Language

When reporting completion of branch work, include:

- that an `.xpi` was generated
- the exact path to the generated `.xpi`
- a note that the user should manually install it in Zotero and test it

Example:

`已生成可安装包：dist/zotero-resource-search-mcp-v0.1.0.xpi，请在 Zotero 中手动安装并测试。`
