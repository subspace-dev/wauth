import { ConnectButton, useActiveAddress, useConnection } from "@arweave-wallet-kit/react"
import { fixConnection, WAuthProviders } from "@wauth/strategy"
import { useEffect, useState } from "react"
import { getStrategy } from "../lib/strategy"

function App() {
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)

  const address = useActiveAddress()
  const { connected, disconnect } = useConnection()

  const githubStrategy = getStrategy(WAuthProviders.Github)
  githubStrategy.onAuthDataChange((data) => {
    console.log("[app] auth data changed", data)
    setAccessToken(data.accessToken)
    setEmail(data.email)
  })
  const googleStrategy = getStrategy(WAuthProviders.Google)
  googleStrategy.onAuthDataChange((data) => {
    console.log("[app] auth data changed", data)
    setAccessToken(data.accessToken)
    setEmail(data.email)
  })
  const discordStrategy = getStrategy(WAuthProviders.Discord)
  discordStrategy.onAuthDataChange((data) => {
    console.log("[app] auth data changed", data)
    setAccessToken(data.accessToken)
    setEmail(data.email)
  })

  // without this, on refresh the wallet shows the connected UI even if its disconnected
  useEffect(() => fixConnection(address, connected, disconnect), [address, connected, disconnect])

  useEffect(() => {
    if (!connected) {
      setAccessToken(null)
      setEmail(null)
    }
  }, [connected])

  return (
    <div className="app">
      <div className="container">
        <header className="header">
          <h1 className="title">WAuth Demo</h1>
          <p className="subtitle">Web2 Authentication for Arweave</p>
        </header>

        <main className="main">
          <div className="connect-section">
            <ConnectButton />
          </div>

          <div className="info-cards">
            <div className="card">
              <h3 className="card-title">🔗 Wallet Connection</h3>
              <div className="info-item">
                <span className="label">Address:</span>
                <span className="value">{address ? `${address.slice(0, 8)}...${address.slice(-8)}` : "Not connected"}</span>
              </div>
              <div className="info-item">
                <span className="label">Status:</span>
                <span className={`status ${connected ? 'connected' : 'disconnected'}`}>
                  {connected ? '🟢 Connected' : '🔴 Disconnected'}
                </span>
              </div>
            </div>

            <div className="card">
              <h3 className="card-title">🔐 Authentication Data</h3>
              <div className="info-item">
                <span className="label">Email:</span>
                <span className="value">{email || "Not available"}</span>
              </div>
              <div className="info-item">
                <span className="label">Access Token:</span>
                <span className="value token">
                  {accessToken ? `${accessToken.slice(0, 20)}...` : "Not available"}
                </span>
              </div>
            </div>
          </div>
        </main>

        <footer className="footer">
          <div className="powered-by">
            <p className="powered-text">Powered by <strong>WAuth</strong></p>
            <div className="packages">
              <div className="package">
                <h4>@wauth/sdk</h4>
                <div className="links">
                  <a href="https://github.com/ankushKun/wauth/tree/main/sdk" target="_blank" rel="noopener noreferrer">
                    📁 GitHub
                  </a>
                  <a href="https://www.npmjs.com/package/@wauth/sdk" target="_blank" rel="noopener noreferrer">
                    📦 npm
                  </a>
                </div>
              </div>
              <div className="package">
                <h4>@wauth/strategy - ArweaveWalletKit</h4>
                <div className="links">
                  <a href="https://github.com/ankushKun/wauth/tree/main/strategy" target="_blank" rel="noopener noreferrer">
                    📁 GitHub
                  </a>
                  <a href="https://www.npmjs.com/package/@wauth/strategy" target="_blank" rel="noopener noreferrer">
                    📦 npm
                  </a>
                </div>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default App
