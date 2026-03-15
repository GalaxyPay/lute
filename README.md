![image](assets/lute-readme.png) <!-- markdownlint-disable MD041 -->

# Lute

[![Snyk Security Monitored](https://img.shields.io/badge/Security-monitored-8A2BE2?logo=snyk)](https://snyk.io/test/github/GalaxyPay/lute) [![License](https://img.shields.io/badge/License-AGPL--3.0-3DA639?logo=opensourceinitiative&logoColor=white)](LICENSE)

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

| Command       | Description                |
| ------------- | -------------------------- |
| `pnpm dev`    | Web app with HMR           |
| `pnpm devx`   | Browser extension with HMR |
| `pnpm build`  | Production web build       |
| `pnpm buildx` | Production extension build |
| `pnpm lint`   | Lint and auto-fix          |

## Contributing

See [CONTRIBUTING](CONTRIBUTING).

## Security

If you discover a vulnerability, **do not open a public issue**. See [SECURITY](SECURITY).

## License

[AGPL-3.0](LICENSE)
