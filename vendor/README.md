# vendor

Prebuilt packages Lute depends on before they are published to npm.

## xhd-wallet-api-2.0.0-canary.2-noble.1.tgz

- Package: `@algorandfoundation/xhd-wallet-api`
- Source: https://github.com/algorandfoundation/xHD-Wallet-API-ts, branch `refactor/v2-noble-sync`
- Commit: `5844bef` (merge of upstream `main` into the branch; pushed to `origin/refactor/v2-noble-sync`)
- Version: `2.0.0-canary.2-noble.1` is a local build, not an npm release. It is npm's `2.0.0-canary.2` plus the `refactor/v2-noble-sync` work, versioned so it can't be confused with a future upstream canary.
- Built with: `pnpm install --frozen-lockfile && pnpm pack` (`prepack` runs `pnpm build`), with the version set by hand in `package.json` before packing. A clean rebuild of `5844bef` was checked to match the tarball's `dist/` byte for byte.

Remove this file and the tarball once a `2.0.0-canary.N` containing this work is published to npm, and depend on that version.
