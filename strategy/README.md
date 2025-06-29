# @wauth/strategy

The WAuthStrategy is a wrapper around [@wauth/sdk](../sdk) to make the Social Auth SDK compatible with Arweave Wallet Kit

Check [demo](../demo/) directory for a Vite + React example implementation of [@wauth/strategy](https://www.npmjs.com/package/@wauth/strategy) with [Arweave Wallet Kit](https://www.npmjs.com/package/@arweave-wallet-kit/react)

## Setup & Usage

### Install the strategy

If you have a webapp with Arweave Wallet Kit setup, you can just install and use the WAuthStrategy right away

```bash
npm i @wauth/strategy@latest
```

### Create strategies helper function 

```ts
// lib/strategies.ts

import WAuthStrategy, { WAuthProviders } from "@wauth/strategy";

// edit this object to add/remove whatever oauth you need
const strategies: { [key: string]: WAuthStrategy } = {
    [WAuthProviders.Google]: new WAuthStrategy({ provider: WAuthProviders.Google }),
    [WAuthProviders.Github]: new WAuthStrategy({ provider: WAuthProviders.Github }),
    [WAuthProviders.Discord]: new WAuthStrategy({ provider: WAuthProviders.Discord })
}

export function getStrategy(provider: WAuthProviders): WAuthStrategy {
    return strategies[provider]
}
```

### Add Strategies to ArweaveWalletKit context at the root of your app


```ts
...

import { getStrategy } from '../lib/strategy.ts'
import { WAuthProviders } from '@wauth/strategy'
import type { Strategy } from '@arweave-wallet-kit/core/strategy'

...

export default function Main(){
    // ...

    // edit to add/remove whatever oauth you need
    const strategies = [
        getStrategy(WAuthProviders.Github),
        getStrategy(WAuthProviders.Google),
        getStrategy(WAuthProviders.Discord)
    ]

    // ...

    return <ArweaveWalletKit
        config={{
            // ...
            strategies: strategies as Strategy[],
            // ...
        }}>
            <App />
    </ArweaveWalletKit>
}
```

```ts
// App component

import { fixConnection } from "@wauth/strategy"

export default function App(){
    const address = useActiveAddress()
    const { connected, disconnect } = useConnection()

    // without this, on every page refresh, the wallet shows the connected UI button even if it's disconnected
    useEffect(() => fixConnection(address, connected, disconnect), [address, connected, disconnect])

    // ...
}
```

On successful implementation one would see the following options in the wallet connect modal

![awk](../assets/awk.gif)