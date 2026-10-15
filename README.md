![image](assets/lute-readme.png) <!-- markdownlint-disable MD041 -->

# Lute

[![CodeQL](https://github.com/GalaxyPay/lute/actions/workflows/codeql.yml/badge.svg)](https://github.com/GalaxyPay/lute/actions/workflows/codeql.yml) [![Snyk Security Monitored](https://img.shields.io/badge/Security-monitored-8A2BE2?logo=snyk)](https://snyk.io/test/github/GalaxyPay/lute) [![License](https://img.shields.io/badge/License-AGPL--3.0-3DA639?logo=opensourceinitiative&logoColor=white)](LICENSE)

An open-source wallet for the [Algorand](https://algorand.co) blockchain, available as a **progressive web app** and **browser extension**.

**[lute.app](https://lute.app)**

## Features

- Manage Algorand and AVM assets from any modern browser
- Hardware wallet support via Ledger (WebHID / WebUSB)
- Installable as a PWA or browser extension
- Client-side key management: your keys reside on your device
- Built with audited cryptographic libraries

## Development

Requires **Node.js >= 22.16.0** and **pnpm**.

```sh
pnpm i
```

| Command              | Description                                                         |
| -------------------- | ------------------------------------------------------------------- |
| `pnpm dev`           | Web app with HMR                                                    |
| `pnpm devx`          | Browser extension with HMR                                          |
| `pnpm build`         | Production web build to `/dist`                                     |
| `pnpm buildx`        | Production extension build to `/extension`                          |
| `pnpm lint`          | Lint and auto-fix                                                   |
| `pnpm test`          | Unit tests (keystore, migration, sync, signing requests)            |
| `pnpm test:coverage` | Unit tests with a coverage report in `/coverage`                    |
| `pnpm test:localnet` | ARC-55 multisig and fee tests on localnet (`algokit localnet start`) |

## Upgrading from 1.x

Lute 2.0 stores every local key in one keystore, protected by a single wallet password or, if you never set one, by a key that never leaves the browser. Mnemonics can now be exported from the account menu.

- The first time you enter your password after upgrading, seeds stored by 1.x move into the keystore automatically. They keep working, but 1.x only stored a one-way form of each key, so their mnemonics cannot be shown yet.
- To make such an account exportable, choose **Upgrade Account** from its menu and re-enter its mnemonic. Lute checks it against the account's public key, so nothing else is needed. This is optional and can be done one account at a time.
- Algo25 accounts are now covered by the wallet password, if one is set.
- Once upgraded, the browser's data cannot be opened by Lute 1.x.
- Your mnemonics are your backup. Lute does not export key files.
- To copy accounts between the web app and the extension in the same browser, use **Sync to Extension** or **Sync to Web App** in Settings. The receiving wallet asks you to confirm, then adds the accounts it doesn't already have.

## Contributing

See [CONTRIBUTING](CONTRIBUTING.md).

## Security

If you discover a vulnerability, **do not open a public issue**. See [SECURITY](SECURITY.md).

## License

[AGPL-3.0](LICENSE.md)
