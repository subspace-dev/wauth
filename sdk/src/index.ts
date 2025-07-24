import PocketBase, { type RecordAuthResponse, type RecordModel } from "pocketbase"
import Arweave from "arweave"
import type { GatewayConfig, PermissionType } from "arconnect";
import type { Tag } from "arweave/web/lib/transaction";
import Transaction from "arweave/web/lib/transaction";
import type { SignatureOptions } from "arweave/web/lib/crypto/crypto-interface";
import { type DataItem as ArConnectDataItem } from "arconnect";
import { DataItem } from "@dha-team/arbundles";
import axios from "axios";
import base64url from "base64url";
import { WAUTH_VERSION } from "./version";
import { createModal, createModalContainer } from "./modal-helper";
import { dryrun } from "@permaweb/aoconnect";

// HTML Sanitization Utility
class HTMLSanitizer {
    /**
     * Escapes HTML entities to prevent XSS attacks
     * @param text - The text to escape
     * @returns Escaped text safe for innerHTML
     */
    static escapeHTML(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Creates a safe HTML string with basic formatting
     * @param text - The text content
     * @param allowedTags - Array of allowed HTML tags (default: ['br', 'strong', 'em'])
     * @returns Sanitized HTML string
     */
    static sanitizeHTML(text: string, allowedTags: string[] = ['br', 'strong', 'em']): string {
        // First escape all HTML
        let sanitized = this.escapeHTML(text);

        // Then allow specific tags back in a controlled way
        allowedTags.forEach(tag => {
            const escapedOpenTag = `&lt;${tag}&gt;`;
            const escapedCloseTag = `&lt;/${tag}&gt;`;
            const openTagRegex = new RegExp(escapedOpenTag, 'gi');
            const closeTagRegex = new RegExp(escapedCloseTag, 'gi');

            sanitized = sanitized.replace(openTagRegex, `<${tag}>`);
            sanitized = sanitized.replace(closeTagRegex, `</${tag}>`);
        });

        return sanitized;
    }

    /**
     * Safely sets innerHTML with sanitization
     * @param element - The DOM element
     * @param html - The HTML content to set
     * @param allowedTags - Array of allowed HTML tags
     */
    static safeSetInnerHTML(element: HTMLElement, html: string, allowedTags?: string[]): void {
        element.innerHTML = this.sanitizeHTML(html, allowedTags);
    }

    /**
     * Creates a safe link element
     * @param href - The URL (will be validated)
     * @param text - The link text (will be escaped)
     * @param target - Link target (default: '_blank')
     * @returns HTMLAnchorElement
     */
    static createSafeLink(href: string, text: string, target: string = '_blank'): HTMLAnchorElement {
        const link = document.createElement('a');

        // Validate URL - only allow http/https
        try {
            const url = new URL(href);
            if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                throw new Error('Invalid protocol');
            }
            link.href = url.toString();
        } catch {
            // If URL is invalid, don't set href
            link.href = '#';
            console.warn('Invalid URL provided to createSafeLink:', href);
        }

        link.textContent = text; // textContent automatically escapes
        link.target = target;

        // Security attributes for external links
        if (target === '_blank') {
            link.rel = 'noopener noreferrer';
        }

        return link;
    }
}

// Export HTMLSanitizer for external use
export { HTMLSanitizer };

// Frontend password encryption utilities
class PasswordEncryption {
    private static publicKey: CryptoKey | null = null;

    static async getBackendPublicKey(backendUrl: string): Promise<CryptoKey> {
        if (this.publicKey) {
            return this.publicKey;
        }

        try {
            const response = await fetch(`${backendUrl}/public-key`);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            if (data.error) {
                throw new Error(`Backend error: ${data.error}`);
            }

            if (!data.publicKey) {
                throw new Error("No public key in response");
            }

            this.publicKey = await crypto.subtle.importKey(
                "jwk",
                data.publicKey,
                {
                    name: "RSA-OAEP",
                    hash: "SHA-256",
                },
                false,
                ["encrypt"]
            );

            return this.publicKey;
        } catch (error) {
            console.error("Failed to get backend public key:", error);
            throw new Error("Failed to initialize password encryption: " + (error as Error).message);
        }
    }

