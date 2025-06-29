import { ConnectButton, useActiveAddress, useConnection } from "@arweave-wallet-kit/react"
import { fixConnection, WAuthProviders } from "@wauth/strategy"
import { useEffect, useState } from "react"
import { getStrategy } from "../lib/strategy"


function App() {
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)


  const address = useActiveAddress()
  const { connected, disconnect } = useConnection()
  const strategy = getStrategy(WAuthProviders.Github)
  strategy.onAuthDataChange((data) => {
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

  return <div>
    <ConnectButton />
    <div>
      <p>Address: {address || "NA"}</p>
      <p>Connected: {connected.toString()}</p>
      <br />
      <h3>Github Auth Data</h3>
      <p>Email: {email || "NA"}</p>
      <p>AccessToken: {accessToken || "NA"}</p>
    </div>
  </div>
}

export default App
