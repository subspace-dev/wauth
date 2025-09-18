import { Strategy } from "@arweave-wallet-kit/core/strategy";
import type {
    AppInfo,
    DispatchResult,
    GatewayConfig,
    PermissionType,
    DataItem as ArConnectDataItem
} from "arconnect";
import Transaction from "arweave/web/lib/transaction";
import type { SignatureOptions } from "arweave/web/lib/crypto/crypto-interface";
import { WAuth, WAuthProviders } from "@wauth/sdk";
import { DataItem } from "@dha-team/arbundles/web";

export default class WAuthStrategy implements Strategy {
    public id: string = "wauth";
    public name = "WAuth";
    public description = "WAuth";
    public theme = "25,25,25";
    public logo = "94R-dRRMdFerUnt8HuQzWT48ktgKsgjQ0uH6zlMFXVw";
    public url = "https://subspace.ar.io"
    private walletRef: WAuth;
    private provider: WAuthProviders;
    private addressListeners: ((address: string) => void)[] = [];
    private scopes: string[];

    private authData: any;
    private authDataListeners: ((data: any) => void)[] = [];

    private windowArweaveWalletBackup: any;

    private logos: { [key in WAuthProviders]: string } = {
        [WAuthProviders.Google]: "mc-lqDefUJZdDSOOqepLICrfEoQCACnS51tB3kKqvlk",
        [WAuthProviders.Github]: "2bcLcWjuuRFDqFHlUvgvX2MzA2hOlZL1ED-T8OFBwCY",
        [WAuthProviders.Discord]: "i4Lw4kXr5t57p8E1oOVGMO4vR35TlYsaJ9XYbMMVd8I",
        [WAuthProviders.X]: "WEcpgXgwGO1PwuIAucwXHUiJ5HWHwkaYTUaAN4wlqQA"
    }

    getWindowWalletInterface() {
        return {
            walletName: "WAuth",
            walletVersion: this.walletRef.version,
            connect: this.connect,
            disconnect: this.disconnect,
            getActiveAddress: this.getActiveAddress,
            getAllAddresses: this.getAllAddresses,
            sign: this.sign,
            getPermissions: this.getPermissions,
            getWalletNames: this.getWalletNames,
            encrypt: this.encrypt,
            decrypt: this.decrypt,
            getArweaveConfig: this.getArweaveConfig,
            isAvailable: this.isAvailable,
            dispatch: this.dispatch,
            signDataItem: this.signDataItem,
            addAddressEvent: this.addAddressEvent,
            removeAddressEvent: this.removeAddressEvent,
            getActivePublicKey: this.getActivePublicKey,
            getConnectedWallets: this.getConnectedWallets,
            removeConnectedWallet: this.removeConnectedWallet,
            getEmail: this.getEmail
        }
    }


    constructor({ provider, scopes = [] }: { provider: WAuthProviders, scopes?: string[] }) {
        this.provider = provider
        this.scopes = scopes
        console.log("provider", provider)
        this.id = this.id + "-" + this.provider
        this.name = `${this.provider.charAt(0).toUpperCase() + this.provider.slice(1).toLowerCase()}`
        this.walletRef = new WAuth({ dev: false }) // auto reconnects based on localStorage
        this.authData = this.walletRef.getAuthData();
        this.logo = this.logos[provider]
        this.windowArweaveWalletBackup = null;
        if (window.arweaveWallet && window.arweaveWallet.walletName != "WAuth") {
            this.windowArweaveWalletBackup = window.arweaveWallet
            // window.arweaveWallet = this.getWindowWalletInterface() as any
            // console.log("injected wauth into window.arweaveWallet")
        }
    }

    public async connect(permissions?: PermissionType[]): Promise<void> {
        if (permissions) {
            console.warn("WAuth does not support custom permissions")
        }
        console.log("scopes", this.scopes)
        const data = await this.walletRef.connect({ provider: this.provider, scopes: this.scopes })
        if (data) {
            this.authData = data?.meta
            this.authDataListeners.forEach(listener => listener(data?.meta));
        }
    }

    public async reconnect(): Promise<any> {
        const data = await this.walletRef.connect({ provider: this.provider, scopes: this.scopes })
        if (data) {
            this.authData = data?.meta
            this.authDataListeners.forEach(listener => listener(this.authData));
        }
        return this.authData
    }

    public onAuthDataChange(callback: (data: any) => void): void {
        this.authDataListeners.push(callback);
    }

    public getAuthData(): any {
        return this.walletRef.getAuthData();
    }

