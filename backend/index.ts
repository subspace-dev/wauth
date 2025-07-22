import { Hono } from 'hono'
import Arweave from 'arweave/web'
import Pocketbase from 'pocketbase'
import dotenv from 'dotenv'
import { cors } from 'hono/cors'
import crypto from "node:crypto"
import Transaction from 'arweave/node/lib/transaction'
import { createData, DataItem, type DataItemCreateOptions } from "@dha-team/arbundles"
import { ArweaveSigner } from '@dha-team/arbundles'
import { connect, createDataItemSigner } from "@permaweb/aoconnect"
import fs from "fs"
import { createAoSigner } from "@ar.io/sdk"

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

// 1. validate the publicKeyString is the public key of the address
// 2. validate the signature is signed by the public key
async function validateSignature(address: string, publicKeyString: string, signatureBase64String: string): Promise<boolean> {
    try {
        // Convert signature from base64 to Uint8Array
        const signature = new Uint8Array(Buffer.from(signatureBase64String, 'base64'));

        // Recreate the exact data that was signed
        const data = new TextEncoder().encode(JSON.stringify({ address, pkey: publicKeyString }));

        // Hash the message using SHA-256 (same as Wander does internally)
        const hash = await crypto.subtle.digest("SHA-256", data);

        // Import the public key for verification
        const publicJWK: JsonWebKey = {
            e: "AQAB",
            ext: true,
            kty: "RSA",
            n: publicKeyString
        };

        // Import public key for verification - exactly as in docs
        const verificationKey = await crypto.subtle.importKey(
            "jwk",
            publicJWK,
            {
                name: "RSA-PSS",
                hash: "SHA-256"
            },
            false,
            ["verify"]
        );

        // Verify the signature by matching it with the hash - exactly as in docs
        const isValid = await crypto.subtle.verify(
            { name: "RSA-PSS", saltLength: 32 },
            verificationKey,
            signature,
            hash
        );

        if (!isValid) {
            console.error('Signature validation failed');
        } else {
            console.log('Signature validation successful');
        }

        return isValid;
    } catch (error) {
        console.error('Error in validation process:', error);
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
        // console.log(res)
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

export enum WalletActions {
    SIGN = "sign",
    ENCRYPT = "encrypt",
    DECRYPT = "decrypt",
    DISPATCH = "dispatch",
    SIGN_DATA_ITEM = "signDataItem",
    SIGNATURE = "signature"
}

app.post('/wallet-action', async (c) => {
    const { action, payload } = await c.req.json()
    const token = c.req.header("Authorization")
    const bearerToken = (token?.split(" ")[1])?.trim()

    if (!bearerToken) {
        return c.json({ error: "No bearer token" }, 400)
    }

    // validate the token and find out which user it belongs to
    const userClient = new Pocketbase(pbUrl)
    userClient.authStore.save(bearerToken!, null)
    const user = await userClient.collection("users").authRefresh()
    const userId = user.record.id

    // then get the users wallet jwk through the superuser client
    const walletRow = await pb.collection("wallets").getFirstListItem(`user = "${userId}"`)
    if (!walletRow) {
        return c.json({ error: "No wallet found" }, 400)
    }

    const jwk = walletRow.jwk
    if (!jwk) {
        return c.json({ error: "No JWK found" }, 400)
    }

    const signer = new ArweaveSigner(jwk)

    switch (action) {
        case WalletActions.SIGN:
            const txPayload = payload.transaction
            const tx = ar.transactions.fromRaw(txPayload)
            await ar.transactions.sign(tx, jwk)
            return c.json({ ...tx.toJSON() }, 200)
            // await ar.transactions.sign(transaction, jwk)
            // return c.json({ ...transaction }, 200)
            break;
        case WalletActions.ENCRYPT:
            break;
        case WalletActions.DECRYPT:
            break;
        case WalletActions.DISPATCH:
            break;
        case WalletActions.SIGN_DATA_ITEM:
            const dataItem = payload.dataItem
            // console.log("dataItem", dataItem)

            const createdDataItem = createData(dataItem.data, signer, { tags: dataItem.tags, anchor: dataItem.anchor, target: dataItem.target })
            await createdDataItem.sign(signer)

            // console.log(createdDataItem.byteLength)

            const isValid = await createdDataItem.isValid()
            // console.log("isValid", isValid)

            if (!isValid) {
                return c.json({ error: "Invalid data item" }, 400)
            }

            function decimalAsciiToString(decimals: number[]) {
                return decimals.map(d => String.fromCharCode(d)).join('')
            }

            const id = createdDataItem.id
            const raw = createdDataItem.getRaw()
            const rawIntArray = Array.from(raw)
            const data = decimalAsciiToString(rawIntArray)

            // console.log("data", data)

            const newdataitem = new DataItem(raw)
            const valid = await newdataitem.isValid()
            if (!valid) {
                return c.json({ error: "Invalid data item" }, 400)
            }


            return c.json({ id: newdataitem.id, raw: newdataitem.getRaw() }, 200)
            break;
        case WalletActions.SIGNATURE:
            const uint8array = Buffer.from(Object.values(payload.data))
            const signature = await signer.sign(uint8array)

            return c.json({ ...signature }, 200)
            break;
        default:
            return c.json({ error: "Invalid action" }, 400)
    }

    return c.json({ success: true }, 200)
})


app.post('/raw-data-item', async (c) => {
    const raw = await c.req.arrayBuffer()
    const dataItem = new DataItem(Buffer.from(raw))
    const isValid = await dataItem.isValid()
    return c.json({ isValid }, 200)
})

console.log("Backend started")

export default {
    port: 8091,
    fetch: app.fetch,
}