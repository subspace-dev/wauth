import PocketBase, { type RecordAuthResponse, type RecordModel } from "pocketbase"
import Arweave from "arweave"
import type { GatewayConfig, PermissionType } from "arconnect";
import type { Tag } from "arweave/web/lib/transaction";
import Transaction from "arweave/web/lib/transaction";
import type { SignatureOptions } from "arweave/web/lib/crypto/crypto-interface";
import { type DataItem as ArConnectDataItem } from "arconnect";
import { DataItem } from "@dha-team/arbundles";
import axios from "axios";
import base64url from "base64url";
import { WAUTH_VERSION } from "./version";
import { createModal, createModalContainer } from "./modal-helper";
import { dryrun } from "@permaweb/aoconnect";


export enum WAuthProviders {
    Google = "google",
    Github = "github",
    Discord = "discord",
    X = "twitter"
}

export enum WalletActions {
    SIGN = "sign",
    ENCRYPT = "encrypt",
    DECRYPT = "decrypt",
    DISPATCH = "dispatch",
    SIGN_DATA_ITEM = "signDataItem",
    SIGNATURE = "signature"
}

type ModalTypes = "confirm-tx" | "password-new" | "password-existing"
export type { ModalTypes }

type ModalPayload = {
    transaction?: Transaction
    dataItem?: ArConnectDataItem
}
export type { ModalPayload }

type ModalResult = {
    proceed: boolean,
    password?: string
}
export type { ModalResult }

export class WauthSigner {
    private wauth: WAuth;
    public publicKey: Buffer;
    public ownerLength = 512;
    public signatureLength = 512;
    public signatureType = 1;

    constructor(wauth: WAuth) {
        console.log("[WauthSigner] Initializing with wauth instance", { hasWauth: !!wauth });
        this.wauth = wauth;
        // Initialize publicKey as empty buffer, will be set in setPublicKey
        this.publicKey = Buffer.alloc(0);
        // Immediately set the public key
        this.setPublicKey().catch(error => {
            console.error("[WauthSigner] Failed to set initial public key:", error);
            throw error;
        });
    }

    async setPublicKey() {
        try {
            console.log("[WauthSigner] Setting public key...");
            const arOwner = await this.wauth.getActivePublicKey();
            console.log("[WauthSigner] Got active public key:", arOwner);
            this.publicKey = base64url.toBuffer(arOwner);
            if (this.publicKey.length !== this.ownerLength) {
                throw new Error(`Public key length mismatch. Expected ${this.ownerLength} bytes but got ${this.publicKey.length} bytes`);
            }
            console.log("[WauthSigner] Public key set successfully:", {
                publicKeyLength: this.publicKey.length,
                publicKeyType: typeof this.publicKey
            });
        } catch (error) {
            console.error("[WauthSigner] Failed to set public key:", error);
            throw error;
        }
    }

    async sign(message: Uint8Array): Promise<Uint8Array> {
        try {
            console.log("[WauthSigner] Starting sign operation", {
                messageLength: message.length,
                hasPublicKey: this.publicKey.length > 0,
                publicKeyLength: this.publicKey.length
            });

            if (!this.publicKey.length || this.publicKey.length !== this.ownerLength) {
                console.log("[WauthSigner] Public key not set or invalid length, fetching...");
                await this.setPublicKey();
            }

            console.log("[WauthSigner] Calling wauth.signature...");
            const signature = await this.wauth.signature(message);
            console.log("[WauthSigner] Got raw signature:", {
                signatureType: typeof signature,
                signatureKeys: Object.keys(signature)
            });

            const buf = new Uint8Array(Object.values(signature).map((v) => +v));
            console.log("[WauthSigner] Converted signature to Uint8Array:", {
                bufferLength: buf.length,
                expectedLength: this.signatureLength
            });

            if (buf.length !== this.signatureLength) {
                throw new Error(`Signature length mismatch. Expected ${this.signatureLength} bytes but got ${buf.length} bytes`);
            }

            return buf;
        } catch (error) {
            console.error("[WauthSigner] Sign operation failed:", error);
            throw error;
        }
    }

