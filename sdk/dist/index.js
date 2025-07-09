import PocketBase, {} from "pocketbase";
import Arweave from "arweave";
export var WAuthProviders;
(function (WAuthProviders) {
    WAuthProviders["Google"] = "google";
    WAuthProviders["Github"] = "github";
    WAuthProviders["Discord"] = "discord";
})(WAuthProviders || (WAuthProviders = {}));
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
    version = `0.0.5`;
    authDataListeners = [];
    constructor({ dev, url, backendUrl }) {
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
    async connect({ provider }) {
        if (!Object.values(WAuthProviders).includes(provider))
            throw new Error(`Invalid provider: ${provider}. Valid providers are: ${Object.values(WAuthProviders).join(", ")}`);
        try {
            this.authData = await this.pb.collection("users").authWithOAuth2({ provider });
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
    logout() {
        this.authData = null;
        this.wallet = null;
        this.authRecord = null;
        this.pb.authStore.clear();
    }
}
//# sourceMappingURL=index.js.map