    static async encryptPassword(password: string, backendUrl: string): Promise<string> {
        try {
            const publicKey = await this.getBackendPublicKey(backendUrl);

            // Generate nonce and timestamp for anti-replay protection
            const nonce = crypto.randomUUID();
            const timestamp = Date.now();

            const payload = {
                password,
                nonce,
                timestamp
            };

            const encrypted = await crypto.subtle.encrypt(
                { name: "RSA-OAEP" },
                publicKey,
                new TextEncoder().encode(JSON.stringify(payload))
            );

            return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
        } catch (error) {
            console.error("Password encryption failed:", error);
            throw new Error("Failed to encrypt password: " + (error as Error).message);
        }
    }
}

export enum WAuthProviders {
    Google = "google",
    Github = "github",
    Discord = "discord",
    X = "twitter"
}

export enum WalletActions {
    SIGN = "sign",
    ENCRYPT = "encrypt",
    DECRYPT = "decrypt",
    DISPATCH = "dispatch",
    SIGN_DATA_ITEM = "signDataItem",
    SIGNATURE = "signature"
}

type ModalTypes = "confirm-tx" | "password-new" | "password-existing"
export type { ModalTypes }

type ModalPayload = {
    transaction?: Transaction
    dataItem?: ArConnectDataItem
    tokenDetails?: any
}
export type { ModalPayload }

type ModalResult = {
    proceed: boolean,
    password?: string
}
export type { ModalResult }

export class WauthSigner {
    private wauth: WAuth;
    public publicKey: Buffer;
    public ownerLength = 512;
    public signatureLength = 512;
    public signatureType = 1;

    constructor(wauth: WAuth) {
        this.wauth = wauth;
        // Initialize publicKey as empty buffer, will be set in setPublicKey
        this.publicKey = Buffer.alloc(0);
        // Immediately set the public key
        this.setPublicKey().catch(error => {
            console.error("Failed to set initial public key:", error);
            throw error;
        });
    }

    async setPublicKey() {
        try {
            const arOwner = await this.wauth.getActivePublicKey();
            this.publicKey = base64url.toBuffer(arOwner);
            if (this.publicKey.length !== this.ownerLength) {
                throw new Error(`Public key length mismatch. Expected ${this.ownerLength} bytes but got ${this.publicKey.length} bytes`);
            }
        } catch (error) {
            console.error("Failed to set public key:", error);
            throw error;
        }
    }

    async sign(message: Uint8Array): Promise<Uint8Array> {
        try {
            if (!this.publicKey.length || this.publicKey.length !== this.ownerLength) {
                await this.setPublicKey();
            }

            const signature = await this.wauth.signature(message);
            const buf = new Uint8Array(Object.values(signature).map((v) => +v));

            if (buf.length !== this.signatureLength) {
                throw new Error(`Signature length mismatch. Expected ${this.signatureLength} bytes but got ${buf.length} bytes`);
            }

            return buf;
        } catch (error) {
            console.error("Sign operation failed:", error);
            throw error;
        }
    }

    static async verify(pk: string | Buffer, message: Uint8Array, signature: Uint8Array): Promise<boolean> {
        try {
            // Convert Buffer to string if needed
            const publicKeyString = Buffer.isBuffer(pk) ? pk.toString() : pk;

            // Import the public key for verification
            const publicJWK: JsonWebKey = {
                e: "AQAB",
                ext: true,
                kty: "RSA",
                n: publicKeyString
            };

            // Import public key for verification
            const verificationKey = await crypto.subtle.importKey(
                "jwk",
                publicJWK,
                {
                    name: "RSA-PSS",
                    hash: "SHA-256"
                },
                false,
                ["verify"]
            );

            // Verify the signature
            const result = await crypto.subtle.verify(
                { name: "RSA-PSS", saltLength: 32 },
                verificationKey,
                signature,
                message
            );

            return result;
        } catch (error: any) {
            console.error("Verify operation failed:", error?.message || "Unknown error");
            return false;
        }
    }
}

