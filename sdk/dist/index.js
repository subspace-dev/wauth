import PocketBase, {} from "pocketbase";
import Arweave from "arweave";
import Transaction from "arweave/web/lib/transaction";
import {} from "arconnect";
import { DataItem } from "@dha-team/arbundles";
import axios from "axios";
import base64url from "base64url";
import { WAUTH_VERSION } from "./version";
export var WAuthProviders;
(function (WAuthProviders) {
    WAuthProviders["Google"] = "google";
    WAuthProviders["Github"] = "github";
    WAuthProviders["Discord"] = "discord";
    WAuthProviders["X"] = "twitter";
})(WAuthProviders || (WAuthProviders = {}));
export var WalletActions;
(function (WalletActions) {
    WalletActions["SIGN"] = "sign";
    WalletActions["ENCRYPT"] = "encrypt";
    WalletActions["DECRYPT"] = "decrypt";
    WalletActions["DISPATCH"] = "dispatch";
    WalletActions["SIGN_DATA_ITEM"] = "signDataItem";
    WalletActions["SIGNATURE"] = "signature";
})(WalletActions || (WalletActions = {}));
export class WauthSigner {
    wauth;
    publicKey;
    ownerLength = 512;
    signatureLength = 512;
    signatureType = 1;
    constructor(wauth) {
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
        }
        catch (error) {
            console.error("[WauthSigner] Failed to set public key:", error);
            throw error;
        }
    }
    async sign(message) {
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
        }
        catch (error) {
            console.error("[WauthSigner] Sign operation failed:", error);
            throw error;
        }
    }
    static async verify(pk, message, signature) {
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
            const publicJWK = {
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
            const verificationKey = await crypto.subtle.importKey("jwk", publicJWK, {
                name: "RSA-PSS",
                hash: "SHA-256"
            }, false, ["verify"]);
            console.log("[WauthSigner] Public key imported successfully");
            // Verify the signature
            console.log("[WauthSigner] Verifying signature...");
            const result = await crypto.subtle.verify({ name: "RSA-PSS", saltLength: 32 }, verificationKey, signature, message);
            console.log("[WauthSigner] Verification result:", result);
            return result;
        }
        catch (error) {
            console.error("[WauthSigner] Verify operation failed:", {
                error,
                errorMessage: error?.message || "Unknown error",
                errorStack: error?.stack || "No stack trace available"
            });
            return false;
        }
    }
}
export class WAuth {
    static devUrl = "http://localhost:8090";
    static devBackendUrl = "http://localhost:8091";
    static prodUrl = "https://wauth.arnode.asia";
    static prodBackendUrl = "https://wauth-backend.arnode.asia";
    pb;
    authData;
    wallet;
    authRecord;
    backendUrl;
    static version = WAUTH_VERSION;
    version = WAuth.version;
    authDataListeners = [];
    constructor({ dev = false, url, backendUrl }) {
        if (dev == undefined) {
            dev = process.env.NODE_ENV === "development";
        }
        this.pb = new PocketBase(url || (dev ? WAuth.devUrl : WAuth.prodUrl));
        this.backendUrl = backendUrl || (dev ? WAuth.devBackendUrl : WAuth.prodBackendUrl);
        this.authData = null;
        this.wallet = null;
        this.authRecord = null;
        this.pb.authStore.onChange(async (token, record) => {
            if (!record || !localStorage.getItem("pocketbase_auth")) {
                return;
            }
            console.log("[wauth] auth updated", record?.email);
            this.authRecord = record;
            this.authData = this.getAuthData();
            this.wallet = await this.getWallet();
            this.authDataListeners.forEach(listener => listener(this.getAuthData()));
        }, true);
    }
    onAuthDataChange(callback) {
        this.authDataListeners.push(callback);
        if (this.authData) {
            callback(this.authData);
        }
    }
    async runAction(action, payload = {}) {
        // make sure the user is logged in
        if (!this.isLoggedIn())
            throw new Error("[wauth] Not logged in");
        // make sure the wallet is connected
        if (!this.wallet)
            this.wallet = await this.getWallet();
        if (!this.wallet)
            throw new Error("[wauth] No wallet found");
        switch (action) {
            case WalletActions.SIGN:
                // check for Action=Transfer Tag and ask user for approval
                if (payload && payload.transaction && payload.transaction.tags) {
                    const actionTag = payload.transaction.tags.find((tag) => tag.name === "Action");
                    if (actionTag?.value === "Transfer") {
                        // ask user for approval before proceeding
                        // window confirm dialog
                        const confirmed = window.confirm(`Are you sure you want to proceed with this transaction?\n\n${JSON.stringify(payload)}`);
                        if (!confirmed) {
                            throw new Error("[wauth] Transaction cancelled by user");
                        }
                    }
                }
                break;
            case WalletActions.SIGN_DATA_ITEM:
                // check for Action=Transfer Tag and ask user for approval
                if (payload && payload.dataItem && payload.dataItem.tags) {
                    const actionTag = payload.dataItem.tags.find((tag) => tag.name === "Action");
                    if (actionTag?.value === "Transfer") {
                        // ask user for approval before proceeding
                        // window confirm dialog
                        const confirmed = window.confirm(`Are you sure you want to proceed with this transaction?\n\n${JSON.stringify(payload)}`);
                        if (!confirmed) {
                            throw new Error("[wauth] Transaction cancelled by user");
                        }
                    }
                }
                break;
        }
        // send the action and payload to the backend
        // const res = await fetch(`${this.backendUrl}/wallet-action`, {
        //     method: "POST",
        //     headers: {
        //         "Content-Type": "application/json",
        //         "Authorization": `Bearer ${this.getAuthToken()}`
        //     },
        //     body: JSON.stringify({ action, payload })
        // })
        // console.log("res headers", res.headers.entries())
        const res = await axios.post(`${this.backendUrl}/wallet-action`, { action, payload }, {
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Authorization": `Bearer ${this.getAuthToken()}`
            },
            responseType: 'json' // This tells axios to return raw binary data
        });
        return res.data;
    }
    async connect({ provider, scopes }) {
        if (!Object.values(WAuthProviders).includes(provider))
            throw new Error(`Invalid provider: ${provider}. Valid providers are: ${Object.values(WAuthProviders).join(", ")}`);
        try {
            this.authData = await this.pb.collection("users").authWithOAuth2({ provider, scopes });
            this.authDataListeners.forEach(listener => listener(this.getAuthData()));
        }
        catch (e) {
            console.error("[wauth] error logging in,", e);
            return null;
        }
        if (!this.isLoggedIn())
            return null;
        try {
            this.wallet = await this.getWallet();
            if (!this.wallet) {
                console.log("[wauth] no wallet found, creating one");
                await this.pb.collection("wallets").create({});
                this.wallet = await this.getWallet();
                if (!this.wallet)
                    throw new Error("Failed to create wallet");
                console.log("[wauth] wallet created", this.wallet);
            }
        }
        catch (e) {
            console.error("[wauth]", e);
        }
        return this.getAuthData();
    }
    async addConnectedWallet(address, pkey, signature) {
        if (!this.isLoggedIn())
            throw new Error("Not logged in");
        if (!this.wallet)
            this.wallet = await this.getWallet();
        if (!this.wallet)
            throw new Error("No wallet found");
        const token = this.getAuthToken();
        if (!token)
            throw new Error("No auth token");
        const res = await fetch(`${this.backendUrl}/connect-wallet`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ address, pkey, signature })
        });
        const data = await res.json();
        console.log(data);
        return data;
    }
    isLoggedIn() {
        return this.pb.authStore.isValid;
    }
    async getActiveAddress() {
        if (!this.isLoggedIn())
            throw new Error("Not logged in");
        if (!this.wallet)
            this.wallet = await this.getWallet();
        return this.wallet?.address || "";
    }
    async getActivePublicKey() {
        if (!this.isLoggedIn())
            throw new Error("Not logged in");
        if (!this.wallet)
            this.wallet = await this.getWallet();
        return this.wallet?.public_key || "";
    }
    async getPermissions() {
        return ["ACCESS_ADDRESS", "SIGN_TRANSACTION"];
    }
    async getWalletNames() {
        return { [await this.getActiveAddress()]: "WAuth" };
    }
    async getArweaveConfig() {
        // TODO: make this configurable
        const config = {
            host: "arweave.net",
            port: 443,
            protocol: "https",
        };
        return config;
    }
    getAuthData() {
        if (!this.isLoggedIn())
            return null;
        return this.authData;
    }
    getAuthToken() {
        if (!this.isLoggedIn())
            return null;
        if (!this.pb.authStore.token)
            return null;
        return this.pb.authStore.token;
    }
    async getWallet() {
        if (!this.isLoggedIn())
            return null;
        try {
            this.wallet = await this.pb.collection("wallets").getFirstListItem(`user.id = "${this.pb.authStore.record?.id}"`);
            console.log("[wauth] wallet", this.wallet?.address);
            if (!this.wallet) {
                console.log("[wauth] no wallet found, creating one");
                await this.pb.collection("wallets").create({});
                this.wallet = await this.pb.collection("wallets").getFirstListItem(`user.id = "${this.pb.authStore.record?.id}"`);
                if (!this.wallet)
                    throw new Error("Failed to create wallet");
                console.log("[wauth] wallet created", this.wallet);
            }
            return this.wallet;
        }
        catch (e) {
            if (`${e}`.includes("autocancelled"))
                return null;
            console.info("[wauth] error fetching wallet", e);
            return null;
        }
    }
    async getConnectedWallets() {
        const res = await this.pb.collection("connected_wallets").getFullList({
            filter: `user.id = "${this.pb.authStore.record?.id}"`
        });
        console.log("[wauth] connected wallets", res);
        return res;
    }
    async removeConnectedWallet(walletId) {
        if (!this.isLoggedIn())
            throw new Error("Not logged in");
        try {
            // First verify the wallet belongs to the current user
            const wallet = await this.pb.collection("connected_wallets").getOne(walletId, {
                filter: `user.id = "${this.pb.authStore.record?.id}"`
            });
            if (!wallet) {
                throw new Error("Wallet not found or not owned by current user");
            }
            // Delete the wallet record
            await this.pb.collection("connected_wallets").delete(walletId);
            console.log("[wauth] removed connected wallet", walletId);
            return { success: true, walletId };
        }
        catch (error) {
            console.error("[wauth] error removing connected wallet", error);
            throw error;
        }
    }
    getAuthRecord() {
        if (!this.isLoggedIn())
            return null;
        return this.authRecord;
    }
    pocketbase() {
        return this.pb;
    }
    async sign(transaction, options) {
        if (options)
            console.warn("[wauth] Signature options are not supported yet");
        return await this.runAction(WalletActions.SIGN, { transaction: transaction.toJSON() });
    }
    async signature(data, algorithm) {
        if (algorithm) {
            console.warn("[wauth] Signature algorithm is not supported and Rsa4096Pss will be used by default");
        }
        return Object.values(await this.runAction(WalletActions.SIGNATURE, { data }));
    }
    async signAns104(dataItem) {
        return await this.runAction(WalletActions.SIGN_DATA_ITEM, { dataItem });
    }
    async signDataItem(dataItem) {
        return (await this.runAction(WalletActions.SIGN_DATA_ITEM, { dataItem })).raw;
    }
    getWauthSigner() {
        return new WauthSigner(this);
    }
    getAoSigner() {
        if (!this.isLoggedIn())
            throw new Error("Not logged in");
        if (!this.wallet)
            throw new Error("No wallet found");
        return async (create, createDataItem) => {
            const { data, tags, target, anchor } = await create({ alg: 'rsa-v1_5-sha256', passthrough: true });
            const signedDataItem = await this.signAns104({ data, tags, target, anchor });
            const dataItem = new DataItem(Buffer.from(signedDataItem.raw));
            return { id: dataItem.id, raw: dataItem.getRaw() };
        };
    }
    logout() {
        this.authData = null;
        this.wallet = null;
        this.authRecord = null;
        this.pb.authStore.clear();
    }
}
//# sourceMappingURL=index.js.map