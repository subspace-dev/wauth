import PocketBase, { type RecordAuthResponse, type RecordModel } from "pocketbase";
import type { GatewayConfig, PermissionType } from "arconnect";
import Transaction from "arweave/web/lib/transaction";
import type { SignatureOptions } from "arweave/web/lib/crypto/crypto-interface";
import { type DataItem as ArConnectDataItem } from "arconnect";
export declare enum WAuthProviders {
    Google = "google",
    Github = "github",
    Discord = "discord"
}
export declare enum WalletActions {
    SIGN = "sign",
    ENCRYPT = "encrypt",
    DECRYPT = "decrypt",
    DISPATCH = "dispatch",
    SIGN_DATA_ITEM = "signDataItem",
    SIGNATURE = "signature"
}
export declare class WAuth {
    static devUrl: string;
    static devBackendUrl: string;
    static prodUrl: string;
    static prodBackendUrl: string;
    private pb;
    private authData;
    private wallet;
    private authRecord;
    private backendUrl;
    version: string;
    private authDataListeners;
    constructor({ dev, url, backendUrl }: {
        dev?: boolean;
        url?: string;
        backendUrl?: string;
    });
    onAuthDataChange(callback: (data: any) => void): void;
    private runAction;
    connect({ provider, scopes }: {
        provider: WAuthProviders;
        scopes?: string[];
    }): Promise<RecordAuthResponse<RecordModel> | null>;
    addConnectedWallet(address: string, pkey: string, signature: string): Promise<any>;
    isLoggedIn(): boolean;
    getActiveAddress(): Promise<string>;
    getActivePublicKey(): Promise<string>;
    getPermissions(): Promise<PermissionType[]>;
    getWalletNames(): Promise<{
        [x: string]: string;
    }>;
    getArweaveConfig(): Promise<GatewayConfig>;
    getAuthData(): RecordAuthResponse<RecordModel> | null;
    getAuthToken(): string | null;
    getWallet(): Promise<RecordModel | null>;
    getConnectedWallets(): Promise<RecordModel[]>;
    removeConnectedWallet(walletId: string): Promise<{
        success: boolean;
        walletId: string;
    }>;
    getAuthRecord(): RecordModel | null;
    pocketbase(): PocketBase;
    sign(transaction: Transaction, options?: SignatureOptions): Promise<any>;
    signature(data: Uint8Array, algorithm?: AlgorithmIdentifier | RsaPssParams | EcdsaParams): Promise<Uint8Array>;
    signAns104(dataItem: ArConnectDataItem): Promise<{
        id: string;
        raw: ArrayBuffer;
    }>;
    signDataItem(dataItem: ArConnectDataItem): Promise<ArrayBuffer>;
    getAoSigner(): (create: any, createDataItem: any) => Promise<{
        id: string;
        raw: Buffer<ArrayBufferLike>;
    }>;
    logout(): void;
}
//# sourceMappingURL=index.d.ts.map