async function getTokenDetails(token: string) {
    const res = await dryrun({
        process: token,
        tags: [{ name: "Action", value: "Info" }]
    })
    if (res.Messages.length < 1) throw new Error("No info message found")

    const msg = res.Messages[0]
    const tags = msg.Tags
    // transform tags {name,value}[] to {name:value}
    const tagsObj = tags.reduce((acc: any, tag: any) => {
        acc[tag.name] = tag.value
        return acc
    }, {})

    return tagsObj
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
    public static version: string = WAUTH_VERSION;
    public version: string = WAuth.version;

    private authDataListeners: ((data: any) => void)[] = [];
    private sessionPassword: string | null = null; // Store decrypted password in memory only
    private sessionKey: CryptoKey | null = null; // Key for local session encryption

    private async initializeSessionKey(): Promise<CryptoKey> {
        if (this.sessionKey) return this.sessionKey;

        // Try to load existing session key
        const storedKey = sessionStorage.getItem('wauth_session_key');
        if (storedKey) {
            try {
                const keyData = JSON.parse(storedKey);
                this.sessionKey = await crypto.subtle.importKey(
                    'jwk',
                    keyData,
                    { name: 'AES-GCM' },
                    false,
                    ['encrypt', 'decrypt']
                );
                return this.sessionKey;
            } catch (error) {
                // If key loading fails, generate a new one
                sessionStorage.removeItem('wauth_session_key');
                sessionStorage.removeItem('wauth_encrypted_password');
            }
        }

        // Generate new session key
        this.sessionKey = await crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );

        // Store the key for the session
        const exportedKey = await crypto.subtle.exportKey('jwk', this.sessionKey);
        sessionStorage.setItem('wauth_session_key', JSON.stringify(exportedKey));

        return this.sessionKey;
    }

    private async storePasswordInSession(password: string): Promise<void> {
        if (typeof window === 'undefined' || !password) return;

        try {
            const sessionKey = await this.initializeSessionKey();
            const encoder = new TextEncoder();
            const data = encoder.encode(password);

            // Generate a random IV for each encryption
            const iv = crypto.getRandomValues(new Uint8Array(12));

            const encrypted = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv },
                sessionKey,
                data
            );

            // Store encrypted password with IV
            const encryptedData = {
                encrypted: Array.from(new Uint8Array(encrypted)),
                iv: Array.from(iv)
            };

            sessionStorage.setItem('wauth_encrypted_password', JSON.stringify(encryptedData));
        } catch (error) {
            console.error("Failed to store password in session:", error);
        }
    }

    private async loadPasswordFromSession(): Promise<string | null> {
        if (typeof window === 'undefined') return null;

        try {
            const storedData = sessionStorage.getItem('wauth_encrypted_password');
            if (!storedData) return null;

            const { encrypted, iv } = JSON.parse(storedData);
            const sessionKey = await this.initializeSessionKey();

            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: new Uint8Array(iv) },
                sessionKey,
                new Uint8Array(encrypted)
            );

            const decoder = new TextDecoder();
            return decoder.decode(decrypted);
        } catch (error) {
            console.error("Failed to load password from session:", error);
            // Clear invalid data
            sessionStorage.removeItem('wauth_encrypted_password');
            return null;
        }
    }

    private clearSessionPassword(): void {
        if (typeof window !== 'undefined') {
            sessionStorage.removeItem('wauth_encrypted_password');
            sessionStorage.removeItem('wauth_session_key');
        }
        this.sessionPassword = null;
        this.sessionKey = null;
    }

    constructor({ dev = false, url, backendUrl }: { dev?: boolean, url?: string, backendUrl?: string }) {
        if (dev == undefined) {
            dev = process.env.NODE_ENV === "development"
        }
        this.pb = new PocketBase(url || (dev ? WAuth.devUrl : WAuth.prodUrl));
        this.backendUrl = backendUrl || (dev ? WAuth.devBackendUrl : WAuth.prodBackendUrl);
        this.authData = null;
        this.wallet = null;
        this.authRecord = null;
        this.sessionPassword = null;
        this.sessionKey = null;

        // Load password from session storage on initialization
        if (typeof window !== 'undefined') {
            this.loadPasswordFromSession().then(async password => {
                if (password) {
                    this.sessionPassword = password;
                    // Try to load wallet if user is already authenticated
                    if (this.isLoggedIn()) {
                        try {
                            this.wallet = await this.getWallet();
                        } catch (error) {
                            console.warn("Could not load wallet after session restore:", error);
                        }
                    }
                }
            }).catch(error => {
                console.error("Failed to load session password:", error);
            });
        }

        this.pb.authStore.onChange(async (token, record) => {
            if (!record || !localStorage.getItem("pocketbase_auth")) {
                return
            }
            this.authRecord = record;
            this.authData = this.getAuthData();

            // Only try to get wallet if we have a session password
            // This prevents the race condition during connect()
            if (this.sessionPassword) {
                try {
                    this.wallet = await this.getWallet();
                } catch (error) {
                    console.warn("[wauth] Could not get wallet in auth change handler:", error);
                }
            }

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

        // Helper to show modal and await result
        const showModal = (type: ModalTypes, payload: ModalPayload): Promise<ModalResult> => {
            return new Promise((resolve) => {
                this.createModal(type, payload, (result) => {
                    resolve(result)
                })
            })
        }

        switch (action) {
            case WalletActions.SIGN:
                // check for Action=Transfer Tag and ask user for approval
                if (payload && payload.transaction && payload.transaction.tags) {
                    const actionTag = payload.transaction.tags.find((tag: Tag) => tag.name === "Action");
                    if (actionTag?.value === "Transfer") {
                        // Show modal and await user confirmation
                        const result = await showModal("confirm-tx", { transaction: payload.transaction })
                        if (!result.proceed) {
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
                        // Show modal and await user confirmation
                        const result = await showModal("confirm-tx", { dataItem: payload.dataItem })
                        if (!result.proceed) {
                            throw new Error("[wauth] Transaction cancelled by user")
                        }
                    }
                }
                break;
        }

        // Encrypt session password for backend
        if (!this.sessionPassword) {
            throw new Error("Session password not available - please reconnect");
        }

        const encryptedPassword = await PasswordEncryption.encryptPassword(this.sessionPassword, this.backendUrl);

        // send the action, payload, and encrypted password to the backend
        const res = await axios.post(`${this.backendUrl}/wallet-action`, {
            action,
            payload,
            encryptedPassword
        }, {
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Authorization": `Bearer ${this.getAuthToken()}`
            },
            responseType: 'json'
        })
        return res.data
    }

    // There can be 2 types of modals:
    // 1. Transaction verification- for when the user is about to transfer tokens and needs user confirmation,
    //    this modal would have info text, amount to be transfered, and proceed/cancel buttons
    // 2. Password input modal- either when user is connecting for the first time (ask for password and confirm password)
    //    or when they already have an account and just logging in (ask for password),
    //    this will be send in an encrypted way to the backend for use with decoding JWK
    public async createModal(type: ModalTypes, payload: ModalPayload = {}, callback: (result: ModalResult) => void) {
        // if type is confirm-tx, check payload.transaction or payload.dataItem and tell the user that some tokens are being transferred and its details, and ask for confirmation
        // if type is password-new, ask for password and confirm password
        // if type is password-existing, ask for password and return it
        // based on the users actions, call the callback with the result

        const container = createModalContainer()

        // Create modal immediately with current payload
        const modal = createModal(type, payload, (result) => {
            // Remove the modal container from the DOM after callback
            if (container.parentNode) {
                container.parentNode.removeChild(container)
            }
            callback(result)
        })
        container.appendChild(modal)

        // Add powered by element as sibling to modal content
        const powered = document.createElement("div")
        powered.className = "wauth-powered"

        // Use secure link creation instead of innerHTML
        const poweredLink = HTMLSanitizer.createSafeLink("https://wauth_subspace.ar.io", "powered by wauth", "_blank")
        powered.appendChild(poweredLink)

        powered.style.position = "absolute"
        powered.style.bottom = "20px"
        powered.style.textAlign = "center"
        powered.style.fontSize = "0.9rem"
        powered.style.color = "rgba(255, 255, 255, 0.5)"
        powered.style.opacity = "0.8"
        powered.style.letterSpacing = "0.5px"
        powered.style.fontWeight = "500"
        powered.style.left = "0"
        powered.style.right = "0"
        powered.style.transition = "all 0.2s ease"
        powered.style.textShadow = "0 1px 2px rgba(0, 0, 0, 0.5)"

        // Style the link directly
        poweredLink.style.color = "inherit"
        poweredLink.style.textDecoration = "none"
        poweredLink.style.transition = "all 0.2s ease"
        poweredLink.style.borderRadius = "8px"
        poweredLink.style.padding = "6px 12px"
        poweredLink.style.background = "rgba(255, 255, 255, 0.05)"
        poweredLink.style.backdropFilter = "blur(10px)"
        poweredLink.style.border = "1px solid rgba(255, 255, 255, 0.1)"

        poweredLink.onmouseover = () => {
            poweredLink.style.color = "rgba(255, 255, 255, 0.9)"
            poweredLink.style.background = "rgba(255, 255, 255, 0.1)"
            poweredLink.style.borderColor = "rgba(255, 255, 255, 0.2)"
            poweredLink.style.transform = "translateY(-1px)"
            poweredLink.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.3)"
        }
        poweredLink.onmouseleave = () => {
            poweredLink.style.color = "rgba(255, 255, 255, 0.5)"
            poweredLink.style.background = "rgba(255, 255, 255, 0.05)"
            poweredLink.style.borderColor = "rgba(255, 255, 255, 0.1)"
            poweredLink.style.transform = "translateY(0)"
            poweredLink.style.boxShadow = "none"
        }
        container.appendChild(powered)

        document.body.appendChild(container)

        // Now fetch token details asynchronously and update the modal
        if (type === "confirm-tx") {
            const data = payload.transaction || payload.dataItem

            if (data && data.target) {
                try {
                    const tokenDetails = await getTokenDetails(data.target)

                    // Update the modal with token details
                    const enhancedPayload = { ...payload, tokenDetails }
                    const updatedModal = createModal(type, enhancedPayload, (result) => {
                        // Remove the modal container from the DOM after callback
                        if (container.parentNode) {
                            container.parentNode.removeChild(container)
                        }
                        callback(result)
                    })

                    // Replace the existing modal content (keep powered by element)
                    container.replaceChild(updatedModal, modal)

                } catch (error) {
                    console.warn("[wauth] Failed to fetch token details:", error)
                    // Modal continues to work without token details
                }
            }
        }
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

        // Small delay to ensure OAuth process is fully completed
        await new Promise(resolve => setTimeout(resolve, 100));

        // Verify backend connectivity
        try {
            const response = await fetch(`${this.backendUrl}/`);
            if (!response.ok) {
                throw new Error(`Backend not accessible: ${response.status}`);
            }
        } catch (error) {
            console.error("Backend connectivity check failed:", error);
            throw new Error("Cannot connect to backend server. Please try again later.");
        }

        try {
            // Check if user has an existing wallet
            const existingWallet = await this.checkExistingWallet();

            if (existingWallet) {
                // Existing user - ask for password to decrypt wallet
                const password = prompt("Enter your master password to decrypt your wallet:");
                if (!password) {
                    throw new Error("Password required to access existing wallet");
                }

                // Verify password before storing it
                const isValidPassword = await this.verifyPassword(password);
                if (!isValidPassword) {
                    throw new Error("Invalid password. Please check your password and try again.");
                }

                // Store password in session for future use
                this.sessionPassword = password;
                await this.storePasswordInSession(password);

                // Get wallet (password is already verified)
                this.wallet = await this.getWallet();
            } else {
                // New user - ask for password to create wallet
                const password = prompt("Create a master password for your new wallet:");
                if (!password) {
                    throw new Error("Password required to create wallet");
                }

                const confirmPassword = prompt("Confirm your master password:");
                if (password !== confirmPassword) {
                    throw new Error("Passwords do not match");
                }

                // Store password in session
                this.sessionPassword = password;
                await this.storePasswordInSession(password);

                // Create new wallet
                this.wallet = await this.getWallet();
            }

            if (!this.wallet) {
                console.error("[wauth] no wallet found")
                throw new Error("Failed to create or access wallet")
            }
        } catch (e) {
            console.error("[wauth]", e)
            // Clear session password on error
            this.clearSessionPassword();
            throw e;
        }

        return this.getAuthData();
    }

    private async checkExistingWallet(): Promise<boolean> {
        try {
            // Ensure we have a user record
            if (!this.pb.authStore.record?.id) {
                return false;
            }

            const userId = this.pb.authStore.record.id;

            // Use getList instead of getFirstListItem to avoid 404 when no records exist
            const result = await this.pb.collection("wallets").getList(1, 1, {
                filter: `user.id = "${userId}"`
            });

            return result.totalItems > 0;
        } catch (e) {
            console.error("Error checking for existing wallet:", e);
            return false;
        }
    }

    private async verifyPassword(password: string): Promise<boolean> {
        try {
            // Encrypt password for backend
            const encryptedPassword = await PasswordEncryption.encryptPassword(password, this.backendUrl);

            // Call verification endpoint
            const response = await fetch(`${this.backendUrl}/verify-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'encrypted-password': encryptedPassword,
                    'Authorization': `Bearer ${this.getAuthToken()}`
                }
            });

            if (!response.ok) {
                return false;
            }

            const result = await response.json();
            return result.valid === true;
        } catch (error) {
            console.error("Password verification failed:", error);
            return false;
        }
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
        if (!this.isLoggedIn()) {
            return null;
        }

        if (!this.sessionPassword) {
            throw new Error("Session password not available - please reconnect");
        }

        // Ensure we have a user record
        if (!this.pb.authStore.record?.id) {
            throw new Error("User record not available - please log in again");
        }

        const userId = this.pb.authStore.record.id;

        try {
            // Use getList instead of getFirstListItem to avoid 404 when no records exist
            const result = await this.pb.collection("wallets").getList(1, 1, {
                filter: `user.id = "${userId}"`
            });

            if (result.totalItems > 0) {
                // Existing wallet found
                this.wallet = result.items[0];
                return this.wallet;
            } else {
                // No wallet exists, create one
                const encryptedPassword = await PasswordEncryption.encryptPassword(this.sessionPassword, this.backendUrl);
                const encryptedConfirmPassword = await PasswordEncryption.encryptPassword(this.sessionPassword, this.backendUrl);

                await this.pb.collection("wallets").create({}, {
                    headers: {
                        "encrypted-password": encryptedPassword,
                        "encrypted-confirm-password": encryptedConfirmPassword
                    }
                });

                // Use getList instead of getFirstListItem to avoid 404 if creation failed
                const createdResult = await this.pb.collection("wallets").getList(1, 1, {
                    filter: `user.id = "${userId}"`
                });

                if (createdResult.totalItems === 0) {
                    throw new Error("Failed to create wallet - no record found after creation");
                }

                this.wallet = createdResult.items[0];
                return this.wallet;
            }
        } catch (e: any) {
            if (`${e}`.includes("autocancelled")) return null

            // Check if this is a password-related error
            if (e.message && e.message.includes("decrypt") || e.message.includes("password")) {
                this.clearSessionPassword(); // Clear invalid password
                throw new Error("Invalid password - please reconnect and try again");
            }

            console.error("Error in getWallet:", e.message || e);
            throw e; // Re-throw to preserve error handling in connect()
        }
    }

    public async getConnectedWallets() {
        const res = await this.pb.collection("connected_wallets").getFullList({
            filter: `user.id = "${this.pb.authStore.record?.id}"`
        })
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

            return { success: true, walletId }
        } catch (error) {
            console.error("Error removing connected wallet:", error)
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

    public getWauthSigner(): WauthSigner {
        return new WauthSigner(this)
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

    public hasSessionPassword(): boolean {
        return this.sessionPassword !== null;
    }

    public async refreshWallet(): Promise<void> {
        if (this.isLoggedIn() && this.sessionPassword) {
            try {
                this.wallet = await this.getWallet();
            } catch (error) {
                console.error("Failed to refresh wallet:", error);
                throw error;
            }
        }
    }

    public logout() {
        this.authData = null;
        this.wallet = null;
        this.authRecord = null;
        this.clearSessionPassword(); // Clear session password and storage
        this.pb.authStore.clear();
    }
}