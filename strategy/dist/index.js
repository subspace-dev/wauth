import { Strategy } from "@arweave-wallet-kit/core/strategy";
import Transaction from "arweave/web/lib/transaction";
import { WAuth, WAuthProviders } from "@wauth/sdk";
import { DataItem } from "@dha-team/arbundles/web";
export default class WAuthStrategy {
    id = "wauth";
    name = "WAuth";
    description = "WAuth";
    theme = "25,25,25";
    logo = "94R-dRRMdFerUnt8HuQzWT48ktgKsgjQ0uH6zlMFXVw";
    url = "https://subspace.ar.io";
    walletRef;
    provider;
    addressListeners = [];
    scopes;
    authData;
    authDataListeners = [];
    windowArweaveWalletBackup;
    logos = {
        [WAuthProviders.Google]: "mc-lqDefUJZdDSOOqepLICrfEoQCACnS51tB3kKqvlk",
        [WAuthProviders.Github]: "2bcLcWjuuRFDqFHlUvgvX2MzA2hOlZL1ED-T8OFBwCY",
        [WAuthProviders.Discord]: "i4Lw4kXr5t57p8E1oOVGMO4vR35TlYsaJ9XYbMMVd8I",
        [WAuthProviders.X]: "WEcpgXgwGO1PwuIAucwXHUiJ5HWHwkaYTUaAN4wlqQA"
    };
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
            removeConnectedWallet: this.removeConnectedWallet
        };
    }
    constructor({ provider, scopes = [] }) {
        this.provider = provider;
        this.scopes = scopes;
        console.log("provider", provider);
        this.id = this.id + "-" + this.provider;
        this.name = `${this.provider.charAt(0).toUpperCase() + this.provider.slice(1).toLowerCase()}`;
        this.walletRef = new WAuth({}); // auto reconnects based on localStorage
        this.authData = this.walletRef.getAuthData();
        this.logo = this.logos[provider];
        this.windowArweaveWalletBackup = null;
        if (window.arweaveWallet && window.arweaveWallet.walletName != "WAuth") {
            this.windowArweaveWalletBackup = window.arweaveWallet;
            // window.arweaveWallet = this.getWindowWalletInterface() as any
            // console.log("injected wauth into window.arweaveWallet")
        }
    }
    async connect(permissions) {
        if (permissions) {
            console.warn("WAuth does not support custom permissions");
        }
        console.log("scopes", this.scopes);
        const data = await this.walletRef.connect({ provider: this.provider, scopes: this.scopes });
        if (data) {
            this.authData = data?.meta;
            this.authDataListeners.forEach(listener => listener(data?.meta));
        }
    }
    async reconnect() {
        const data = await this.walletRef.connect({ provider: this.provider, scopes: this.scopes });
        if (data) {
            this.authData = data?.meta;
            this.authDataListeners.forEach(listener => listener(this.authData));
        }
        return this.authData;
    }
    onAuthDataChange(callback) {
        this.authDataListeners.push(callback);
    }
    getAuthData() {
        return this.walletRef.getAuthData();
    }
    async addConnectedWallet(ArweaveWallet) {
        const address = await ArweaveWallet.getActiveAddress();
        const pkey = await ArweaveWallet.getActivePublicKey();
        if (!address) {
            throw new Error("No address found");
        }
        if (!pkey) {
            throw new Error("No public key found");
        }
        // Connect with SIGNATURE permission if not already connected
        await ArweaveWallet.connect(["SIGNATURE"]);
        // Create message data and encode it - exactly as shown in docs
        const data = new TextEncoder().encode(JSON.stringify({ address, pkey }));
        // Sign the message - Wander will hash it internally with SHA-256
        const signature = await ArweaveWallet.signMessage(data);
        const signatureString = Buffer.from(signature).toString("base64");
        const resData = await this.walletRef.addConnectedWallet(address, pkey, signatureString);
        return resData;
    }
    async removeConnectedWallet(walletId) {
        const resData = await this.walletRef.removeConnectedWallet(walletId);
        console.log(resData);
        return resData;
    }
    async disconnect() {
        this.walletRef.logout();
        this.authData = null;
    }
    async getActiveAddress() {
        return await this.walletRef.getActiveAddress();
    }
    async getAllAddresses() {
        return [await this.getActiveAddress()];
    }
    async getActivePublicKey() {
        return await this.walletRef.getActivePublicKey();
    }
    async getConnectedWallets() {
        return await this.walletRef.getConnectedWallets();
    }
    async sign(transaction, options) {
        return await this.walletRef.sign(transaction, options);
    }
    async getPermissions() {
        return await this.walletRef.getPermissions();
    }
    async getWalletNames() {
        return await this.walletRef.getWalletNames();
    }
    encrypt(data, options) {
        throw new Error("Encrypt is not implemented in WAuth yet");
    }
    decrypt(data, options) {
        throw new Error("Decrypt is not implemented in WAuth yet");
    }
    async getArweaveConfig() {
        return await this.walletRef.getArweaveConfig();
    }
    async isAvailable() {
        return true;
    }
    async dispatch(transaction) {
        throw new Error("Dispatch is not implemented in WAuth yet");
    }
    async signDataItem(dataItem) {
        return (await this.walletRef.signDataItem(dataItem));
    }
    async signature(data, algorithm) {
        return (await this.walletRef.signature(data, algorithm));
    }
    async signAns104(dataItem) {
        return (await this.walletRef.signAns104(dataItem));
    }
    addAddressEvent(listener) {
        this.addressListeners.push(listener);
        return listener;
    }
    removeAddressEvent(listener) {
        this.addressListeners.splice(this.addressListeners.indexOf(listener), 1);
    }
    getAoSigner() {
        return async (create, createDataItem) => {
            const { data, tags, target, anchor } = await create({ alg: 'rsa-v1_5-sha256', passthrough: true });
            const signedDataItem = await this.signAns104({ data, tags, target, anchor });
            const dataItem = new DataItem(Buffer.from(signedDataItem.raw));
            return { id: dataItem.id, raw: dataItem.getRaw() };
        };
    }
}
function shouldDisconnect(address, connected) {
    if (connected && !address && !localStorage.getItem("pocketbase_auth")) {
        return true;
    }
    return false;
}
function fixConnection(address, connected, disconnect) {
    if (shouldDisconnect(address, connected)) {
        disconnect();
    }
}
export { WAuthProviders, fixConnection };
//# sourceMappingURL=index.js.map