    static async verify(pk: string | Buffer, message: Uint8Array, signature: Uint8Array): Promise<boolean> {
        try {
            console.log("[WauthSigner] Starting verify operation", {
                pkType: typeof pk,
                isBuffer: Buffer.isBuffer(pk),
                messageLength: message.length,
                signatureLength: signature.length
            });

            // Convert Buffer to string if needed
            const publicKeyString = Buffer.isBuffer(pk) ? pk.toString() : pk;
            console.log("[WauthSigner] Converted public key to string:", {
                publicKeyLength: publicKeyString.length
            });

            // Import the public key for verification
            const publicJWK: JsonWebKey = {
                e: "AQAB",
                ext: true,
                kty: "RSA",
                n: publicKeyString
            };
            console.log("[WauthSigner] Created JWK:", {
                hasE: !!publicJWK.e,
                hasN: !!publicJWK.n,
                kty: publicJWK.kty
            });

            console.log("[WauthSigner] Importing public key...");
            // Import public key for verification
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
            console.log("[WauthSigner] Public key imported successfully");

            // Verify the signature
            console.log("[WauthSigner] Verifying signature...");
            const result = await crypto.subtle.verify(
                { name: "RSA-PSS", saltLength: 32 },
                verificationKey,
                signature,
                message
            );
            console.log("[WauthSigner] Verification result:", result);

            return result;
        } catch (error: any) {
            console.error("[WauthSigner] Verify operation failed:", {
                error,
                errorMessage: error?.message || "Unknown error",
                errorStack: error?.stack || "No stack trace available"
            });
            return false;
        }
    }
}

async function getTokenDetails(token: string) {
    const res = await dryrun({
        process: token,
        tags: [{ name: "Action", value: "Info" }]
    })
    if (res.Messages.length < 1) throw new Error("No info message found")

    const msg = res.Messages[1]
    const tags = msg.Tags
    // transform tags {name,value}[] to {name:value}
    const tagsObj = tags.reduce((acc: any, tag: any) => {
        acc[tag.name] = tag.value
        return acc
    }, {})

    return tagsObj
}

export class WAuth {
    static devUrl = "http://localhost:8090"
    static devBackendUrl = "http://localhost:8091"
    static prodUrl = "https://wauth.arnode.asia"
    static prodBackendUrl = "https://wauth-backend.arnode.asia"

    private pb: PocketBase;
    private authData: RecordAuthResponse<RecordModel> | null;
    private wallet: RecordModel | null;
    private authRecord: RecordModel | null;
    private backendUrl: string;
    public static version: string = WAUTH_VERSION;
    public version: string = WAuth.version;

    private authDataListeners: ((data: any) => void)[] = [];


    constructor({ dev = false, url, backendUrl }: { dev?: boolean, url?: string, backendUrl?: string }) {
        if (dev == undefined) {
            dev = process.env.NODE_ENV === "development"
        }
        this.pb = new PocketBase(url || (dev ? WAuth.devUrl : WAuth.prodUrl));
        this.backendUrl = backendUrl || (dev ? WAuth.devBackendUrl : WAuth.prodBackendUrl);
        this.authData = null;
        this.wallet = null;
        this.authRecord = null;


        this.pb.authStore.onChange(async (token, record) => {
            if (!record || !localStorage.getItem("pocketbase_auth")) {
                return
            }
            console.log("[wauth] auth updated", record?.email)
            this.authRecord = record;
            this.authData = this.getAuthData();
            this.wallet = await this.getWallet();
            this.authDataListeners.forEach(listener => listener(this.getAuthData()));
        }, true)
    }

    onAuthDataChange(callback: (data: any) => void): void {
        this.authDataListeners.push(callback);
        if (this.authData) {
            callback(this.authData);
        }
    }

