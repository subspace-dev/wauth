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
const ar = Arweave.init({
    host: "arweave.net",
    port: 443,
    protocol: "https"
})

// Generate RSA key pair for password encryption/decryption
let serverKeyPair: CryptoKeyPair;
let serverPublicKeyJWK: JsonWebKey;

async function initializeServerKeys() {
    console.log("Generating server RSA key pair for password encryption...")
    serverKeyPair = await crypto.subtle.generateKey(
        {
            name: "RSA-OAEP",
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: "SHA-256",
        },
        true,
        ["encrypt", "decrypt"]
    );

    serverPublicKeyJWK = await crypto.subtle.exportKey("jwk", serverKeyPair.publicKey);
    console.log("Server RSA key pair generated successfully");
}

// Initialize keys on startup
await initializeServerKeys();

// Enhanced nonce tracking for replay attack prevention
const usedNonces = new Map<string, number>(); // nonce -> timestamp
const NONCE_EXPIRY_MS = 1 * 60 * 1000; // 1 minutes (restored to original secure value)
const CLEANUP_INTERVAL_MS = 1 * 60 * 1000; // Clean up every 1 minute

function cleanupExpiredNonces() {
    const now = Date.now();
    let cleanedCount = 0;

    // Remove only expired nonces
    for (const [nonce, timestamp] of usedNonces.entries()) {
        if (now - timestamp > NONCE_EXPIRY_MS) {
            usedNonces.delete(nonce);
            cleanedCount++;
        }
    }

    if (cleanedCount > 0) {
        console.log(`[Security] Cleaned up ${cleanedCount} expired nonces. Active nonces: ${usedNonces.size}`);
    }

    // Schedule next cleanup
    setTimeout(cleanupExpiredNonces, CLEANUP_INTERVAL_MS);
}

// Start the cleanup process
cleanupExpiredNonces();

const app = new Hono()
app.use(cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'encrypted-password', 'encrypted-confirm-password']
}))

// delay 2 seconds to let pocketbase start
await new Promise(resolve => setTimeout(resolve, 2000))

const pbUrl = 'http://localhost:8090'
const pb = new Pocketbase(pbUrl)
pb.autoCancellation(true)

// adming auth pocketbase
await pb.collection("_superusers").authWithPassword(process.env.SU_EMAIL!, process.env.SU_PASS!, {
    noNotify: true,
    // This will trigger auto refresh or auto reauthentication in case
    // the token has expired or is going to expire in the next 30 minutes.
    autoRefreshThreshold: 30 * 60
})


app.get('/', (c) => {
    return c.json({
        message: "Backend OK!",
        timestamp: new Date().toISOString()
    });
})

// Endpoint to serve public key for password encryption
app.get('/public-key', (c) => {
    if (!serverPublicKeyJWK) {
        return c.json({ error: "Server not properly initialized" }, 500);
    }
    return c.json({ publicKey: serverPublicKeyJWK })
})

// Utility functions for password and JWK encryption/decryption
async function decryptPassword(encryptedData: string): Promise<{ password: string, nonce: string, timestamp: number }> {
    try {
        const encryptedBuffer = Buffer.from(encryptedData, 'base64');

        const decryptedBuffer = await crypto.subtle.decrypt(
            { name: "RSA-OAEP" },
            serverKeyPair.privateKey,
            encryptedBuffer
        );

        const decryptedData = JSON.parse(new TextDecoder().decode(decryptedBuffer));

        // Validate timestamp (must be within 5 minutes)
        const now = Date.now();
        const age = now - decryptedData.timestamp;

        if (age > NONCE_EXPIRY_MS) {
            throw new Error(`Request expired - age: ${age}ms, limit: ${NONCE_EXPIRY_MS}ms`);
        }

        // Check for nonce reuse
        if (usedNonces.has(decryptedData.nonce)) {
            throw new Error("Nonce already used");
        }

        // Mark nonce as used with its timestamp
        usedNonces.set(decryptedData.nonce, decryptedData.timestamp);

        return decryptedData;
    } catch (error) {
        console.error("Password decryption failed:", error instanceof Error ? error.message : error);
        throw new Error("Invalid encrypted password: " + (error instanceof Error ? error.message : error));
    }
}

