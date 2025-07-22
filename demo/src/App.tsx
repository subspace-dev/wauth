import { ConnectButton, useActiveAddress, useConnection } from "@arweave-wallet-kit/react"
import { fixConnection, WAuthProviders } from "@wauth/strategy"
import { useEffect, useState } from "react"
import { getActiveWAuthProvider, getStrategy } from "../lib/strategy"
import { connect, createDataItemSigner, message } from "@permaweb/aoconnect"
import Transaction from "arweave/web/lib/transaction"
import Arweave from "arweave"
import { ArweaveSigner, createData, DataItem } from "@dha-team/arbundles/web"

function App() {
  const address = useActiveAddress()
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [connectedWallets, setConnectedWallets] = useState<any[]>([])
  const [isLoadingWallets, setIsLoadingWallets] = useState(false)
  const [isAddingWallet, setIsAddingWallet] = useState(false)
  const [dataToSign, setDataToSign] = useState<string | null>(null)
  const [signedData, setSignedData] = useState<string | null>(null)
  const [processId, setProcessId] = useState<string | null>("0syT13r0s0tgPmIed95bJnuSqaD29HQNN8D3ElLSrsc")
  const [dataText, setDataText] = useState<string | null>("Hello WAuth!")

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

  // Function to fetch connected wallets
  const fetchConnectedWallets = async () => {
    try {
      setIsLoadingWallets(true)
      const strategy = getStrategy(getActiveWAuthProvider())
      const wallets = await strategy.getConnectedWallets()
      setConnectedWallets(wallets || [])
    } catch (error) {
      console.error("Error fetching connected wallets:", error)
      setConnectedWallets([])
    } finally {
      setIsLoadingWallets(false)
    }
  }

  // Function to add a connected wallet
  const addConnectedWallet = async () => {
    try {
      setIsAddingWallet(true)

      if (!window.arweaveWallet) {
        alert("No Arweave wallet found. Please install an Arweave wallet extension.")
        return
      }

      await window.arweaveWallet.disconnect()

      // Connect to the wallet with required permissions
      await window.arweaveWallet.connect(["ACCESS_ADDRESS", "ACCESS_PUBLIC_KEY", "SIGNATURE"])

      const strategy = getStrategy(getActiveWAuthProvider())
      const result = await strategy.addConnectedWallet(window.arweaveWallet)

      console.log("Wallet connected:", result)

      // Refresh the connected wallets list
      await fetchConnectedWallets()

      alert("Wallet connected successfully!")
    } catch (error) {
      console.error("Error adding connected wallet:", error)
      alert(`Failed to connect wallet: ${error}`)
    } finally {
      setIsAddingWallet(false)
    }
  }

  // Function to remove a connected wallet
  const removeConnectedWallet = async (walletId: string, walletAddress: string) => {
    try {
      const confirmRemove = confirm(`Are you sure you want to disconnect wallet ${walletAddress.slice(0, 8)}...${walletAddress.slice(-8)}?`)
      if (!confirmRemove) return

      const strategy = getStrategy(getActiveWAuthProvider())
      await strategy.removeConnectedWallet(walletId)

      console.log("Wallet disconnected:", walletId)

      // Refresh the connected wallets list
      await fetchConnectedWallets()

      alert("Wallet disconnected successfully!")
    } catch (error) {
      console.error("Error removing connected wallet:", error)
      alert(`Failed to disconnect wallet: ${error}`)
    }
  }

  // without this, on refresh the wallet shows the connected UI even if its disconnected
  useEffect(() => fixConnection(address, connected, disconnect), [address, connected, disconnect])

  useEffect(() => {
    if (!connected) {
      setAccessToken(null)
      setEmail(null)
      setConnectedWallets([])
    } else {
      // Fetch connected wallets when user connects
      fetchConnectedWallets()
    }
  }, [connected])

  async function signTransaction() {
    const strategy = getStrategy(getActiveWAuthProvider())
    const dataUint8Array = new TextEncoder().encode(dataToSign)
    const transaction = new Transaction({
      data: dataUint8Array
    })
    transaction.addTag("Action", "Info")
    const signedTransaction = await strategy.sign(transaction)
    console.log(signedTransaction)
    setSignedData("signature: " + signedTransaction.signature)
    // submit transaction
    const ar = Arweave.init({})
    const res = await ar.transactions.post(signedTransaction)
    console.log("res", res)

    // const ar = Arweave.init({})
    // const jwk = await ar.wallets.generate()
    // const testTx = await ar.createTransaction({
    //   // data: dataUint8Array,
    //   // tags: []
    // })
    // console.log("testTx", testTx)
    // await ar.transactions.sign(testTx, jwk)
    // console.log("testTx signed", testTx)

  }



  async function sendAoMessage() {
    const strategy = getStrategy(getActiveWAuthProvider())
    const signer = strategy.getAoSigner()
    console.log(processId, dataText)

    // this function works as the signer
    // function createDataItemSignerManual(jwk) {
    //   const newSigner = async (create, createDataItem = (buf) => new DataItem(buf)) => {
    //     console.log("create", create)
    //     console.log("createDataItem", createDataItem)

    //     const { data, tags, target, anchor } = await create({ alg: 'rsa-v1_5-sha256', passthrough: true })
    //     return signer({ data, tags, target, anchor })
    //   }
    //   const signer = async ({ data, tags, target, anchor }) => {
    //     console.log("data", data)
    //     console.log("tags", tags)
    //     console.log("target", target)
    //     console.log("anchor", anchor)
    //     const signer = new ArweaveSigner(jwk)
    //     const dataItem = createData(data, signer, { tags, target, anchor })
    //     return dataItem.sign(signer)
    //       .then(async () => ({
    //         id: await dataItem.id,
    //         raw: await dataItem.getRaw()
    //       }))
    //   }

    //   return newSigner
    // }

    const ao = connect({ MODE: "legacy" })
    const res = await ao.message({
      process: processId,
      data: dataText,
      anchor: "1".padEnd(32, "0"),
      tags: [{ name: "Action", value: "Info" }],
      signer: signer
    })
    console.log(res)
  }

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

            <div className="card">
              <h3 className="card-title">🔐 Sign Transaction (WIP, BETA)</h3>
              <div className="info-item">
                <span className="label">Test sign a transaction with custom data</span>
                <input type="text" className="input" placeholder="Enter data to sign" onChange={(e) => setDataToSign(e.target.value)} />
              </div>
              <div className="info-item">
                <span className="label">Signed Data:</span>
                <span className="value" style={{ wordBreak: "break-all", width: "100%", minWidth: "500px" }}>{signedData ? signedData : "Not available"}</span>
              </div>
              <button className="btn" onClick={signTransaction}>Sign Transaction</button>

              <div className="ao-message-section">
                <div className="info-item">
                  <span className="label">Process ID:</span>
                  <input type="text" className="input" placeholder="Enter process id"
                    defaultValue={processId}
                    onChange={(e) => setProcessId(e.target.value)} />
                </div>
                <div className="info-item">
                  <span className="label">Data:</span>
                  <input type="text" className="input" placeholder="Enter data"
                    defaultValue={"Hello WAuth!"}
                    onChange={(e) => setDataText(e.target.value)} />
                </div>
                <button className="btn ao-btn" onClick={sendAoMessage}>Send Ao Message</button>
              </div>
            </div>

            {connected && (
              <div className="card">
                <h3 className="card-title">💼 Connected Wallets</h3>
                <p className="label">These are wallets that are connected to your account</p>
                <br />
                <div className="wallet-actions">
                  <button
                    onClick={addConnectedWallet}
                    disabled={isAddingWallet}
                    className="add-wallet-btn"
                  >
                    {isAddingWallet ? "Adding..." : "➕ Connect Window Wallet"}
                  </button>
                  <button
                    onClick={fetchConnectedWallets}
                    disabled={isLoadingWallets}
                    className="refresh-btn"
                  >
                    {isLoadingWallets ? "Loading..." : "🔄 Refresh"}
                  </button>
                </div>

                <div className="connected-wallets-list">
                  {isLoadingWallets ? (
                    <div className="loading">Loading connected wallets...</div>
                  ) : connectedWallets.length > 0 ? (
                    connectedWallets.map((wallet, index) => (
                      <div key={wallet.id || index} className="wallet-item">
                        <div className="wallet-info">
                          <div className="wallet-address">
                            <span className="label">Address:</span>
                            <span className="value">
                              {wallet.address ? `${wallet.address.slice(0, 8)}...${wallet.address.slice(-8)}` : "Unknown"}
                            </span>
                          </div>
                          <div className="wallet-created">
                            <span className="label">Connected:</span>
                            <span className="value">
                              {wallet.created ? new Date(wallet.created).toLocaleDateString() : "Unknown"}
                            </span>
                          </div>
                        </div>
                        <div className="wallet-item-actions">
                          <button
                            onClick={() => removeConnectedWallet(wallet.id, wallet.address)}
                            className="remove-wallet-btn"
                          >
                            ❌ Disconnect
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="no-wallets">
                      <p>No connected wallets found.</p>
                      <p>Click "Add Arweave Wallet" to connect your first wallet.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
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
