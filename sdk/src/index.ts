import PocketBase, { type RecordAuthResponse, type RecordModel } from "pocketbase"
import Arweave from "arweave"
import type { GatewayConfig, PermissionType } from "arconnect";


export enum WAuthProviders {
    Google = "google",
    Github = "github",
    Discord = "discord"
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
    public version: string = `0.0.5`;

    private authDataListeners: ((data: any) => void)[] = [];


    constructor({ dev, url, backendUrl }: { dev?: boolean, url?: string, backendUrl?: string }) {
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

    async connect({ provider }: { provider: WAuthProviders }) {
        if (!Object.values(WAuthProviders).includes(provider)) throw new Error(`Invalid provider: ${provider}. Valid providers are: ${Object.values(WAuthProviders).join(", ")}`)

        try {
            this.authData = await this.pb.collection("users").authWithOAuth2({ provider })
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


    async addConnectedWallet(address: string, pkey: string, signature: string) {
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

    isLoggedIn() {
        return this.pb.authStore.isValid;
    }

    async getActiveAddress(): Promise<string> {
        if (!this.isLoggedIn()) throw new Error("Not logged in")
        if (!this.wallet) this.wallet = await this.getWallet()
        return this.wallet?.address || ""
    }

    async getActivePublicKey(): Promise<string> {
        if (!this.isLoggedIn()) throw new Error("Not logged in")
        if (!this.wallet) this.wallet = await this.getWallet()
        return this.wallet?.public_key || ""
    }

    async getPermissions(): Promise<PermissionType[]> {
        return ["ACCESS_ADDRESS" as PermissionType, "SIGN_TRANSACTION" as PermissionType]
    }

    async getWalletNames() {
        return { [await this.getActiveAddress()]: "WAuth" }
    }

    public async getArweaveConfig(): Promise<GatewayConfig> {
        const config: GatewayConfig = {
            host: "arweave.net",
            port: 443,
            protocol: "https",
        };

        return config
    }

    getAuthData() {
        if (!this.isLoggedIn()) return null;
        return this.authData
    }

    public getAuthToken(): string | null {
        if (!this.isLoggedIn()) return null;
        if (!this.pb.authStore.token) return null;
        return this.pb.authStore.token
    }

    async getWallet() {
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

    logout() {
        this.authData = null;
        this.wallet = null;
        this.authRecord = null;
        this.pb.authStore.clear();
    }
}