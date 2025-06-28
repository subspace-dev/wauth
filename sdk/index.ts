import PocketBase, { type RecordAuthResponse, type RecordModel } from "pocketbase"
import Arweave from "arweave"

export enum WAuthProviders {
    Google = "google",
    Github = "github",
    Discord = "discord"
}

export class WAuth {
    static devUrl = "http://localhost:8090"
    static prodUrl = "https://wauth.arnode.asia"

    private pb: PocketBase;
    private authData: RecordAuthResponse<RecordModel> | null;
    private wallet: RecordModel | null;


    constructor({ dev, url }: { dev?: boolean, url?: string }) {
        this.pb = new PocketBase(url || (dev ? WAuth.devUrl : WAuth.prodUrl));
        this.authData = null;
        this.wallet = null;
    }

    private async generateWallet(): Promise<{ jwk: any, address: string }> {
        const ar = Arweave.init({})
        const jwk = await ar.wallets.generate()
        const address = await ar.wallets.jwkToAddress(jwk)
        return { jwk, address }
    }

    async login({ provider }: { provider: WAuthProviders }) {
        if (!Object.values(WAuthProviders).includes(provider)) throw new Error(`Invalid provider: ${provider}. Valid providers are: ${Object.values(WAuthProviders).join(", ")}`)


        try {
            this.authData = await this.pb.collection("users").authWithOAuth2({ provider })
        } catch (e) {
            console.error("[wauth] error logging in", e)
            return null;
        }

        if (!this.isLoggedIn()) return null;

        this.pb.authStore.onChange((token, record) => {
            // console.log("auth store changed", token, record)
            console.log("[wauth] auth updated", record?.email)
        }, true)


        const { jwk, address } = await this.generateWallet()

        try {
            this.wallet = await this.getWallet()
            if (!this.wallet) {
                console.log("[wauth] no wallet found, creating one:", address)

                await this.pb.collection("wallets").create({
                    jwk,
                    address,
                })
                this.wallet = await this.getWallet()
                if (!this.wallet) throw new Error("Failed to create wallet")
                console.log("[wauth] wallet created", this.wallet)
            }
        } catch (e) {
            console.error("[wauth]", e)
        }


        return this.getAuthData();
    }

    isLoggedIn() {
        return this.pb.authStore.isValid;
    }

    async getAuthData() {
        if (!this.isLoggedIn()) throw new Error("Not logged in")
        return { wallet: await this.getWallet(), authData: this.authData };
    }

    async getWallet() {
        if (!this.isLoggedIn()) throw new Error("Not logged in")

        try {
            this.wallet = await this.pb.collection("wallets").getFirstListItem(`user.id = "${this.pb.authStore.record?.id}"`)
            return this.wallet;
        } catch (e) {
            console.info("[wauth] error fetching wallet, may not exist", e)
            return null;
        }
    }

    pocketbase() {
        return this.pb;
    }

    logout() {
        this.authData = null;
        this.wallet = null;
        this.pb.authStore.clear();
    }
}