    public async addConnectedWallet(ArweaveWallet: any) {
        const address = await ArweaveWallet.getActiveAddress()
        const pkey = await ArweaveWallet.getActivePublicKey()
        if (!address) { throw new Error("No address found") }
        if (!pkey) { throw new Error("No public key found") }

        // Connect with SIGNATURE permission if not already connected
        await ArweaveWallet.connect(["SIGNATURE"])

        // Create message data and encode it - exactly as shown in docs
        const data = new TextEncoder().encode(JSON.stringify({ address, pkey }));

        // Sign the message - Wander will hash it internally with SHA-256
        const signature = await ArweaveWallet.signMessage(data);
        const signatureString = Buffer.from(signature).toString("base64")

        const resData = await this.walletRef.addConnectedWallet(address, pkey, signatureString)
        return resData
    }

    public async removeConnectedWallet(walletId: string) {
        const resData = await this.walletRef.removeConnectedWallet(walletId)
        console.log(resData)
        return resData
    }

    public async disconnect(): Promise<void> {
        this.walletRef.logout()
        this.authData = null;
    }

    public async getActiveAddress(): Promise<string> {
        return await this.walletRef.getActiveAddress();
    }

    public async getAllAddresses(): Promise<string[]> {
        return [await this.getActiveAddress()]
    }

    public async getActivePublicKey(): Promise<string> {
        return await this.walletRef.getActivePublicKey()
    }

    public async getConnectedWallets(): Promise<any[]> {
        return await this.walletRef.getConnectedWallets()
    }

    public async sign(transaction: Transaction, options?: SignatureOptions): Promise<Transaction> {
        return await this.walletRef.sign(transaction as any, options)
    }

    public async getPermissions(): Promise<PermissionType[]> {
        return await this.walletRef.getPermissions()
    }

    public async getWalletNames(): Promise<Record<string, string>> {
        return await this.walletRef.getWalletNames()
    }

    public encrypt(
        data: BufferSource,
        options: RsaOaepParams | AesCtrParams | AesCbcParams | AesGcmParams
    ): Promise<Uint8Array> {
        throw new Error("Encrypt is not implemented in WAuth yet");
    }

    public decrypt(
        data: BufferSource,
        options: RsaOaepParams | AesCtrParams | AesCbcParams | AesGcmParams
    ): Promise<Uint8Array> {
        throw new Error("Decrypt is not implemented in WAuth yet");
    }

    public async getArweaveConfig(): Promise<GatewayConfig> {
        return await this.walletRef.getArweaveConfig();
    }

    public async isAvailable(): Promise<boolean> {
        return true
    }

    public async dispatch(transaction: Transaction): Promise<DispatchResult> {
        throw new Error("Dispatch is not implemented in WAuth yet")
    }

    public async signDataItem(dataItem: ArConnectDataItem): Promise<ArrayBuffer> {
        return (await this.walletRef.signDataItem(dataItem))
    }

    public async signature(data: Uint8Array, algorithm: AlgorithmIdentifier | RsaPssParams | EcdsaParams): Promise<Uint8Array> {
        return (await this.walletRef.signature(data, algorithm))
    }

    public async signAns104(dataItem: ArConnectDataItem): Promise<{ id: string, raw: ArrayBuffer }> {
        return (await this.walletRef.signAns104(dataItem))
    }

    public addAddressEvent(listener: (address: string) => void): (e: CustomEvent<{ address: string }>) => void {
        this.addressListeners.push(listener);
        return listener as any;
    }

    public removeAddressEvent(listener: (e: CustomEvent<{ address: string }>) => void): void {
        this.addressListeners.splice(this.addressListeners.indexOf(listener as any), 1);
    }

    public getAoSigner() {
        return async (create: any, createDataItem: any) => {
            const { data, tags, target, anchor } = await create({ alg: 'rsa-v1_5-sha256', passthrough: true });
            const signedDataItem = await this.signAns104({ data, tags, target, anchor })
            const dataItem = new DataItem(Buffer.from(signedDataItem.raw))
            return { id: dataItem.id, raw: dataItem.getRaw() }
        }
    }

    public getEmail(): { email: string, verified: boolean } {
        return this.walletRef.getEmail()
    }

    public getUsername(): string | null {
        return this.walletRef.getUsername()
    }
}

function shouldDisconnect(address: string | undefined, connected: boolean) {
    if (connected && !address && !localStorage.getItem("pocketbase_auth")) {
        return true
    }
    return false
}

function fixConnection(address: string | undefined, connected: boolean, disconnect: () => void) {
    if (shouldDisconnect(address, connected)) {
        localStorage.removeItem("pocketbase_auth")
        localStorage.removeItem("wallet_kit_strategy_id")
        disconnect()
    }
}

export { WAuthProviders, fixConnection }

