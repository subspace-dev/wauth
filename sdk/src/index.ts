import PocketBase, { type RecordAuthResponse, type RecordModel } from "pocketbase"
import Arweave from "arweave"
import type { GatewayConfig, PermissionType } from "arconnect";
import type { Tag } from "arweave/web/lib/transaction";
import Transaction from "arweave/web/lib/transaction";
import type { SignatureOptions } from "arweave/web/lib/crypto/crypto-interface";
import { type DataItem as ArConnectDataItem } from "arconnect";
import { DataItem } from "@dha-team/arbundles";
import axios from "axios";


export enum WAuthProviders {
    Google = "google",
    Github = "github",
    Discord = "discord"
}

export enum WalletActions {
    SIGN = "sign",
    ENCRYPT = "encrypt",
    DECRYPT = "decrypt",
    DISPATCH = "dispatch",
    SIGN_DATA_ITEM = "signDataItem",
    SIGNATURE = "signature"
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

    private async runAction(action: WalletActions, payload: any = {}) {
        // make sure the user is logged in
        if (!this.isLoggedIn()) throw new Error("[wauth] Not logged in")

        // make sure the wallet is connected
        if (!this.wallet) this.wallet = await this.getWallet()
        if (!this.wallet) throw new Error("[wauth] No wallet found")

        switch (action) {
            case WalletActions.SIGN:
                // check for Action=Transfer Tag and ask user for approval
                if (payload && payload.transaction && payload.transaction.tags) {
                    const actionTag = payload.transaction.tags.find((tag: Tag) => tag.name === "Action");
                    if (actionTag?.value === "Transfer") {
                        // ask user for approval before proceeding
                        // window confirm dialog
                        const confirmed = window.confirm(`Are you sure you want to proceed with this transaction?\n\n${JSON.stringify(payload)}`)
                        if (!confirmed) {
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
                        // ask user for approval before proceeding
                        // window confirm dialog
                        const confirmed = window.confirm(`Are you sure you want to proceed with this transaction?\n\n${JSON.stringify(payload)}`)
                        if (!confirmed) {
                            throw new Error("[wauth] Transaction cancelled by user")
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
            responseType: 'json'  // This tells axios to return raw binary data
        })
        return res.data
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