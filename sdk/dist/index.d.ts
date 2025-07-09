import PocketBase, { type RecordAuthResponse, type RecordModel } from "pocketbase";
import type { GatewayConfig, PermissionType } from "arconnect";
export declare enum WAuthProviders {
    Google = "google",
    Github = "github",
    Discord = "discord"
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
    connect({ provider }: {
        provider: WAuthProviders;
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
    logout(): void;
}
//# sourceMappingURL=index.d.ts.map