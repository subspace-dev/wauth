import { Hono } from 'hono'
import Arweave from 'arweave'
import Pocketbase from 'pocketbase'
import dotenv from 'dotenv'
import { cors } from 'hono/cors'
import crypto from "node:crypto"

dotenv.config()
const ar = Arweave.init({})

const app = new Hono()
app.use(cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization']
}))

// delay 2 seconds to let pocketbase start
await new Promise(resolve => setTimeout(resolve, 2000))

const pbUrl = 'http://localhost:8090'
const pb = new Pocketbase(pbUrl)
pb.autoCancellation(false)

// adming auth pocketbase
await pb.collection("_superusers").authWithPassword(process.env.SU_EMAIL!, process.env.SU_PASS!)


app.get('/', (c) => c.json({ message: "OK!" }))

app.get('/jwk', async (c) => {
    const jwk = await ar.wallets.generate()
    const address = await ar.wallets.jwkToAddress(jwk)
    return c.json({ jwk, address })
})

app.post('/sign', async (c) => {
    // TODO
})

// 1. validate the publicKeyString is the public key of the address
// 2. validate the signature is signed by the public key
async function validateSignature(address: string, publicKeyString: string, signatureBase64String: string): Promise<boolean> {
    try {
        // Convert signature from base64 to Uint8Array
        const signature = new Uint8Array(Buffer.from(signatureBase64String, 'base64'));

        // Verify that the address corresponds to the public key first
        const derivedAddress = await ar.wallets.getAddress({ n: publicKeyString, e: 'AQAB', kty: 'RSA' });
        if (derivedAddress !== address) {
            console.error('Address validation failed: provided address does not match the public key');
            console.error('Provided address:', address);
            console.error('Derived address:', derivedAddress);
            return false;
        }

        // Recreate the exact data that was signed (address + public key)
        // This must match exactly what was signed in the strategy: JSON.stringify({ address, pkey })
        const signedData = { address, pkey: publicKeyString };
        const originalData = JSON.stringify(signedData);
        const data = new TextEncoder().encode(originalData);

        console.log('Validating signature for data:', originalData);

        // Hash the data using SHA-256 (same as Wander/ArConnect does)
        const hash = await crypto.subtle.digest('SHA-256', data);

        // Import the public key for verification
        const publicJWK = {
            e: 'AQAB',
            ext: true,
            kty: 'RSA',
            n: publicKeyString
        };

        const verificationKey = await crypto.subtle.importKey(
            'jwk',
            publicJWK,
            {
                name: 'RSA-PSS',
                hash: 'SHA-256'
            },
            false,
            ['verify']
        );

        // Verify the signature matches the hash of the signed data
        const isValid = await crypto.subtle.verify(
            { name: 'RSA-PSS', saltLength: 32 },
            verificationKey,
            signature,
            hash
        );

        if (!isValid) {
            console.error('Signature validation failed: signature does not match the provided data');
        } else {
            console.log('Signature validation successful');
        }

        return isValid;
    } catch (error) {
        console.error('Error validating signature:', error);
        return false;
    }
}

app.post('/connect-wallet', async (c) => {
    const { address, pkey, signature } = await c.req.json()
    const token = c.req.header("Authorization")
    const bearerToken = (token?.split(" ")[1])?.trim()

    if (!bearerToken) {
        return c.json({ error: "No bearer token" }, 400)
    }

    if (!address || !pkey || !signature) {
        return c.json({ error: "Missing required fields: address, pkey, signature" }, 400)
    }

    // verify signature is signed by address
    const verified = await validateSignature(address, pkey, signature)

    if (!verified) {
        return c.json({ error: "Invalid signature" }, 400)
    }

    // add record to pocketbase connected_wallets collection
    // the record should be created using the auth users id
    const userClient = new Pocketbase(pbUrl)
    userClient.authStore.save(bearerToken!, null)

    let user;
    try {
        user = await userClient.collection("users").authRefresh()
    } catch (error) {
        console.error('Auth refresh failed:', error)
        return c.json({ error: "Token is expired or invalid. Please log in again." }, 401)
    }

    const userId = user.record.id

    let impersonatedClient;
    try {
        impersonatedClient = await pb.collection("users").impersonate(userId, 5 * 60)
    } catch (error) {
        console.error('User impersonation failed:', error)
        return c.json({ error: "Failed to authenticate user. Please try again." }, 500)
    }

    try {
        const res = await impersonatedClient.collection('connected_wallets').create({ address, public_key: pkey })
        console.log(res)
        return c.json({ success: true }, 200)
    } catch (e) {
        console.log(e)
        return c.json({ error: (e as any).message + ". Make sure you dont already have the same wallet connected" }, (e as any).status)
    }

})

app.get("/check-bot/:guildId", async (c) => {

    // get the guild id from the url
    const guildId = c.req.param("guildId")

    // get the bot token from the env
    const botToken = process.env.BOT_TOKEN

    // return true if the bot is in the guild
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}`, {
        headers: {
            Authorization: `Bot ${botToken}`
        }
    })

    return c.json({ exists: res.status === 200 }, 200)
})

console.log("Backend started")

export default {
    port: 8091,
    fetch: app.fetch,
}