async function encryptJWK(jwk: any, password: string): Promise<{ encryptedJWK: string, salt: string }> {
    try {
        // Generate a random salt
        const salt = crypto.randomBytes(32).toString('hex');

        // Derive key from password using PBKDF2
        const key = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(password),
            'PBKDF2',
            false,
            ['deriveKey']
        );

        const derivedKey = await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: Buffer.from(salt, 'hex'),
                iterations: 100000,
                hash: 'SHA-256'
            },
            key,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt']
        );

        // Generate IV for AES-GCM
        const iv = crypto.randomBytes(12);

        // Encrypt the JWK (excluding the public key 'n' field)
        const jwkToEncrypt = { ...jwk };
        const publicKey = jwkToEncrypt.n; // Save public key separately
        delete jwkToEncrypt.n; // Remove from encryption

        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            derivedKey,
            new TextEncoder().encode(JSON.stringify(jwkToEncrypt))
        );

        // Combine IV and encrypted data
        const combined = Buffer.concat([iv, Buffer.from(encrypted)]);

        return {
            encryptedJWK: combined.toString('base64'),
            salt
        };
    } catch (error) {
        console.error("JWK encryption failed:", error);
        throw new Error("Failed to encrypt JWK");
    }
}

async function decryptJWK(encryptedJWK: string, salt: string, password: string, publicKey: string): Promise<any> {
    try {
        // Derive key from password using PBKDF2
        const key = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(password),
            'PBKDF2',
            false,
            ['deriveKey']
        );

        const derivedKey = await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: Buffer.from(salt, 'hex'),
                iterations: 100000,
                hash: 'SHA-256'
            },
            key,
            { name: 'AES-GCM', length: 256 },
            false,
            ['decrypt']
        );

        // Extract IV and encrypted data
        const combined = Buffer.from(encryptedJWK, 'base64');
        const iv = combined.slice(0, 12);
        const encrypted = combined.slice(12);

        // Decrypt the JWK
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            derivedKey,
            encrypted
        );

        const jwkData = JSON.parse(new TextDecoder().decode(decrypted));

        // Add back the public key
        jwkData.n = publicKey;

        return jwkData;
    } catch (error) {
        console.error("JWK decryption failed:", error);
        throw new Error("Failed to decrypt JWK - invalid password");
    }
}

app.get('/jwk', async (c) => {
    const encryptedPassword = c.req.header("encrypted-password")
    const encryptedConfirmPassword = c.req.header("encrypted-confirm-password")

    if (!encryptedPassword || !encryptedConfirmPassword) {
        return c.json({ error: "Missing required fields: encrypted-password, encrypted-confirm-password" }, 400)
    }

    try {
        // Decrypt both passwords
        const { password } = await decryptPassword(encryptedPassword)
        const { password: confirmPassword } = await decryptPassword(encryptedConfirmPassword)

        // Verify passwords match
        if (password !== confirmPassword) {
            return c.json({ error: "Passwords do not match" }, 400)
        }

        // Generate new JWK
        const jwk = await ar.wallets.generate()
        const publicKey = jwk.n
        const address = await ar.wallets.jwkToAddress(jwk)

        // Encrypt the JWK with the password
        const { encryptedJWK, salt } = await encryptJWK(jwk, password)

        return c.json({
            encryptedJWK,
            salt,
            address,
            publicKey
        })
    } catch (error: any) {
        console.error("JWK generation error:", error)
        return c.json({ error: error.message || "Failed to generate wallet" }, 400)
    }
})

// New endpoint for creating wallets without password encryption
app.get('/jwk-skip-password', async (c) => {
    try {
        // Generate new JWK
        const jwk = await ar.wallets.generate()
        const publicKey = jwk.n
        const address = await ar.wallets.jwkToAddress(jwk)

        return c.json({
            regular_jwk: jwk,
            address,
            publicKey
        })
    } catch (error: any) {
        console.error("JWK generation error (skip password):", error)
        return c.json({ error: error.message || "Failed to generate wallet" }, 400)
    }
})