    private async runAction(action: WalletActions, payload: any = {}) {
        // make sure the user is logged in
        if (!this.isLoggedIn()) throw new Error("[wauth] Not logged in")

        // make sure the wallet is connected
        if (!this.wallet) this.wallet = await this.getWallet()
        if (!this.wallet) throw new Error("[wauth] No wallet found")

        // Helper to show modal and await result
        const showModal = (type: ModalTypes, payload: ModalPayload): Promise<ModalResult> => {
            return new Promise((resolve) => {
                this.createModal(type, payload, (result) => {
                    resolve(result)
                })
            })
        }

        switch (action) {
            case WalletActions.SIGN:
                // check for Action=Transfer Tag and ask user for approval
                if (payload && payload.transaction && payload.transaction.tags) {
                    const actionTag = payload.transaction.tags.find((tag: Tag) => tag.name === "Action");
                    if (actionTag?.value === "Transfer") {
                        // Show modal and await user confirmation
                        const result = await showModal("confirm-tx", { transaction: payload.transaction })
                        if (!result.proceed) {
                            throw new Error("[wauth] Transaction cancelled by user")
                        }
                    }
                }
                break;
            case WalletActions.SIGN_DATA_ITEM:
                // check for Action=Transfer Tag and ask user for approval
                if (payload && payload.dataItem && payload.dataItem.tags) {
                    const actionTag = payload.dataItem.tags.find((tag: Tag) => tag.name === "Action");
                    if (actionTag?.value === "Transfer") {
                        // Show modal and await user confirmation
                        const result = await showModal("confirm-tx", { dataItem: payload.dataItem })
                        if (!result.proceed) {
                            throw new Error("[wauth] Transaction cancelled by user")
                        }
                    }
                }
                break;
        }

        // send the action and payload to the backend
        const res = await axios.post(`${this.backendUrl}/wallet-action`, { action, payload }, {
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Authorization": `Bearer ${this.getAuthToken()}`
            },
            responseType: 'json'  // This tells axios to return raw binary data
        })
        return res.data
    }

    // There can be 2 types of modals:
    // 1. Transaction verification- for when the user is about to transfer tokens and needs user confirmation,
    //    this modal would have info text, amount to be transfered, and proceed/cancel buttons
    // 2. Password input modal- either when user is connecting for the first time (ask for password and confirm password)
    //    or when they already have an account and just logging in (ask for password),
    //    this will be send in an encrypted way to the backend for use with decoding JWK
    public async createModal(type: ModalTypes, payload: ModalPayload = {}, callback: (result: ModalResult) => void) {
        // if type is confirm-tx, check payload.transaction or payload.dataItem and tell the user that some tokens are being transferred and its details, and ask for confirmation
        // if type is password-new, ask for password and confirm password
        // if type is password-existing, ask for password and return it
        // based on the users actions, call the callback with the result

        switch (type) {
            case "confirm-tx":
                // we have the tags and target in data
                // assuming target is a token process id, fetch its details by sending Info message and forward its data to the modal
                const data = payload.transaction || payload.dataItem

                // create a modal with the payload
                break;
            case "password-new":
                break;
            case "password-existing":
        }

        const container = createModalContainer()
        const modal = createModal(type, payload, (result) => {
            // Remove the modal container from the DOM after callback
            if (container.parentNode) {
                container.parentNode.removeChild(container)
            }
            callback(result)
        })
        container.appendChild(modal)

        document.body.appendChild(container)
    }

    public async connect({ provider, scopes }: { provider: WAuthProviders, scopes?: string[] }) {
        if (!Object.values(WAuthProviders).includes(provider)) throw new Error(`Invalid provider: ${provider}. Valid providers are: ${Object.values(WAuthProviders).join(", ")}`)

        try {
            this.authData = await this.pb.collection("users").authWithOAuth2({ provider, scopes })
            this.authDataListeners.forEach(listener => listener(this.getAuthData()));
        } catch (e) {
            console.error("[wauth] error logging in,", e)
            return null;
        }

        if (!this.isLoggedIn()) return null;

        try {
            this.wallet = await this.getWallet()
            if (!this.wallet) {
                console.log("[wauth] no wallet found, creating one")
                await this.pb.collection("wallets").create({})
                this.wallet = await this.getWallet()
                if (!this.wallet) throw new Error("Failed to create wallet")
                console.log("[wauth] wallet created", this.wallet)
            }
        } catch (e) {
            console.error("[wauth]", e)
        }

        return this.getAuthData();
    }


    public async addConnectedWallet(address: string, pkey: string, signature: string) {
        if (!this.isLoggedIn()) throw new Error("Not logged in")
        if (!this.wallet) this.wallet = await this.getWallet()
        if (!this.wallet) throw new Error("No wallet found")

        const token = this.getAuthToken()
        if (!token) throw new Error("No auth token")

        const res = await fetch(`${this.backendUrl}/connect-wallet`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ address, pkey, signature })
        })
        const data = await res.json()
        console.log(data)
        return data
    }

    public isLoggedIn() {
        return this.pb.authStore.isValid;
    }

    public async getActiveAddress(): Promise<string> {
        if (!this.isLoggedIn()) throw new Error("Not logged in")
        if (!this.wallet) this.wallet = await this.getWallet()
        return this.wallet?.address || ""
    }

    public async getActivePublicKey(): Promise<string> {
        if (!this.isLoggedIn()) throw new Error("Not logged in")
        if (!this.wallet) this.wallet = await this.getWallet()
        return this.wallet?.public_key || ""
    }

    public async getPermissions(): Promise<PermissionType[]> {
        return ["ACCESS_ADDRESS" as PermissionType, "SIGN_TRANSACTION" as PermissionType]
    }

    public async getWalletNames() {
        return { [await this.getActiveAddress()]: "WAuth" }
    }

    public async getArweaveConfig(): Promise<GatewayConfig> {
        // TODO: make this configurable
        const config: GatewayConfig = {
            host: "arweave.net",
            port: 443,
            protocol: "https",
        };

        return config
    }

    public getAuthData() {
        if (!this.isLoggedIn()) return null;
        return this.authData
    }

    public getAuthToken(): string | null {
        if (!this.isLoggedIn()) return null;
        if (!this.pb.authStore.token) return null;
        return this.pb.authStore.token
    }

    public async getWallet() {
        if (!this.isLoggedIn()) return null;

        try {
            this.wallet = await this.pb.collection("wallets").getFirstListItem(`user.id = "${this.pb.authStore.record?.id}"`)
            console.log("[wauth] wallet", this.wallet?.address)
            if (!this.wallet) {
                console.log("[wauth] no wallet found, creating one")

                await this.pb.collection("wallets").create({})
                this.wallet = await this.pb.collection("wallets").getFirstListItem(`user.id = "${this.pb.authStore.record?.id}"`)

                if (!this.wallet) throw new Error("Failed to create wallet")
                console.log("[wauth] wallet created", this.wallet)
            }

            return this.wallet;
        } catch (e) {
            if (`${e}`.includes("autocancelled")) return null
            console.info("[wauth] error fetching wallet", e)
            return null;
        }
    }

    public async getConnectedWallets() {
        const res = await this.pb.collection("connected_wallets").getFullList({
            filter: `user.id = "${this.pb.authStore.record?.id}"`
        })
        console.log("[wauth] connected wallets", res)
        return res
    }

    public async removeConnectedWallet(walletId: string) {
        if (!this.isLoggedIn()) throw new Error("Not logged in")

        try {
            // First verify the wallet belongs to the current user
            const wallet = await this.pb.collection("connected_wallets").getOne(walletId, {
                filter: `user.id = "${this.pb.authStore.record?.id}"`
            })

            if (!wallet) {
                throw new Error("Wallet not found or not owned by current user")
            }

            // Delete the wallet record
            await this.pb.collection("connected_wallets").delete(walletId)
            console.log("[wauth] removed connected wallet", walletId)

            return { success: true, walletId }
        } catch (error) {
            console.error("[wauth] error removing connected wallet", error)
            throw error
        }
    }

    getAuthRecord() {
        if (!this.isLoggedIn()) return null;
        return this.authRecord
    }

    pocketbase() {
        return this.pb;
    }

    public async sign(transaction: Transaction, options?: SignatureOptions) {
        if (options) console.warn("[wauth] Signature options are not supported yet")

        return await this.runAction(WalletActions.SIGN, { transaction: transaction.toJSON() })
    }

    public async signature(data: Uint8Array, algorithm?: AlgorithmIdentifier | RsaPssParams | EcdsaParams): Promise<Uint8Array> {
        if (algorithm) {
            console.warn("[wauth] Signature algorithm is not supported and Rsa4096Pss will be used by default")
        }
        return Object.values(await this.runAction(WalletActions.SIGNATURE, { data })) as any
    }

    public async signAns104(dataItem: ArConnectDataItem): Promise<{ id: string, raw: ArrayBuffer }> {
        return await this.runAction(WalletActions.SIGN_DATA_ITEM, { dataItem })
    }

    public async signDataItem(dataItem: ArConnectDataItem): Promise<ArrayBuffer> {
        return (await this.runAction(WalletActions.SIGN_DATA_ITEM, { dataItem })).raw
    }

    public getWauthSigner(): WauthSigner {
        return new WauthSigner(this)
    }

    public getAoSigner() {
        if (!this.isLoggedIn()) throw new Error("Not logged in")
        if (!this.wallet) throw new Error("No wallet found")

        return async (create: any, createDataItem: any) => {
            const { data, tags, target, anchor } = await create({ alg: 'rsa-v1_5-sha256', passthrough: true });
            const signedDataItem = await this.signAns104({ data, tags, target, anchor })
            const dataItem = new DataItem(Buffer.from(signedDataItem.raw))
            return { id: dataItem.id, raw: dataItem.getRaw() }
        }
    }

    public logout() {
        this.authData = null;
        this.wallet = null;
        this.authRecord = null;
        this.pb.authStore.clear();
    }
}