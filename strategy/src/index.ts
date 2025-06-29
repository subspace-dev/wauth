import { Strategy } from "@arweave-wallet-kit/core/strategy";
import type {
    AppInfo,
    DataItem,
    DispatchResult,
    GatewayConfig,
    PermissionType
} from "arconnect";
import Transaction from "arweave/web/lib/transaction";
import type { SignatureOptions } from "arweave/web/lib/crypto/crypto-interface";
import { WAuth, WAuthProviders } from "@wauth/sdk";

export default class WAuthStrategy implements Strategy {
    public id: "wauth" = "wauth";
    public name = "WAuth";
    public description = "WAuth";
    public theme = "29, 43, 194";
    public logo = "";
    public url = "https://subspace.ar.io"
    private walletRef: WAuth;
    private provider: WAuthProviders;
    private addressListeners: ((address: string) => void)[] = [];


    constructor({ provider }: { provider?: WAuthProviders }) {
        this.provider = provider || WAuthProviders.Google
        this.name = `${this.provider} (powered by WAuth)`
        this.walletRef = new WAuth({}) // auto reconnects based on localStorage
    }

    public async connect(): Promise<void> {
        this.walletRef.connect({ provider: this.provider })
    }

    public async disconnect(): Promise<void> {
        this.walletRef.logout()
    }

    public async getActiveAddress(): Promise<string> {
        return await this.walletRef.getActiveAddress();
    }

    public async getAllAddresses(): Promise<string[]> {
        return [await this.getActiveAddress()]
    }

    public async sign(transaction: Transaction, options?: SignatureOptions): Promise<Transaction> {
        throw new Error("Sign is not implemented in WAuth yet")
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

    public async signDataItem(p: DataItem): Promise<ArrayBuffer> {
        throw new Error("Sign data item is not implemented in WAuth yet")
    }

    public addAddressEvent(listener: (address: string) => void): (e: CustomEvent<{ address: string }>) => void {
        this.addressListeners.push(listener);
        return listener as any;
    }

    public removeAddressEvent(listener: (e: CustomEvent<{ address: string }>) => void): void {
        this.addressListeners.splice(this.addressListeners.indexOf(listener as any), 1);
    }


}