// Endpoint to verify if a password can decrypt user's JWK
app.post('/verify-password', async (c) => {
    const encryptedPassword = c.req.header("encrypted-password");
    const bearerToken = c.req.header("Authorization")?.replace("Bearer ", "");

    if (!encryptedPassword) {
        return c.json({ error: "Missing encrypted-password header" }, 400);
    }

    if (!bearerToken) {
        return c.json({ error: "Missing authentication token" }, 401);
    }

    try {
        // Decrypt the password
        const { password } = await decryptPassword(encryptedPassword);

        // Validate the token and find out which user it belongs to
        const userClient = new Pocketbase(pbUrl);
        userClient.authStore.save(bearerToken, null);
        const user = await userClient.collection("users").authRefresh();
        const userId = user.record.id;

        // Get the user's wallet from the database
        const walletResult = await pb.collection("wallets").getList(1, 1, {
            filter: `user = "${userId}"`
        });

        if (walletResult.totalItems === 0) {
            return c.json({ error: "No wallet found" }, 400);
        }

        const walletRow = walletResult.items[0];
        const encryptedJWK = walletRow.encrypted_jwk;
        const salt = walletRow.salt;
        const publicKey = walletRow.public_key;

        if (!encryptedJWK || !salt || !publicKey) {
            return c.json({ error: "Invalid wallet data" }, 400);
        }

        // Try to decrypt the JWK with the provided password
        await decryptJWK(encryptedJWK, salt, password, publicKey);

        // If we get here, the password is correct
        return c.json({ valid: true });
    } catch (error: any) {
        // Password is incorrect or other error occurred
        return c.json({ valid: false, error: error.message || "Password verification failed" }, 400);
    }
});

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
        return c.json({ success: true }, 200)
    } catch (e) {
        console.error(e)
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
    const { action, payload, encryptedPassword } = await c.req.json()
    const token = c.req.header("Authorization")
    const bearerToken = (token?.split(" ")[1])?.trim()

    if (!bearerToken) {
        return c.json({ error: "No bearer token" }, 400)
    }

    try {
        // Decrypt the password if provided
        let password = null
        if (encryptedPassword) {
            const decrypted = await decryptPassword(encryptedPassword)
            password = decrypted.password
        }

        // validate the token and find out which user it belongs to
        const userClient = new Pocketbase(pbUrl)
        userClient.authStore.save(bearerToken!, null)
        const user = await userClient.collection("users").authRefresh()
        const userId = user.record.id

        // then get the users wallet from the database
        const walletResult = await pb.collection("wallets").getList(1, 1, {
            filter: `user = "${userId}"`
        });

        if (walletResult.totalItems === 0) {
            return c.json({ error: "No wallet found" }, 400)
        }

        const walletRow = walletResult.items[0];
        const encryptedJWK = walletRow.encrypted_jwk
        const regularJWK = walletRow.regular_jwk
        const salt = walletRow.salt
        const publicKey = walletRow.public_key
        const isEncrypted = walletRow.encrypted

        let jwk
        if (!isEncrypted && regularJWK) {
            // Use regular JWK (no password required)
            jwk = regularJWK
        } else if (isEncrypted && encryptedJWK && salt && publicKey) {
            // Decrypt the JWK using the password
            if (!password) {
                return c.json({ error: "Password required for encrypted wallet" }, 400)
            }
            jwk = await decryptJWK(encryptedJWK, salt, password, publicKey)
        } else {
            return c.json({ error: "Invalid wallet data" }, 400)
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

                const createdDataItem = createData(dataItem.data, signer, { tags: dataItem.tags, anchor: dataItem.anchor, target: dataItem.target })
                await createdDataItem.sign(signer)

                const isValid = await createdDataItem.isValid()

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
    } catch (error: any) {
        console.error("Wallet action error:", error)
        return c.json({ error: error.message || "Wallet action failed" }, 400)
    }
})

console.log("Backend started")

export default {
    port: 8091,
    fetch: app.fetch,
}