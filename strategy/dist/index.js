import { Strategy } from "@arweave-wallet-kit/core/strategy";
import Transaction from "arweave/web/lib/transaction";
import { WAuth, WAuthProviders } from "@wauth/sdk";
import { ArweaveSigner, createData, DataItem } from "@dha-team/arbundles";
import Arweave from "arweave/web";
import axios from "axios";
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
    authData;
    authDataListeners = [];
    windowArweaveWalletBackup;
    logos = {
        [WAuthProviders.Google]: "mc-lqDefUJZdDSOOqepLICrfEoQCACnS51tB3kKqvlk",
        [WAuthProviders.Github]: "2bcLcWjuuRFDqFHlUvgvX2MzA2hOlZL1ED-T8OFBwCY",
        [WAuthProviders.Discord]: "i4Lw4kXr5t57p8E1oOVGMO4vR35TlYsaJ9XYbMMVd8I"
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
    constructor({ provider }) {
        this.provider = provider;
        this.id = this.id + "-" + this.provider;
        this.name = `${this.provider.charAt(0).toUpperCase() + this.provider.slice(1).toLowerCase()}`;
        this.walletRef = new WAuth({}); // auto reconnects based on localStorage
        this.authData = this.walletRef.getAuthData();
        this.logo = this.logos[provider];
        this.windowArweaveWalletBackup = null;
        if (window.arweaveWallet && window.arweaveWallet.walletName != "WAuth") {
            this.windowArweaveWalletBackup = window.arweaveWallet;
            window.arweaveWallet = this.getWindowWalletInterface();
            console.log("injected wauth into window.arweaveWallet");
        }
    }
    async connect(permissions) {
        if (permissions) {
            console.warn("WAuth does not support custom permissions");
        }
        const data = await this.walletRef.connect({ provider: this.provider });
        if (data) {
            this.authData = data?.meta;
            this.authDataListeners.forEach(listener => listener(data?.meta));
        }
    }
    async reconnect() {
        const data = await this.walletRef.connect({ provider: this.provider });
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
        // wallet must have SIGNATURE permission
        const data = new TextEncoder().encode(JSON.stringify({ address, pkey }));
        const signature = await ArweaveWallet.signMessage(data);
        const signatureString = Buffer.from(signature).toString("base64");
        console.log(signatureString);
        const resData = await this.walletRef.addConnectedWallet(address, pkey, signatureString);
        console.log(resData);
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
        return (await this.walletRef.signDataItem(dataItem)).raw;
    }
    async signAns104(dataItem) {
        return (await this.walletRef.signDataItem(dataItem));
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
            console.log("create", create);
            console.log("createDataItem", createDataItem);
            const { data, tags, target, anchor } = await create({ alg: 'rsa-v1_5-sha256', passthrough: true });
            const signedDataItem = await this.signAns104({ data, tags, target, anchor });
            const dataItem = new DataItem(Buffer.from(signedDataItem.raw));
            const valid = await dataItem.isValid();
            console.log("valid", valid);
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