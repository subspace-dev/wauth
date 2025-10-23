import { useActiveAddress, useApi, useConnection, ConnectButton } from "@arweave-wallet-kit/react"
import { fixConnection } from "@wauth/strategy"
import { useEffect, useState } from "react"

interface SettingsPageProps {
    navigate: (route: string) => void;
}

export default function SettingsPage({ navigate }: SettingsPageProps) {
    const address = useActiveAddress()
    const api = useApi()
    const [isWalletEncrypted, setIsWalletEncrypted] = useState<boolean | null>(null)
    const [encryptionPassword, setEncryptionPassword] = useState<string>("")
    const [confirmPassword, setConfirmPassword] = useState<string>("")
    const [isEncrypting, setIsEncrypting] = useState(false)
    const [passwordStep, setPasswordStep] = useState<'enter' | 'confirm' | 'verify'>('enter')
    const [passwordErrors, setPasswordErrors] = useState<string[]>([])

    const { connected, disconnect } = useConnection()

    // without this, on refresh the wallet shows the connected UI even if its disconnected
    useEffect(() => fixConnection(address, connected, disconnect), [address, connected, disconnect])

    useEffect(() => {
        if (connected && address && api) {
            // Check wallet encryption status
            setIsWalletEncrypted(api.isWalletEncrypted())
        }
    }, [connected, address, api])

    // Password validation function
    function validatePassword(password: string): string[] {
        const errors: string[] = []

        if (password.length < 8) {
            errors.push("Password must be at least 8 characters long")
        }
        if (password.length > 128) {
            errors.push("Password must be less than 128 characters")
        }
        if (!/[a-z]/.test(password)) {
            errors.push("Password must contain at least one lowercase letter")
        }
        if (!/[A-Z]/.test(password)) {
            errors.push("Password must contain at least one uppercase letter")
        }
        if (!/[0-9]/.test(password)) {
            errors.push("Password must contain at least one number")
        }
        if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
            errors.push("Password must contain at least one special character")
        }

        return errors
    }

    // Check individual password requirements
    function checkPasswordRequirement(password: string, type: 'length' | 'lowercase' | 'uppercase' | 'number' | 'special'): boolean {
        switch (type) {
            case 'length':
                return password.length >= 8 && password.length <= 128
            case 'lowercase':
                return /[a-z]/.test(password)
            case 'uppercase':
                return /[A-Z]/.test(password)
            case 'number':
                return /[0-9]/.test(password)
            case 'special':
                return /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
            default:
                return false
        }
    }

    // Check if all password requirements are met
    function areAllRequirementsMet(password: string): boolean {
        return checkPasswordRequirement(password, 'length') &&
            checkPasswordRequirement(password, 'lowercase') &&
            checkPasswordRequirement(password, 'uppercase') &&
            checkPasswordRequirement(password, 'number') &&
            checkPasswordRequirement(password, 'special')
    }

    async function handlePasswordSubmit() {
        if (passwordStep === 'enter') {
            // Move to confirm step
            setPasswordStep('confirm')
            setConfirmPassword("")
        } else if (passwordStep === 'confirm') {
            // Check if passwords match
            if (encryptionPassword !== confirmPassword) {
                alert("Passwords do not match. Please try again.")
                return
            }

            setPasswordStep('verify')
            setConfirmPassword("")
        } else if (passwordStep === 'verify') {
            // Final verification - check if user entered the same password
            if (encryptionPassword !== confirmPassword) {
                alert("Password verification failed. Please try again.")
                setPasswordStep('enter')
                setEncryptionPassword("")
                setConfirmPassword("")
                return
            }

            // All checks passed, proceed with encryption
            await encryptWallet()
        }
    }

    async function encryptWallet() {
        try {
            setIsEncrypting(true)
            await api.encryptWallet(encryptionPassword)
            setIsWalletEncrypted(true)

            // Clear all password fields and reset state
            setEncryptionPassword("")
            setConfirmPassword("")
            setPasswordStep('enter')

            alert("Wallet encrypted successfully! You will now be logged out to test the encryption.")

            // Logout and reconnect to test encryption
            await disconnect()
            setTimeout(() => {
                window.location.reload() // Force page reload to test encryption
            }, 1000)

        } catch (error) {
            console.error("Encryption error:", error)
            alert(`Failed to encrypt wallet: ${error}`)
            setPasswordStep('enter')
            setEncryptionPassword("")
            setConfirmPassword("")
        } finally {
            setIsEncrypting(false)
        }
    }

    function resetPasswordFlow() {
        setPasswordStep('enter')
        setEncryptionPassword("")
        setConfirmPassword("")
    }

    if (!connected || !address) {
        return (
            <div className="app">
                <div className="container">
                    <header className="header">
                        <h1 className="title">WAuth Wallet Encryption</h1>
                        <p className="subtitle">Please connect your wallet to access encryption settings</p>
                    </header>
                    <main className="main">
                        <div className="connect-section">
                            <ConnectButton />
                        </div>
                    </main>
                </div>
            </div>
        )
    }

    return (
        <div className="app">
            <div className="container">
                <header className="header">
                    <h1 className="title">🔐 Wallet Security</h1>
                    <p className="subtitle">Keep your wallet safe and secure</p>
                </header>

                <main className="main">
                    <div className="connect-section">
                        <button className="btn" style={{ position: 'absolute', left: '16px', top: '16px' }} onClick={() => navigate('home')}>home</button>
                        <ConnectButton />
                        {connected && <button className="reconnect-btn" onClick={() => api.reconnect()}>🔄</button>}
                    </div>

                    {/* Current Wallet Status */}
                    <div className="status-banner">
                        <div className={`status-card ${isWalletEncrypted ? 'secure' : 'warning'}`}>
                            <div className="status-icon">
                                {isWalletEncrypted === null ? '⏳' : isWalletEncrypted ? '🔒' : '🔓'}
                            </div>
                            <div className="status-content">
                                <h3>
                                    {isWalletEncrypted === null ? 'Checking...' :
                                        isWalletEncrypted ? 'Your wallet is secure!' : 'Your wallet can be protected'}
                                </h3>
                                <p>
                                    {isWalletEncrypted === null ? 'Please wait while we check your wallet' :
                                        isWalletEncrypted ? 'Your wallet is protected with encryption' :
                                            'Add a password to secure your wallet'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Wallet Information */}
                    <div className="info-cards">

                        {/* Encryption Status & Action */}
                        <div className="card primary-card">
                            <h3 className="card-title">🔐 Protect Your Wallet</h3>

                            {isWalletEncrypted === false && (
                                <div className="encryption-section">
                                    <div className="friendly-info">
                                        <p>🔒 <strong>Add a password</strong> to keep your wallet safe if WAuth is ever compromised.</p>
                                    </div>

                                    <div className="encryption-form">
                                        {/* Progress Indicator */}
                                        <div className="progress-indicator">
                                            <div className="progress-steps">
                                                <div className={`step ${passwordStep === 'enter' ? 'active' : passwordStep === 'confirm' || passwordStep === 'verify' ? 'completed' : ''}`}>
                                                    <div className="step-circle">1</div>
                                                    <span className="step-label">Enter Password</span>
                                                </div>
                                                <div className={`progress-line ${passwordStep === 'confirm' || passwordStep === 'verify' ? 'completed' : ''}`}></div>
                                                <div className={`step ${passwordStep === 'confirm' ? 'active' : passwordStep === 'verify' ? 'completed' : ''}`}>
                                                    <div className="step-circle">2</div>
                                                    <span className="step-label">Confirm Password</span>
                                                </div>
                                                <div className={`progress-line ${passwordStep === 'verify' ? 'completed' : ''}`}></div>
                                                <div className={`step ${passwordStep === 'verify' ? 'active' : ''}`}>
                                                    <div className="step-circle">3</div>
                                                    <span className="step-label">Verify Password</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Password Requirements */}
                                        {passwordStep === 'enter' && <div className="password-requirements">
                                            <h4>Password Requirements:</h4>
                                            <ul>
                                                <li className={encryptionPassword.length > 0 ? (checkPasswordRequirement(encryptionPassword, 'length') ? 'requirement-met' : 'requirement-not-met') : 'requirement-neutral'}>
                                                    {encryptionPassword.length > 0 ? (checkPasswordRequirement(encryptionPassword, 'length') ? '✅' : '❌') : '•'} At least 8 characters long
                                                </li>
                                                <li className={encryptionPassword.length > 0 ? (checkPasswordRequirement(encryptionPassword, 'lowercase') && checkPasswordRequirement(encryptionPassword, 'uppercase') ? 'requirement-met' : 'requirement-not-met') : 'requirement-neutral'}>
                                                    {encryptionPassword.length > 0 ? ((checkPasswordRequirement(encryptionPassword, 'lowercase') && checkPasswordRequirement(encryptionPassword, 'uppercase')) ? '✅' : '❌') : '•'} Contains uppercase and lowercase letters
                                                </li>
                                                <li className={encryptionPassword.length > 0 ? (checkPasswordRequirement(encryptionPassword, 'number') ? 'requirement-met' : 'requirement-not-met') : 'requirement-neutral'}>
                                                    {encryptionPassword.length > 0 ? (checkPasswordRequirement(encryptionPassword, 'number') ? '✅' : '❌') : '•'} Contains at least one number
                                                </li>
                                                <li className={encryptionPassword.length > 0 ? (checkPasswordRequirement(encryptionPassword, 'special') ? 'requirement-met' : 'requirement-not-met') : 'requirement-neutral'}>
                                                    {encryptionPassword.length > 0 ? (checkPasswordRequirement(encryptionPassword, 'special') ? '✅' : '❌') : '•'} Contains at least one special character
                                                </li>
                                            </ul>
                                        </div>}

                                        {/* Step 1: Enter Password */}
                                        {passwordStep === 'enter' && (
                                            <div className="input-group">
                                                <label htmlFor="password" className="input-label">Choose a password</label>
                                                <input
                                                    id="password"
                                                    type="password"
                                                    className="input"
                                                    placeholder="Enter a strong password"
                                                    value={encryptionPassword}
                                                    onChange={(e) => setEncryptionPassword(e.target.value)}
                                                />
                                                <small className="input-hint">Make sure it meets all requirements above!</small>
                                            </div>
                                        )}

                                        {/* Step 2: Confirm Password */}
                                        {passwordStep === 'confirm' && (
                                            <>
                                                <div className="password-match-status">
                                                    {confirmPassword.length > 0 ? (
                                                        encryptionPassword === confirmPassword ? (
                                                            <div className="match-success">✅ Passwords match</div>
                                                        ) : (
                                                            <div className="match-error">❌ Passwords do not match</div>
                                                        )
                                                    ) : (
                                                        <div className="match-neutral">Please re-enter your password to confirm</div>
                                                    )}
                                                </div>
                                                <div className="input-group">
                                                    <label htmlFor="confirm-password" className="input-label">Confirm your password</label>
                                                    <input
                                                        id="confirm-password"
                                                        type="password"
                                                        className="input"
                                                        placeholder="Re-enter your password"
                                                        value={confirmPassword}
                                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                                    />
                                                    <small className="input-hint">Please confirm your password</small>
                                                </div>
                                            </>
                                        )}

                                        {/* Step 3: Verify Password */}
                                        {passwordStep === 'verify' && (
                                            <>
                                                <div className="password-match-status">
                                                    {confirmPassword.length > 0 ? (
                                                        encryptionPassword === confirmPassword ? (
                                                            <div className="match-success">✅ Password verification successful</div>
                                                        ) : (
                                                            <div className="match-error">❌ Password verification failed</div>
                                                        )
                                                    ) : (
                                                        <div className="match-neutral">Enter your password one more time for final verification</div>
                                                    )}
                                                </div>
                                                <div className="input-group">
                                                    <label htmlFor="verify-password" className="input-label">Verify your password</label>
                                                    <input
                                                        id="verify-password"
                                                        type="password"
                                                        className="input"
                                                        placeholder="Enter your password one more time"
                                                        value={confirmPassword}
                                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                                    />
                                                    <small className="input-hint">Final verification - enter your password again</small>
                                                </div>
                                            </>
                                        )}


                                        {/* Action Buttons */}
                                        <div className="form-actions">
                                            <button
                                                className="btn btn-primary"
                                                onClick={handlePasswordSubmit}
                                                disabled={isEncrypting ||
                                                    (passwordStep === 'enter' && (!encryptionPassword.trim() || !areAllRequirementsMet(encryptionPassword))) ||
                                                    (passwordStep === 'confirm' && (!confirmPassword.trim() || encryptionPassword !== confirmPassword)) ||
                                                    (passwordStep === 'verify' && (!confirmPassword.trim() || encryptionPassword !== confirmPassword))}
                                            >
                                                {isEncrypting ? "🔄 Encrypting..." :
                                                    passwordStep === 'enter' ? "Next: Confirm Password" :
                                                        passwordStep === 'confirm' ? "Next: Verify Password" :
                                                            "🔒 Encrypt Wallet"}
                                            </button>

                                            {passwordStep !== 'enter' && (
                                                <button
                                                    className="start-over-link"
                                                    onClick={resetPasswordFlow}
                                                    disabled={isEncrypting}
                                                >
                                                    ← Start Over
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {isWalletEncrypted === true && (
                                <div className="success-box">
                                    <h4>✅ All Set!</h4>
                                    <p>Your wallet is now encrypted. It will stay safe even if WAuth is compromised!</p>
                                </div>
                            )}
                        </div>

                        {/* Simple Comparison */}
                        <div className="card comparison-card">
                            <h3 className="card-title">💡 Why encrypt your wallet?</h3>

                            <div className="simple-comparison">
                                <div className="comparison-item secure">
                                    <div className="comparison-icon">🔒</div>
                                    <div className="comparison-content">
                                        <h4>With Password Protection</h4>
                                        <ul>
                                            <li>✅ Your wallet stays encrypted if WAuth is compromised</li>
                                            <li>✅ Extra layer of security for your private keys</li>
                                            <li>✅ Secure backups you can store anywhere</li>
                                            <li>⚠️ You'll need to enter your password each time you use the wallet</li>
                                            <li>⚠️ If you forget your password, you'll lose access to your wallet</li>
                                        </ul>
                                    </div>
                                </div>

                                <div className="comparison-item warning">
                                    <div className="comparison-icon">🔓</div>
                                    <div className="comparison-content">
                                        <h4>Without Password Protection</h4>
                                        <ul>
                                            <li>✅ Quick access - no password needed</li>
                                            <li>✅ No risk of forgetting your password</li>
                                            <li>⚠️ If WAuth is compromised, your wallet could be at risk</li>
                                            <li>⚠️ Less protection for your private keys</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                </main>

                <footer className="footer">
                    <div className="powered-by">
                        <p className="powered-text">Powered by <strong>WAuth</strong> - Social Auth for Arweave</p>
                    </div>
                </footer>
            </div>
        </div>
    )
}
