# @wauth/sdk

The WAuth SDK provides seamless Web2 social authentication for Arweave applications. It creates arweaveWallet compatible wallet instances for users after they authenticate with popular social providers.

## Installation

Install the SDK in your project:

```bash
npm i @wauth/sdk@latest
```

## Features

- 🔐 Social Authentication (Google, GitHub, Discord)
- 🔑 Arweave Wallet Compatibility
- 📝 Transaction Signing
- 🔄 Multiple Wallet Management
- 🌐 AO Protocol Integration
- 🔏 Data Signing

## Setup & Usage

### Basic Setup

```ts
import { WAuth, WAuthProviders } from "@wauth/sdk";

// Initialize the SDK
const wauth = new WAuth({ dev: false });

// Optional: Listen for authentication state changes
wauth.onAuthDataChange((authData) => {
    if (authData) {
        console.log("User authenticated:", authData);
    } else {
        console.log("User logged out");
    }
});
```

### Authentication

```ts
// Connect with social provider
async function connectWithGoogle() {
    try {
        const authData = await wauth.connect({ 
            provider: WAuthProviders.Google 
        });
        
        if (authData) {
            console.log("Successfully authenticated!");
            const address = await wauth.getActiveAddress();
            console.log("Wallet address:", address);
        }
    } catch (error) {
        console.error("Authentication failed:", error);
    }
}

// Available providers
WAuthProviders.Google   // "google"
WAuthProviders.Github   // "github" 
WAuthProviders.Discord  // "discord"
```

### Wallet Management

```ts
// Get connected wallets
const wallets = await wauth.getConnectedWallets();

// Add a new wallet
await wauth.addConnectedWallet(window.arweaveWallet);

// Remove a wallet
await wauth.removeConnectedWallet(walletId);
```

### Transaction & Data Signing

```ts
// Sign a transaction
const transaction = await arweave.createTransaction({
    data: new TextEncoder().encode("Hello WAuth!")
});
const signedTx = await wauth.sign(transaction);

// Sign raw data
const signature = await wauth.signature("Data to sign");

// Get AO Protocol signer
const signer = wauth.getAoSigner();
const ao = connect({ MODE: "legacy" });
const res = await ao.message({
    process: processId,
    data: "Hello AO!",
    tags: [{ name: "Action", value: "Info" }],
    signer: signer
});
```

## Integration with Arweave Wallet Kit

For React applications, we recommend using `@wauth/strategy` with Arweave Wallet Kit for a seamless integration. Check out the [strategy package](https://github.com/ankushKun/wauth/tree/main/strategy) for more details.

## Demo

Check out our [live demo](https://github.com/ankushKun/wauth/tree/main/demo) to see WAuth in action with all features:
- Social Authentication
- Wallet Management
- Transaction Signing
- Data Signing
- AO Protocol Integration

![WAuth SDK Demo](https://raw.githubusercontent.com/ankushKun/wauth/refs/heads/main/assets/sdk.gif)

