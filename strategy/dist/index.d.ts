import { Strategy } from "@arweave-wallet-kit/core/strategy";
import type { DispatchResult, GatewayConfig, PermissionType, DataItem as ArConnectDataItem } from "arconnect";
import Transaction from "arweave/web/lib/transaction";
import type { SignatureOptions } from "arweave/web/lib/crypto/crypto-interface";
import { WAuthProviders } from "@wauth/sdk";
export default class WAuthStrategy implements Strategy {
    id: string;
    name: string;
    description: string;
    theme: string;
    logo: string;
    url: string;
    private walletRef;
    private provider;
    private addressListeners;
    private authData;
    private authDataListeners;
    private windowArweaveWalletBackup;
    private logos;
    getWindowWalletInterface(): {
        walletName: string;
        walletVersion: string;
        connect: (permissions?: PermissionType[]) => Promise<void>;
        disconnect: () => Promise<void>;
        getActiveAddress: () => Promise<string>;
        getAllAddresses: () => Promise<string[]>;
        sign: (transaction: Transaction, options?: SignatureOptions) => Promise<Transaction>;
        getPermissions: () => Promise<PermissionType[]>;
        getWalletNames: () => Promise<Record<string, string>>;
        encrypt: (data: BufferSource, options: RsaOaepParams | AesCtrParams | AesCbcParams | AesGcmParams) => Promise<Uint8Array>;
        decrypt: (data: BufferSource, options: RsaOaepParams | AesCtrParams | AesCbcParams | AesGcmParams) => Promise<Uint8Array>;
        getArweaveConfig: () => Promise<GatewayConfig>;
        isAvailable: () => Promise<boolean>;
        dispatch: (transaction: Transaction) => Promise<DispatchResult>;
        signDataItem: (dataItem: ArConnectDataItem) => Promise<ArrayBuffer>;
        addAddressEvent: (listener: (address: string) => void) => (e: CustomEvent<{
            address: string;
        }>) => void;
        removeAddressEvent: (listener: (e: CustomEvent<{
            address: string;
        }>) => void) => void;
        getActivePublicKey: () => Promise<string>;
        getConnectedWallets: () => Promise<any[]>;
        removeConnectedWallet: (walletId: string) => Promise<{
            success: boolean;
            walletId: string;
        }>;
    };
    constructor({ provider }: {
        provider: WAuthProviders;
    });
    connect(permissions?: PermissionType[]): Promise<void>;
    reconnect(): Promise<any>;
    onAuthDataChange(callback: (data: any) => void): void;
    getAuthData(): any;
    addConnectedWallet(ArweaveWallet: any): Promise<any>;
    removeConnectedWallet(walletId: string): Promise<{
        success: boolean;
        walletId: string;
    }>;
    disconnect(): Promise<void>;
    getActiveAddress(): Promise<string>;
    getAllAddresses(): Promise<string[]>;
    getActivePublicKey(): Promise<string>;
    getConnectedWallets(): Promise<any[]>;
    sign(transaction: Transaction, options?: SignatureOptions): Promise<Transaction>;
    getPermissions(): Promise<PermissionType[]>;
    getWalletNames(): Promise<Record<string, string>>;
    encrypt(data: BufferSource, options: RsaOaepParams | AesCtrParams | AesCbcParams | AesGcmParams): Promise<Uint8Array>;
    decrypt(data: BufferSource, options: RsaOaepParams | AesCtrParams | AesCbcParams | AesGcmParams): Promise<Uint8Array>;
    getArweaveConfig(): Promise<GatewayConfig>;
    isAvailable(): Promise<boolean>;
    dispatch(transaction: Transaction): Promise<DispatchResult>;
    signDataItem(dataItem: ArConnectDataItem): Promise<ArrayBuffer>;
    signAns104(dataItem: ArConnectDataItem): Promise<{
        id: string;
        raw: ArrayBuffer;
    }>;
    addAddressEvent(listener: (address: string) => void): (e: CustomEvent<{
        address: string;
    }>) => void;
    removeAddressEvent(listener: (e: CustomEvent<{
        address: string;
    }>) => void): void;
    getAoSigner(): (create: any, createDataItem: any) => Promise<{
        id: string;
        raw: Buffer<ArrayBufferLike>;
    }>;
}
declare function fixConnection(address: string | undefined, connected: boolean, disconnect: () => void): void;
export { WAuthProviders, fixConnection };
//# sourceMappingURL=index.d.ts.map