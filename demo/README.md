# WAuth Demo

A comprehensive demo showcasing Web2 social authentication for Arweave applications using WAuth and Arweave Wallet Kit.

## Features

- 🔐 Social Authentication with multiple providers:
  - Google
  - GitHub
  - Discord
- 🔑 Multiple Wallet Management
- 📝 Transaction Signing
- 🔏 Data Signing
- 🌐 AO Protocol Integration
- 🎨 Modern UI with Dark Mode

## Getting Started

### Prerequisites

- Node.js 16+
- npm or bun

### Installation

1. Clone the repository:
```bash
git clone https://github.com/ankushKun/wauth.git
cd wauth/demo
```

2. Install dependencies:
```bash
npm install
# or
bun install
```

3. Start the development server:
```bash
npm run dev
# or
bun run dev
```

The app will be available at `http://localhost:5174`

## Implementation Details

### 1. Dependencies

```json
{
  "dependencies": {
    "@arweave-wallet-kit/core": "^0.1.1",
    "@arweave-wallet-kit/react": "^0.3.2",
    "@permaweb/aoconnect": "^0.0.85",
    "@wauth/strategy": "../strategy",
    "arweave": "2.0.0-ec.1"
  }
}
```

### 2. WAuth Strategy Setup

```ts
// lib/strategy.ts
import WAuthStrategy, { WAuthProviders } from "@wauth/strategy";

const strategies = {
    [WAuthProviders.Google]: new WAuthStrategy({ provider: WAuthProviders.Google }),
    [WAuthProviders.Github]: new WAuthStrategy({ provider: WAuthProviders.Github }),
    [WAuthProviders.Discord]: new WAuthStrategy({ provider: WAuthProviders.Discord })
};

export function getStrategy(provider: WAuthProviders): WAuthStrategy {
    return strategies[provider]
}
```

### 3. Arweave Wallet Kit Integration

```tsx
// main.tsx
export default function Main() {
    const strategies = [
        getStrategy(WAuthProviders.Github),
        getStrategy(WAuthProviders.Google),
        getStrategy(WAuthProviders.Discord)
    ]

    return (
        <ArweaveWalletKit
            config={{
                strategies: strategies as Strategy[],
                permissions: ["ACCESS_ADDRESS", "SIGN_TRANSACTION"]
            }}>
            <App />
        </ArweaveWalletKit>
    )
}
```

### 4. Features Implementation

- **Wallet Connection**: Uses `ConnectButton` from Arweave Wallet Kit
- **Multiple Wallets**: Manage multiple wallets per account
- **Transaction Signing**: Sign and post Arweave transactions
- **Data Signing**: Sign arbitrary data
- **AO Protocol**: Send messages to AO processes

## Learn More

- [@wauth/sdk Documentation](../sdk/README.md)
- [@wauth/strategy Documentation](../strategy/README.md)
- [Arweave Wallet Kit Documentation](https://docs.arweavekit.com/wallets/introduction)
