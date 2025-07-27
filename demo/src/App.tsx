import { ConnectButton, useActiveAddress, useApi, useConnection } from "@arweave-wallet-kit/react"
import { fixConnection, WAuthProviders } from "@wauth/strategy"
import { useEffect, useState } from "react"
// import { getActiveWAuthProvider, getStrategy } from "../lib/strategy"
import { connect, createDataItemSigner, createSigner, message } from "@permaweb/aoconnect"
import Arweave from "arweave/web"

function App() {
  const address = useActiveAddress()
  const api = useApi()
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [connectedWallets, setConnectedWallets] = useState<any[]>([])
  const [isLoadingWallets, setIsLoadingWallets] = useState(false)
  const [isAddingWallet, setIsAddingWallet] = useState(false)
  const [dataToSign, setDataToSign] = useState<string | null>(null)
  const [signedData, setSignedData] = useState<string | null>(null)
  const [processId, setProcessId] = useState<string | null>("0syT13r0s0tgPmIed95bJnuSqaD29HQNN8D3ElLSrsc")
  const [dataText, setDataText] = useState<string | null>("Hello WAuth!")
  const [actionText, setActionText] = useState<string | null>("Info")
  const [aoMsgId, setAoMsgId] = useState<string | null>(null)
  const [signatureInput, setSignatureInput] = useState<string | null>(null)
  const [signatureOutput, setSignatureOutput] = useState<string | null>(null)

  // Token transfer states
  const [tokenProcessId, setTokenProcessId] = useState<string>("0syT13r0s0tgPmIed95bJnuSqaD29HQNN8D3ElLSrsc")
  const [transferQuantity, setTransferQuantity] = useState<string>("1")
  const [transferRecipient, setTransferRecipient] = useState<string>("")
  const [transferMsgId, setTransferMsgId] = useState<string | null>(null)
  const [isTransferring, setIsTransferring] = useState(false)

  const { connected, disconnect } = useConnection()

  // const githubStrategy = getStrategy(WAuthProviders.Github)
  // githubStrategy.onAuthDataChange((data) => {
  //   console.log("[app] auth data changed", data)
  //   setAccessToken(data.accessToken)
  //   setEmail(data.email)
  // })
  // const googleStrategy = getStrategy(WAuthProviders.Google)
  // googleStrategy.onAuthDataChange((data) => {
  //   console.log("[app] auth data changed", data)
  //   setAccessToken(data.accessToken)
  //   setEmail(data.email)
  // })
  // const discordStrategy = getStrategy(WAuthProviders.Discord)
  // discordStrategy.onAuthDataChange((data) => {
  //   console.log("[app] auth data changed", data)
  //   setAccessToken(data.accessToken)
  //   setEmail(data.email)
  // })
  api?.onAuthDataChange && api?.onAuthDataChange((data) => {
    console.log("[app] auth data changed", data)
    setAccessToken(data.accessToken)
    setEmail(data.email)
  })

  // Function to fetch connected wallets
  const fetchConnectedWallets = async () => {
    try {
      setIsLoadingWallets(true)
      // const strategy = getStrategy(getActiveWAuthProvider())
      const wallets = await api.getConnectedWallets()
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

      // const strategy = getStrategy(getActiveWAuthProvider())
      const result = await api.addConnectedWallet(window.arweaveWallet)

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

      // const strategy = getStrategy(getActiveWAuthProvider())
      await api.removeConnectedWallet(walletId)

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
    const ar = Arweave.init({
      host: "arweave.net",
      port: 443,
      protocol: "https"
    })

    const dataUint8Array = new TextEncoder().encode(dataToSign)
    const transaction = await ar.createTransaction({
      data: dataUint8Array
    })
    transaction.addTag("Action", "Info")
    const signedTransaction = await api.sign(transaction)
    console.log(signedTransaction)
    setSignedData("signature: " + signedTransaction.signature)
    // submit transaction
    const res = await ar.transactions.post(signedTransaction)
    console.log("res", res)


    // sample using ar
    // const ar = Arweave.init({})
    // console.log("----------- sample ------------")
    // const jwk = await ar.wallets.generate()
    // const tx = await ar.createTransaction({
    //   data: dataToSign
    // })
    // console.log("transaction", tx)
    // await ar.transactions.sign(tx, jwk)
    // console.log("transaction", tx)
    // const res1 = await ar.transactions.post(tx)
    // console.log("res1", res1)
  }



  async function sendAoMessage() {
    const signer = api.getAoSigner()

    const ao = connect({ MODE: "legacy" })
    const res = await ao.message({
      process: processId,
      data: dataText,
      tags: [{ name: "Action", value: actionText }],
      signer: signer
    })
    console.log(res)
    setAoMsgId(res)
  }

  async function signData() {
    // const uint8array = new TextEncoder().encode(signatureInput)
    const signature = await api.signature(signatureInput)
    console.log(signature)
    setSignatureOutput(Buffer.from(signature).toString("hex"))
  }

  async function transferTokens() {
    if (!transferRecipient.trim()) {
      alert("Please enter a recipient address")
      return
    }

    if (!transferQuantity.trim() || isNaN(Number(transferQuantity))) {
      alert("Please enter a valid quantity")
      return
    }

    if (!tokenProcessId.trim()) {
      alert("Please enter a token process ID")
      return
    }

    try {
      setIsTransferring(true)
      const signer = api.getAoSigner()
      const ao = connect({ MODE: "legacy" })

      const res = await ao.message({
        process: tokenProcessId,
        tags: [
          { name: "Action", value: "Transfer" },
          { name: "Recipient", value: transferRecipient },
          { name: "Quantity", value: transferQuantity }
        ],
        signer: signer
      })

      console.log("Transfer result:", res)
      setTransferMsgId(res)
      // alert("Transfer initiated successfully!")
    } catch (error) {
      console.error("Transfer error:", error)
      // alert(`Transfer failed: ${error}`)
    } finally {
      setIsTransferring(false)
    }
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

            {connected && <div className="card">
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
                <div className="info-item">
                  <span className="label">Action:</span>
                  <input type="text" className="input" placeholder="Enter action"
                    defaultValue={"Info"}
                    onChange={(e) => setActionText(e.target.value)} />
                </div>
                <button className="btn ao-btn" onClick={sendAoMessage}>Send Ao Message</button>
                {aoMsgId && <a href={`https://aolink.arnode.asia/#/message/${aoMsgId}`} target="_blank" rel="noopener noreferrer">
                  <button className="btn">View on AO Link</button>
                </a>}
              </div>
            </div>}

            {
              connected && <div className="card">
                <h3 className="card-title">🔐 Sign Data</h3>
                <div className="info-item">
                  <span className="label">Data:</span>
                  <input type="text" className="input" placeholder="Enter data"
                    onChange={(e) => setSignatureInput(e.target.value)} />
                </div>
                <button className="btn" onClick={signData}>Sign Data</button>
                <div className="info-item">
                  <span className="label">Signature:</span>
                  <span className="value" style={{ wordBreak: "break-all", width: "100%", minWidth: "500px" }}>{signatureOutput ? signatureOutput : "Not available"}</span>
                </div>
              </div>
            }

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

            {connected && <div className="card">
              <h3 className="card-title">💸 Token Transfer</h3>
              <div className="info-item">
                <span className="label">Token Process ID:</span>
                <input
                  type="text"
                  className="input"
                  placeholder="Enter token process ID"
                  value={tokenProcessId}
                  onChange={(e) => setTokenProcessId(e.target.value)}
                />
              </div>
              <div className="info-item">
                <span className="label">Quantity:</span>
                <input
                  type="text"
                  className="input"
                  placeholder="Enter quantity to transfer"
                  value={transferQuantity}
                  onChange={(e) => setTransferQuantity(e.target.value)}
                />
              </div>
              <div className="info-item">
                <span className="label">Recipient Address:</span>
                <input
                  type="text"
                  className="input"
                  placeholder="Enter recipient wallet address"
                  value={transferRecipient}
                  onChange={(e) => setTransferRecipient(e.target.value)}
                />
              </div>
              <button
                className="btn"
                onClick={transferTokens}
                disabled={isTransferring}
              >
                {isTransferring ? "Transferring..." : "💸 Transfer Tokens"}
              </button>
              {transferMsgId && (
                <div className="info-item">
                  <span className="label">Transfer Message:</span>
                  <a href={`https://aolink.arnode.asia/#/message/${transferMsgId}`} target="_blank" rel="noopener noreferrer">
                    <button className="btn">View on AO Link</button>
                  </a>
                </div>
              )}
            </div>}
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
