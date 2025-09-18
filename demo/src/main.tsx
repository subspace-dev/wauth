import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ArweaveWalletKit } from '@arweave-wallet-kit/react'
import { getStrategy } from '../lib/strategy.ts'
import { WAuthProviders } from '@wauth/strategy'
import type { Strategy } from '@arweave-wallet-kit/core/strategy'
import WanderStrategy from "@arweave-wallet-kit/wander-strategy"


export default function Main() {
  const strategies = [
    getStrategy(WAuthProviders.Github),
    getStrategy(WAuthProviders.Google),
    getStrategy(WAuthProviders.Discord),
    getStrategy(WAuthProviders.X),
  ]

  // if (process.env.NODE_ENV === "development") {
  //   // for comparison during development
  //   // strategies.push(new WanderStrategy() as any)
  // }

  return <ArweaveWalletKit
    config={{
      appInfo: {
        name: "WAuth Demo",
        logo: "4R-dRRMdFerUnt8HuQzWT48ktgKsgjQ0uH6zlMFXVw",
      },
      strategies: strategies as unknown as Strategy[],
      permissions: ["ACCESS_ADDRESS", "SIGN_TRANSACTION"]
    }}

    theme={{
      displayTheme: "dark",
      accent: { r: 110, g: 169, b: 100 },
    }}>
    <App />
  </ArweaveWalletKit>
}

createRoot(document.getElementById('root')!).render(<Main />)
