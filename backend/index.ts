import { Hono } from 'hono'
import Arweave from 'arweave'

const app = new Hono()
const ar = Arweave.init({})

// delay 2 seconds to let pocketbase start
await new Promise(resolve => setTimeout(resolve, 2000))

app.get('/', (c) => c.json({ message: "OK!" }))

app.get('/jwk', async (c) => {
    const jwk = await ar.wallets.generate()
    const address = await ar.wallets.jwkToAddress(jwk)
    return c.json({ jwk, address })
})

app.post('/sign', async (c) => {

})


console.log("Backend started")

export default {
    port: 8091,
    fetch: app.fetch,
}