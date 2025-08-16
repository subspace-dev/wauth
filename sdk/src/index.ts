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
import { createModal, createModalContainer, HTMLSanitizer } from "./modal-helper";
import { dryrun } from "@permaweb/aoconnect";
import { wauthLogger, loggedWAuthOperation } from "./logger";

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
    errorMessage?: string
}
export type { ModalPayload }

type ModalResult = {
    proceed: boolean,
    password?: string
}
export type { ModalResult }

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
    private sessionPasswordLoading: boolean = false; // Prevent multiple simultaneous loading attempts
    private modalInProgress: boolean = false; // Prevent multiple modals from showing simultaneously

    private async initializeSessionKey(): Promise<CryptoKey> {
        if (this.sessionKey) return this.sessionKey;

        // Try to load existing session key
        const storedKey = localStorage.getItem('wauth_session_key');
        if (storedKey) {
            try {
                const keyData = JSON.parse(storedKey);
                // Check if the key has expired (3 hours)
                if (keyData.timestamp && Date.now() - keyData.timestamp > 3 * 60 * 60 * 1000) {
                    // Key has expired, remove it
                    localStorage.removeItem('wauth_session_key');
                    localStorage.removeItem('wauth_encrypted_password');
                    throw new Error('Session key expired');
                }
                this.sessionKey = await crypto.subtle.importKey(
                    'jwk',
                    keyData.key,
                    { name: 'AES-GCM' },
                    false,
                    ['encrypt', 'decrypt']
                );
                return this.sessionKey;
            } catch (error) {
                // If key loading fails or is expired, generate a new one
                localStorage.removeItem('wauth_session_key');
                localStorage.removeItem('wauth_encrypted_password');
            }
        }

        // Generate new session key
        this.sessionKey = await crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );

        // Store the key with timestamp
        const exportedKey = await crypto.subtle.exportKey('jwk', this.sessionKey);
        const keyData = {
            key: exportedKey,
            timestamp: Date.now()
        };
        localStorage.setItem('wauth_session_key', JSON.stringify(keyData));

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

            // Store encrypted password with IV and timestamp
            const encryptedData = {
                encrypted: Array.from(new Uint8Array(encrypted)),
                iv: Array.from(iv),
                timestamp: Date.now()
            };

            localStorage.setItem('wauth_encrypted_password', JSON.stringify(encryptedData));
        } catch (error) {
            wauthLogger.simple('error', 'Failed to store password in session', error);
        }
    }

    public hasSessionStorageData(): boolean {
        if (typeof window === 'undefined') return false;

        const hasEncryptedPassword = localStorage.getItem('wauth_encrypted_password') !== null;
        const hasSessionKey = localStorage.getItem('wauth_session_key') !== null;

        // Check if data exists and is not expired
        if (hasEncryptedPassword && hasSessionKey) {
            try {
                const keyData = JSON.parse(localStorage.getItem('wauth_session_key')!);
                const passwordData = JSON.parse(localStorage.getItem('wauth_encrypted_password')!);

                const keyExpired = keyData.timestamp && Date.now() - keyData.timestamp > 3 * 60 * 60 * 1000;
                const passwordExpired = passwordData.timestamp && Date.now() - passwordData.timestamp > 3 * 60 * 60 * 1000;

                if (keyExpired || passwordExpired) {
                    // Clear expired data
                    localStorage.removeItem('wauth_session_key');
                    localStorage.removeItem('wauth_encrypted_password');
                    return false;
                }

                return true;
            } catch (error) {
                // If there's any error parsing the data, consider it invalid
                localStorage.removeItem('wauth_session_key');
                localStorage.removeItem('wauth_encrypted_password');
                return false;
            }
        }

        return false;
    }

    private async loadPasswordFromSession(): Promise<string | null> {
        if (typeof window === 'undefined') return null;

        try {
            const storedData = localStorage.getItem('wauth_encrypted_password');
            if (!storedData) return null;

            const { encrypted, iv, timestamp } = JSON.parse(storedData);

            // Check if password data has expired (3 hours)
            if (timestamp && Date.now() - timestamp > 3 * 60 * 60 * 1000) {
                wauthLogger.simple('info', 'Stored password has expired');
                localStorage.removeItem('wauth_encrypted_password');
                localStorage.removeItem('wauth_session_key');
                return null;
            }

            const sessionKey = await this.initializeSessionKey();
            // If initializeSessionKey didn't throw (which it would if expired), proceed with decryption

            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: new Uint8Array(iv) },
                sessionKey,
                new Uint8Array(encrypted)
            );

            const decoder = new TextDecoder();
            return decoder.decode(decrypted);
        } catch (error) {
            wauthLogger.simple('error', 'Failed to load password from session', error);
            // Clear invalid data
            localStorage.removeItem('wauth_encrypted_password');
            localStorage.removeItem('wauth_session_key');
            return null;
        }
    }

    private clearSessionPassword(): void {
        if (typeof window !== 'undefined') {
            localStorage.removeItem('wauth_encrypted_password');
            localStorage.removeItem('wauth_session_key');
        }
        this.sessionPassword = null;
        this.sessionKey = null;
    }

    private clearAllAuthData(clearLocalStorage: boolean = true): void {
        // Clear session password and storage
        this.clearSessionPassword();

        // Clear PocketBase auth data
        this.pb.authStore.clear();

        // Clear additional localStorage items if any
        if (typeof window !== 'undefined' && clearLocalStorage) {
            // Clear any PocketBase auth data from localStorage
            // localStorage.removeItem('pocketbase_auth');
            // Clear any other wauth-related items
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('wauth_')) {
                    localStorage.removeItem(key);
                }
            });
        }

        // Reset instance variables
        this.authData = null;
        this.wallet = null;
        this.authRecord = null;

        wauthLogger.simple('info', 'Cleared all authentication data');
    }

    // Method to check if backend is accessible
    private async isBackendAccessible(): Promise<boolean> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

            const response = await fetch(`${this.backendUrl}/`, {
                method: 'HEAD',
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            return response.ok;
        } catch (error) {
            wauthLogger.simple('warn', 'Backend accessibility check failed', error);
            return false;
        }
    }

    constructor({ dev = false, url, backendUrl }: { dev?: boolean, url?: string, backendUrl?: string }) {
        this.pb = new PocketBase(url || (dev ? WAuth.devUrl : WAuth.prodUrl));
        this.backendUrl = backendUrl || (dev ? WAuth.devBackendUrl : WAuth.prodBackendUrl);
        this.authData = null;
        this.wallet = null;
        this.authRecord = null;
        this.sessionPassword = null;
        this.sessionKey = null;

        wauthLogger.initialization('Initializing', {
            dev,
            url: url || (dev ? WAuth.devUrl : WAuth.prodUrl),
            backendUrl: this.backendUrl
        });

        // Ensure PocketBase auth state is properly restored
        if (typeof window !== 'undefined') {
            // Check if there's existing PocketBase auth data in localStorage
            const existingAuth = localStorage.getItem('pocketbase_auth');
            wauthLogger.simple('info', `Checking for existing auth: ${!!existingAuth ? 'Found' : 'Not found'}`);
            if (existingAuth) {
                try {
                    // Try to restore the auth state
                    const authData = JSON.parse(existingAuth);
                    if (authData && authData.token && authData.model) {
                        // Set the auth data in PocketBase
                        this.pb.authStore.save(authData.token, authData.model);
                        wauthLogger.sessionUpdate('Restored', { userId: authData.model?.id });
                    } else {
                        wauthLogger.simple('warn', 'Existing auth data found but invalid format');
                    }
                } catch (error) {
                    wauthLogger.simple('warn', 'Failed to restore PocketBase auth state', error);
                    // Don't clear the auth data on parse error, let PocketBase handle it
                }
            }
        }

        // Load password from session storage on initialization
        if (typeof window !== 'undefined' && this.hasSessionStorageData()) {
            this.sessionPasswordLoading = true;
            this.loadPasswordFromSession().then(async password => {
                if (password) {
                    this.sessionPassword = password;
                    // Try to load wallet if user is already authenticated
                    if (this.isLoggedIn()) {
                        try {
                            this.wallet = await this.getWallet();
                        } catch (error) {
                            wauthLogger.simple('warn', 'Could not load wallet after session restore', error);
                        }
                    }
                }
                this.sessionPasswordLoading = false;
            }).catch(error => {
                wauthLogger.simple('error', 'Failed to load session password', error);
                this.sessionPasswordLoading = false;
            });
        }

        this.pb.authStore.onChange(async (token, record) => {
            this.authRecord = record;
            this.authData = this.getAuthData();

            // Only try to get wallet if we have a session password
            // This prevents the race condition during connect()
            if (this.sessionPassword) {
                try {
                    this.wallet = await this.getWallet();
                } catch (error) {
                    wauthLogger.simple('warn', 'Could not get wallet in auth change handler', error);
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
            // Ask for the password again instead of throwing an error
            wauthLogger.simple('info', 'Session password not available, requesting from user');
            let passwordResult: ModalResult;
            let attempts = 0;
            const maxAttempts = 3;
            let errorMessage = "Session expired. Please enter your password again.";

            do {
                wauthLogger.passwordOperation(`action password prompt`, true, attempts + 1);
                passwordResult = await new Promise<ModalResult>((resolve) => {
                    this.createModal("password-existing", { errorMessage }, resolve);
                });

                if (!passwordResult.proceed || !passwordResult.password) {
                    wauthLogger.passwordOperation('entry cancelled', false);
                    throw new Error("[wauth] Password required to continue");
                }

                // CRITICAL: Verify password with backend
                wauthLogger.passwordOperation(`verification started`, true, attempts + 1);
                const isValidPassword = await this.verifyPassword(passwordResult.password);
                if (isValidPassword) {
                    wauthLogger.passwordOperation('verification passed', true);
                    break; // Password is valid, exit loop
                } else {
                    wauthLogger.passwordOperation(`verification failed`, false, attempts + 1);
                }

                attempts++;
                if (attempts >= maxAttempts) {
                    throw new Error("Too many failed password attempts. Please try again later.");
                }

                // Set error message for next modal display
                errorMessage = `Invalid password. Please try again. (${maxAttempts - attempts} attempts remaining)`;
            } while (attempts < maxAttempts);

            wauthLogger.sessionUpdate('Storing verified password for action');
            this.sessionPassword = passwordResult.password;
            await this.storePasswordInSession(passwordResult.password);
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
        // Prevent multiple modals from showing simultaneously
        if (this.modalInProgress) {
            wauthLogger.simple('warn', 'Modal already in progress, ignoring new modal request');
            return;
        }
        this.modalInProgress = true;

        // Create a wrapped callback that cleans up the modal flag
        const wrappedCallback = (result: ModalResult) => {
            this.modalInProgress = false;
            callback(result);
        };

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
            wrappedCallback(result)
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

        // Set up focus management after modal is fully added to DOM
        if ((modal as any)._setupFocus) {
            // Use requestAnimationFrame to ensure modal is fully rendered
            requestAnimationFrame(() => {
                (modal as any)._setupFocus();
            });
        }

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

                    // Set up focus management for the updated modal
                    if ((updatedModal as any)._setupFocus) {
                        requestAnimationFrame(() => {
                            (updatedModal as any)._setupFocus();
                        });
                    }

                } catch (error) {
                    wauthLogger.simple('warn', 'Failed to fetch token details', error)
                    // Modal continues to work without token details
                }
            }
        }
    }

    public async connect({ provider, scopes }: { provider: WAuthProviders, scopes?: string[] }) {
        if (!Object.values(WAuthProviders).includes(provider)) throw new Error(`Invalid provider: ${provider}. Valid providers are: ${Object.values(WAuthProviders).join(", ")}`)

        wauthLogger.authStart('OAuth Authentication', provider, { provider, scopes });

        try {
            this.authData = await this.pb.collection("users").authWithOAuth2({ provider, scopes })
            this.authDataListeners.forEach(listener => listener(this.getAuthData()));
        } catch (e) {
            wauthLogger.authError('OAuth Authentication', e);
            return null;
        }

        if (!this.isLoggedIn()) return null;

        // Small delay to ensure OAuth process is fully completed
        await new Promise(resolve => setTimeout(resolve, 100));

        // Verify backend connectivity
        try {
            const response = await fetch(`${this.backendUrl}/`);
            wauthLogger.backendRequest('GET', '/', response.status);
            if (!response.ok) {
                throw new Error(`Backend not accessible: ${response.status}`);
            }
        } catch (error) {
            wauthLogger.simple('error', 'Backend connectivity check failed', error);
            throw new Error("Cannot connect to backend server. Please try again later.");
        }

        try {
            // Check if user has an existing wallet
            const existingWallet = await this.checkExistingWallet();

            if (existingWallet) {
                // Existing user - ask for password to decrypt wallet using modal
                let passwordResult: ModalResult;
                let attempts = 0;
                const maxAttempts = 5; // More forgiving attempt limit
                let errorMessage = "";

                do {
                    // Progressive delay based on attempts (exponential backoff)
                    if (attempts > 0) {
                        const delayMs = Math.min(attempts * 1000, 10000); // Max 10 second delay
                        if (delayMs > 0) {
                            const delaySeconds = Math.ceil(delayMs / 1000);
                            errorMessage = `Too many failed attempts. Please wait ${delaySeconds} second${delaySeconds > 1 ? 's' : ''} before trying again.`;

                            // Show countdown in modal
                            const countdownResult = await new Promise<ModalResult>((resolve) => {
                                this.createModal("password-existing", { errorMessage }, resolve);
                            });

                            if (!countdownResult.proceed) {
                                this.clearAllAuthData(false);
                                throw new Error("Password required to access existing wallet");
                            }

                            // Wait for the delay period
                            await new Promise(resolve => setTimeout(resolve, delayMs));
                        }
                    }

                    wauthLogger.passwordOperation(`prompt shown`, true, attempts + 1);
                    passwordResult = await new Promise<ModalResult>((resolve) => {
                        this.createModal("password-existing", { errorMessage }, resolve);
                    });

                    if (!passwordResult.proceed || !passwordResult.password) {
                        wauthLogger.passwordOperation('entry cancelled', false);
                        // User cancelled - clear session data but keep PocketBase auth
                        this.clearAllAuthData(false);
                        throw new Error("Password required to access existing wallet");
                    }

                    // CRITICAL: Verify password before storing it
                    wauthLogger.passwordOperation(`verification started`, true, attempts + 1);
                    const isValidPassword = await this.verifyPassword(passwordResult.password);
                    if (isValidPassword) {
                        wauthLogger.passwordOperation('verification passed', true);
                        break; // Password is valid, exit loop
                    } else {
                        wauthLogger.passwordOperation(`verification failed`, false, attempts + 1);
                    }

                    attempts++;
                    if (attempts >= maxAttempts) {
                        const lockoutMinutes = 5;
                        errorMessage = `Too many failed password attempts. Account temporarily locked for ${lockoutMinutes} minutes. Please check your password manager or contact support if this continues.`;

                        // Show final lockout message
                        await new Promise<ModalResult>((resolve) => {
                            this.createModal("password-existing", { errorMessage }, resolve);
                        });

                        throw new Error(`Too many failed password attempts. Account temporarily locked for ${lockoutMinutes} minutes.`);
                    }

                    // Set error message for next modal display with helpful context
                    const remainingAttempts = maxAttempts - attempts;
                    errorMessage = `Invalid password. Please check your password manager or try a different password. ${remainingAttempts} attempt${remainingAttempts > 1 ? 's' : ''} remaining.`;
                } while (attempts < maxAttempts);

                // Store password in session for future use - password is already verified above
                wauthLogger.sessionUpdate('Storing verified password');
                this.sessionPassword = passwordResult.password;
                await this.storePasswordInSession(passwordResult.password);

                // Get wallet (password is already verified)
                this.wallet = await this.getWallet();
            } else {
                // New user - ask for password to create wallet using modal
                wauthLogger.simple('info', 'New user detected, requesting password for wallet creation');
                const result = await new Promise<ModalResult>((resolve) => {
                    this.createModal("password-new", {}, resolve);
                });

                if (!result.proceed || !result.password) {
                    wauthLogger.passwordOperation('new password creation cancelled', false);
                    // User cancelled - clear session data but keep PocketBase auth
                    this.clearAllAuthData(false);
                    throw new Error("Password required to create wallet");
                }

                wauthLogger.sessionUpdate('Storing new password');
                // Store password in session - new passwords don't need backend verification since no wallet exists yet
                this.sessionPassword = result.password;
                await this.storePasswordInSession(result.password);

                // Create new wallet - pass false to prevent getWallet from showing password modal
                this.wallet = await this.getWallet(false);
            }

            if (!this.wallet) {
                wauthLogger.simple('error', 'No wallet found after authentication');
                throw new Error("Failed to create or access wallet")
            }

            wauthLogger.authSuccess('OAuth Authentication', {
                userId: this.authData?.record?.id,
                walletAddress: this.wallet.address
            });
        } catch (e) {
            wauthLogger.authError('OAuth Authentication', e);
            // Clear all authentication data on error, but be more selective about localStorage
            // Only clear localStorage if it's a critical error that invalidates the auth
            const errorMessage = e instanceof Error ? e.message : String(e);
            const shouldClearLocalStorage = !!errorMessage && (
                errorMessage.includes("Token is expired") ||
                errorMessage.includes("authentication failed") ||
                errorMessage.includes("invalid token")
            );
            this.clearAllAuthData(shouldClearLocalStorage);
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
            wauthLogger.simple('error', 'Error checking for existing wallet', e);
            return false;
        }
    }

    private async verifyPassword(password: string): Promise<boolean> {
        try {
            wauthLogger.backendRequest('POST', '/verify-password');
            // First check if we're logged in
            if (!this.isLoggedIn()) {
                wauthLogger.simple('error', 'Cannot verify password: not logged in');
                return false;
            }

            // Encrypt password for backend
            const encryptedPassword = await PasswordEncryption.encryptPassword(password, this.backendUrl);
            wauthLogger.simple('info', 'Password encrypted for backend verification');

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
                wauthLogger.backendRequest('POST', '/verify-password', response.status);
                return false;
            }

            const result = await response.json();
            const isValid = result.valid === true;
            wauthLogger.simple('info', `Password verification result: ${isValid ? "VALID" : "INVALID"}`);
            return isValid;
        } catch (error) {
            wauthLogger.simple('error', 'Password verification failed', error);
            return false;
        }
    }

    // Enhanced password verification helper with debugging
    private async verifyAndStorePassword(password: string, context: string): Promise<boolean> {
        wauthLogger.simple('info', `${context}: Verifying password with backend before storing`);

        const isValidPassword = await this.verifyPassword(password);
        if (!isValidPassword) {
            wauthLogger.simple('error', `${context}: Password verification FAILED - will not store invalid password`);
            return false;
        }

        wauthLogger.sessionUpdate(`${context}: Password verification PASSED, storing in session`);
        this.sessionPassword = password;
        await this.storePasswordInSession(password);
        return true;
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
        const isValid = this.pb.authStore.isValid;
        return isValid;
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

    public async getWallet(showPasswordModal: boolean = true) {
        if (!this.isLoggedIn()) {
            return null;
        }

        // Wait for session password to be loaded if it's not available yet
        if (!this.sessionPassword && !this.sessionPasswordLoading && showPasswordModal) {
            this.sessionPasswordLoading = true;
            try {
                // Check if session storage data exists first
                if (this.hasSessionStorageData()) {
                    // Try to load from session storage
                    const sessionPassword = await this.loadPasswordFromSession();
                    if (sessionPassword) {
                        this.sessionPassword = sessionPassword;
                        wauthLogger.sessionUpdate('Password loaded from storage');
                    } else {
                        // Session storage data exists but failed to decrypt
                        wauthLogger.sessionUpdate('Failed to decrypt session password, clearing storage');
                        this.clearSessionPassword();

                        // Only show modal if explicitly requested
                        if (showPasswordModal) {
                            let passwordResult: ModalResult;
                            let attempts = 0;
                            const maxAttempts = 3;
                            let errorMessage = "Session expired. Please enter your password again.";

                            do {
                                wauthLogger.passwordOperation(`session expired prompt`, true, attempts + 1);
                                passwordResult = await new Promise<ModalResult>((resolve) => {
                                    this.createModal("password-existing", { errorMessage }, resolve);
                                });

                                if (!passwordResult.proceed || !passwordResult.password) {
                                    wauthLogger.passwordOperation('entry cancelled', false);
                                    throw new Error("[wauth] Password required to access wallet");
                                }

                                // CRITICAL: Verify password with backend
                                wauthLogger.passwordOperation(`verification started`, true, attempts + 1);
                                const isValidPassword = await this.verifyPassword(passwordResult.password);
                                if (isValidPassword) {
                                    wauthLogger.passwordOperation('verification passed', true);
                                    break; // Password is valid, exit loop
                                } else {
                                    wauthLogger.passwordOperation(`verification failed`, false, attempts + 1);
                                }

                                attempts++;
                                if (attempts >= maxAttempts) {
                                    throw new Error("Too many failed password attempts. Please try again later.");
                                }

                                // Set error message for next modal display
                                errorMessage = `Invalid password. Please try again. (${maxAttempts - attempts} attempts remaining)`;
                            } while (attempts < maxAttempts);

                            wauthLogger.sessionUpdate('Storing verified password');
                            this.sessionPassword = passwordResult.password;
                            await this.storePasswordInSession(passwordResult.password);
                        } else {
                            // Don't show modal, just return null
                            wauthLogger.simple('info', 'Session password unavailable, not showing modal');
                            this.sessionPasswordLoading = false;
                            return null;
                        }
                    }
                } else {
                    // No session storage data exists
                    wauthLogger.simple('info', 'No session storage data found');
                    if (showPasswordModal) {
                        let passwordResult: ModalResult;
                        let attempts = 0;
                        const maxAttempts = 3;
                        let errorMessage = "Please enter your password to access your wallet.";

                        do {
                            wauthLogger.passwordOperation(`no session data prompt`, true, attempts + 1);
                            passwordResult = await new Promise<ModalResult>((resolve) => {
                                this.createModal("password-existing", { errorMessage }, resolve);
                            });

                            if (!passwordResult.proceed || !passwordResult.password) {
                                wauthLogger.passwordOperation('entry cancelled', false);
                                throw new Error("[wauth] Password required to access wallet");
                            }

                            // CRITICAL: Verify password with backend
                            wauthLogger.passwordOperation(`verification started`, true, attempts + 1);
                            const isValidPassword = await this.verifyPassword(passwordResult.password);
                            if (isValidPassword) {
                                wauthLogger.passwordOperation('verification passed', true);
                                break; // Password is valid, exit loop
                            } else {
                                wauthLogger.passwordOperation(`verification failed`, false, attempts + 1);
                            }

                            attempts++;
                            if (attempts >= maxAttempts) {
                                throw new Error("Too many failed password attempts. Please try again later.");
                            }

                            // Set error message for next modal display
                            errorMessage = `Invalid password. Please try again. (${maxAttempts - attempts} attempts remaining)`;
                        } while (attempts < maxAttempts);

                        wauthLogger.sessionUpdate('Storing verified password');
                        this.sessionPassword = passwordResult.password;
                        await this.storePasswordInSession(passwordResult.password);
                    } else {
                        // Don't show modal, just return null
                        wauthLogger.simple('info', 'No session data and not showing modal');
                        this.sessionPasswordLoading = false;
                        return null;
                    }
                }
            } finally {
                this.sessionPasswordLoading = false;
            }
        } else if (!this.sessionPassword && this.sessionPasswordLoading) {
            // Wait for the loading to complete with timeout
            wauthLogger.simple('info', 'Waiting for concurrent session password loading...');
            const maxWaitTime = 5000; // 5 seconds max wait
            const startTime = Date.now();

            while (this.sessionPasswordLoading && (Date.now() - startTime) < maxWaitTime) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            if (this.sessionPasswordLoading) {
                wauthLogger.simple('warn', 'Session password loading timeout, proceeding anyway');
                this.sessionPasswordLoading = false;
            }
        }

        // Ensure we have a user record
        if (!this.pb.authStore.record?.id) {
            throw new Error("[wauth] User record not available - please log in again");
        }

        const userId = this.pb.authStore.record.id;

        try {
            // Use getList instead of getFirstListItem to avoid 404 when no records exist
            const result = await this.pb.collection("wallets").getList(1, 1, {
                filter: `user.id = "${userId}"`
            });

            wauthLogger.walletOperation('Query', { userId, walletsFound: result.totalItems });

            if (result.totalItems > 0) {
                // Existing wallet found
                wauthLogger.walletOperation('Using existing wallet', { walletId: result.items[0].id });
                this.wallet = result.items[0];
                return this.wallet;
            } else {
                // No wallet exists, create one
                wauthLogger.walletOperation('Creating new wallet', { userId });

                // Double-check that no wallet exists before creating (prevent race conditions)
                const doubleCheckResult = await this.pb.collection("wallets").getList(1, 1, {
                    filter: `user.id = "${userId}"`
                });

                if (doubleCheckResult.totalItems > 0) {
                    wauthLogger.walletOperation('Using wallet created by another process', { walletId: doubleCheckResult.items[0].id });
                    this.wallet = doubleCheckResult.items[0];
                    return this.wallet;
                }

                if (!this.sessionPassword) {
                    throw new Error("[wauth] Session password not available");
                }
                const encryptedPassword = await PasswordEncryption.encryptPassword(this.sessionPassword, this.backendUrl);
                const encryptedConfirmPassword = await PasswordEncryption.encryptPassword(this.sessionPassword, this.backendUrl);

                wauthLogger.backendRequest('POST', '/wallets');
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
                    throw new Error("[wauth] Failed to create wallet - no record found after creation");
                }

                wauthLogger.walletOperation('Successfully created wallet', { walletId: createdResult.items[0].id });
                this.wallet = createdResult.items[0];
                return this.wallet;
            }
        } catch (e: any) {
            if (`${e}`.includes("autocancelled")) return null

            // Check if this is a password-related error
            if (e.message && e.message.includes("decrypt") || e.message.includes("password")) {
                this.clearSessionPassword(); // Clear invalid password
                throw new Error("[wauth] Invalid password - please reconnect and try again");
            }

            wauthLogger.simple('error', 'Error in getWallet', e.message || e);
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
                throw new Error("[wauth]    Wallet not found or not owned by current user")
            }

            // Delete the wallet record
            await this.pb.collection("connected_wallets").delete(walletId)

            return { success: true, walletId }
        } catch (error) {
            wauthLogger.simple('error', 'Error removing connected wallet', error)
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
        if (options) wauthLogger.simple('warn', 'Signature options are not supported yet')

        return await this.runAction(WalletActions.SIGN, { transaction: transaction.toJSON() })
    }

    public async signature(data: Uint8Array, algorithm?: AlgorithmIdentifier | RsaPssParams | EcdsaParams): Promise<Uint8Array> {
        if (algorithm) {
            wauthLogger.simple('warn', 'Signature algorithm is not supported and Rsa4096Pss will be used by default')
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

    public isSessionPasswordLoading(): boolean {
        return this.sessionPasswordLoading;
    }

    public hasStoredSessionData(): boolean {
        return this.hasSessionStorageData();
    }

    public async refreshWallet(): Promise<void> {
        if (this.isLoggedIn() && this.sessionPassword) {
            try {
                this.wallet = await this.getWallet(false); // Don't show password modal during refresh
            } catch (error) {
                wauthLogger.simple('error', 'Failed to refresh wallet', error);
                throw error;
            }
        }
    }

    public logout() {
        this.clearAllAuthData();
    }
}

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
            wauthLogger.simple('error', 'Failed to get backend public key', error);
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
            wauthLogger.simple('error', 'Password encryption failed', error);
            throw new Error("Failed to encrypt password: " + (error as Error).message);
        }
    }
}

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
            wauthLogger.simple('error', 'Failed to set initial public key', error);
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
            wauthLogger.simple('error', 'Failed to set public key', error);
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
            wauthLogger.simple('error', 'Sign operation failed', error);
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
            wauthLogger.simple('error', 'Verify operation failed', error?.message || "Unknown error");
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