# @wauth/sdk

The WAuth SDK provides seamless Web2 social authentication for Arweave applications. It creates arweaveWallet compatible wallet instances for users after they authenticate with popular social providers.

## Installation

Install the SDK in your project:

```bash
npm i @wauth/sdk@latest
```

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

### Injecting Global arweaveWallet

TODO

### React Example

Check [subspace](https://github.com/subspace-dev/app) source code for reference on the implementation in a prod app
- use-wallet.ts - wallet connection manager hook

On successful implementation, users will see a seamless social authentication flow that creates an Arweave-compatible wallet.

![WAuth SDK Demo](https://raw.githubusercontent.com/ankushKun/wauth/refs/heads/main/assets/sdk.gif)

