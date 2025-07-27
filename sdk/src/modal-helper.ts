import type { ModalTypes, ModalPayload, ModalResult } from "./index";
import { wauthLogger } from "./logger";

// Import HTMLSanitizer for safe DOM manipulation
export class HTMLSanitizer {
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
            wauthLogger.simple('warn', 'Invalid URL provided to createSafeLink', { href });
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

// Focus management for accessibility
let previouslyFocusedElement: HTMLElement | null = null;

function trapFocus(modal: HTMLElement) {
    const focusableElements = modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusableElement = focusableElements[0] as HTMLElement;
    const lastFocusableElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    function handleTab(e: KeyboardEvent) {
        if (e.key !== 'Tab') return;

        if (e.shiftKey) {
            if (document.activeElement === firstFocusableElement) {
                lastFocusableElement.focus();
                e.preventDefault();
            }
        } else {
            if (document.activeElement === lastFocusableElement) {
                firstFocusableElement.focus();
                e.preventDefault();
            }
        }
    }

    modal.addEventListener('keydown', handleTab);
    return () => modal.removeEventListener('keydown', handleTab);
}

function setInitialFocus(modal: HTMLElement) {
    // Store the previously focused element
    previouslyFocusedElement = document.activeElement as HTMLElement;

    // Focus on the first input field, or fallback to first button
    const passwordInput = modal.querySelector('input[type="password"]') as HTMLElement;
    const firstInput = modal.querySelector('input') as HTMLElement;
    const firstButton = modal.querySelector('button') as HTMLElement;

    const elementToFocus = passwordInput || firstInput || firstButton;

    if (elementToFocus) {
        // Use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
            elementToFocus.focus();
        });
    }
}

function restoreFocus() {
    if (previouslyFocusedElement) {
        previouslyFocusedElement.focus();
        previouslyFocusedElement = null;
    }
}

export function createModalContainer() {
    const div = document.createElement("div")
    div.id = "modal-container"
    div.style.fontFamily = "'Inter', sans-serif"
    div.style.position = "fixed"
    div.style.top = "0"
    div.style.left = "0"
    div.style.width = "100vw"
    div.style.height = "100vh"
    div.style.backgroundColor = "rgba(0, 0, 0, 0.6)"
    div.style.display = "flex"
    div.style.flexDirection = "column"
    div.style.justifyContent = "center"
    div.style.alignItems = "center"
    div.style.zIndex = "999999999" // Extremely high z-index to override shadcn/radix components
    div.style.backdropFilter = "blur(8px)"
    div.style.color = "#fff"
    div.style.animation = "fadeIn 0.3s ease-out"
    div.style.pointerEvents = "all" // Ensure all pointer events are captured

    // Selective event blocking - only prevent interactions with background elements
    const preventBackgroundInteraction = (e: Event) => {
        // Only prevent events if clicking directly on the background container
        if (e.target === div) {
            e.preventDefault()
            e.stopPropagation()

            // Add subtle shake animation to indicate modal can't be dismissed by clicking background
            if (e.type === 'click') {
                div.style.animation = 'none'
                div.style.animation = 'modalShake 0.3s ease-in-out'
                setTimeout(() => {
                    div.style.animation = 'fadeIn 0.3s ease-out'
                }, 300)
            }
        }
    }

    // Only block background clicks and touches, allow other interactions
    div.addEventListener('click', preventBackgroundInteraction, false)
    div.addEventListener('touchstart', preventBackgroundInteraction, false)

    // Block scroll on background to prevent page scrolling, but allow modal content scrolling
    div.addEventListener('wheel', (e: Event) => {
        const target = e.target as HTMLElement
        if (target === div || !target.closest('#modal-content')) {
            e.preventDefault()
        }
    }, { passive: false })

    // Prevent context menu only on background
    div.addEventListener('contextmenu', (e: Event) => {
        if (e.target === div) {
            e.preventDefault()
        }
    })

    // Add fade-in animation
    const style = document.createElement("style")
    style.textContent = `
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        @keyframes slideUp {
            from { 
                opacity: 0; 
                transform: translateY(20px) scale(0.95); 
            }
            to { 
                opacity: 1; 
                transform: translateY(0) scale(1); 
            }
        }
        @keyframes modalShake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-5px); }
            75% { transform: translateX(5px); }
        }
    `
    if (!document.head.querySelector('style[data-wauth-fade-animations]')) {
        style.setAttribute('data-wauth-fade-animations', 'true')
        document.head.appendChild(style)
    }

    return div
}

export function createModal(type: ModalTypes, payload: ModalPayload, onResult: (result: ModalResult) => void): HTMLDivElement {
    let modal: HTMLDivElement;
    let cleanupFocus: () => void;

    // Create wrapper that handles cleanup AFTER the original callback
    const wrappedOnResult = (result: ModalResult) => {
        wauthLogger.simple('info', 'Modal result received', { proceed: result.proceed, hasPassword: !!result.password });

        // Call original callback first
        onResult(result);

        // Then do cleanup after a longer delay to ensure modal removal completes
        setTimeout(() => {
            if (cleanupFocus) {
                console.log("[modal-helper] Cleaning up focus management");
                cleanupFocus();
            }
            restoreFocus();
        }, 50); // Increased delay
    };

    if (type === "confirm-tx") {
        modal = createConfirmTxModal(payload, wrappedOnResult)
    } else if (type === "password-new") {
        modal = createPasswordNewModal(payload, wrappedOnResult)
    } else if (type === "password-existing") {
        modal = createPasswordExistingModal(payload, wrappedOnResult)
    } else {
        modal = document.createElement("div")
    }

    // Store setup function to be called after modal is added to DOM
    (modal as any)._setupFocus = () => {
        console.log("[modal-helper] Setting up focus management for modal type:", type);
        setInitialFocus(modal);
        const trapCleanup = trapFocus(modal);

        // Handle escape key to close modal (for some modal types)
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && type !== 'password-existing' && type !== 'password-new') {
                console.log("[modal-helper] Escape key pressed, closing modal");
                // Only allow escape for transaction confirmations, not password modals
                onResult({ proceed: false });
            }
        };

        document.addEventListener('keydown', handleEscape);

        // Store cleanup function
        cleanupFocus = () => {
            trapCleanup();
            document.removeEventListener('keydown', handleEscape);
        };
    };

    return modal;
}

export function createConfirmTxModal(payload: ModalPayload, onResult: (result: ModalResult) => void): HTMLDivElement {
    // Extract transaction/dataItem details
    const tx = (payload.transaction || payload.dataItem)!
    const tags: { name: string, value: string }[] = tx.tags || []
    const actionTag = tags.find((tag: { name: string, value: string }) => tag.name === "Action")
    const recipientTag = tags.find((tag: { name: string, value: string }) => tag.name === "Recipient")
    const quantityTag = tags.find((tag: { name: string, value: string }) => tag.name === "Quantity")
    const processId = tx.target || "-"

    // Get the from address - try multiple fields
    let from = "-"
    if ('owner' in tx && typeof tx.owner === 'string') {
        from = tx.owner
    } else if ('from' in tx && typeof tx.from === 'string') {
        from = tx.from
    } else if ('id' in tx && typeof tx.id === 'string') {
        from = tx.id
    }

    // Helper function to format token quantity based on denomination
    function formatTokenQuantity(rawQuantity: string, denomination: string | number): string {
        try {
            const denom = parseInt(denomination.toString()) || 0

            if (denom === 0) {
                return rawQuantity // No denomination, return as-is
            }

            // Work with strings to avoid JavaScript's scientific notation
            const quantity = rawQuantity.toString()

            // Helper function to divide a number string by 10^n without scientific notation
            function divideByPowerOf10(numStr: string, power: number): string {
                if (power === 0) return numStr

                // Remove any existing decimal point and count digits after it
                let wholePart = numStr.replace('.', '')
                let decimalPlaces = numStr.includes('.') ? numStr.split('.')[1].length : 0

                // Total decimal places after division
                const totalDecimalPlaces = decimalPlaces + power

                // If the number is shorter than the power, pad with zeros
                if (wholePart.length <= power) {
                    const zerosNeeded = power - wholePart.length + 1
                    wholePart = '0'.repeat(zerosNeeded) + wholePart
                }

                // Insert decimal point
                const insertPosition = wholePart.length - power
                let result = wholePart.slice(0, insertPosition) + '.' + wholePart.slice(insertPosition)

                // Clean up the result
                if (result.startsWith('.')) {
                    result = '0' + result
                }

                // Remove trailing zeros but keep at least one decimal place for non-whole numbers
                if (result.includes('.')) {
                    result = result.replace(/\.?0+$/, '')
                    if (!result.includes('.') && totalDecimalPlaces > 0) {
                        // This was a whole number after removing trailing zeros
                        return result
                    }
                    if (result.endsWith('.')) {
                        result = result.slice(0, -1)
                    }
                }

                return result || '0'
            }

            const formattedQuantity = divideByPowerOf10(quantity, denom)

            // Convert to number to check size for K/M formatting, but keep as string for display
            const numValue = parseFloat(formattedQuantity)

            // Apply K/M formatting only for large numbers
            if (numValue >= 1000000) {
                const millions = numValue / 1000000
                return millions.toFixed(2).replace(/\.?0+$/, '') + 'M'
            } else if (numValue >= 1000) {
                const thousands = numValue / 1000
                return thousands.toFixed(2).replace(/\.?0+$/, '') + 'K'
            } else {
                // For small numbers, return the decimal string as-is
                return formattedQuantity
            }

        } catch (error) {
            wauthLogger.simple('warn', 'Error formatting token quantity', error)
            return rawQuantity // Fallback to raw quantity
        }
    }

    // Extract and format quantity
    const rawQuantity = quantityTag?.value || "0"
    const tokenDetails = payload.tokenDetails || {}

    // Use token details if available, otherwise show loading state
    const isLoading = !payload.tokenDetails && tx.target

    // Format the quantity using denomination if available
    const formattedQuantity = tokenDetails.Denomination
        ? formatTokenQuantity(rawQuantity, tokenDetails.Denomination)
        : rawQuantity

    const amount = isLoading ? "Loading..." : formattedQuantity
    const unit = isLoading ? "..." : (tokenDetails.Ticker || tokenDetails.Symbol || "TOKEN")

    const tokenName = tokenDetails.Name || (isLoading ? "Loading..." : "Unknown Token")
    const tokenSymbol = tokenDetails.Ticker || tokenDetails.Symbol || (isLoading ? "..." : "TOKEN")
    const tokenLogo = tokenDetails.Logo ? `https://arweave.net/${tokenDetails.Logo}` : ""

    // Helper function to truncate long strings
    function truncateString(str: string, maxLength: number = 20): string {
        if (str.length <= maxLength) return str
        return str.substring(0, 8) + "..." + str.substring(str.length - 8)
    }

    // Helper function to create a loading spinner
    function createLoader(): HTMLDivElement {
        const loader = document.createElement("div")
        loader.style.width = "64px"
        loader.style.height = "64px"
        loader.style.borderRadius = "16px"
        loader.style.background = "linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%)"
        loader.style.display = "flex"
        loader.style.alignItems = "center"
        loader.style.justifyContent = "center"
        loader.style.marginBottom = "8px"
        loader.style.border = "2px solid #6c63ff"
        loader.style.position = "relative"
        loader.style.overflow = "hidden"
        loader.style.boxShadow = "0 4px 12px rgba(108, 99, 255, 0.3)"

        // Create spinning element
        const spinner = document.createElement("div")
        spinner.style.width = "24px"
        spinner.style.height = "24px"
        spinner.style.border = "3px solid rgba(108, 99, 255, 0.2)"
        spinner.style.borderTop = "3px solid #6c63ff"
        spinner.style.borderRadius = "50%"
        spinner.style.animation = "spin 1s linear infinite"

        // Add enhanced CSS animations
        const style = document.createElement("style")
        style.textContent = `
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            @keyframes pulse {
                0% { opacity: 0.6; transform: scale(1); }
                50% { opacity: 0.3; transform: scale(1.05); }
                100% { opacity: 0.6; transform: scale(1); }
            }
            @keyframes glow {
                0% { box-shadow: 0 4px 12px rgba(108, 99, 255, 0.3); }
                50% { box-shadow: 0 4px 20px rgba(108, 99, 255, 0.5); }
                100% { box-shadow: 0 4px 12px rgba(108, 99, 255, 0.3); }
            }
        `
        if (!document.head.querySelector('style[data-wauth-animations]')) {
            style.setAttribute('data-wauth-animations', 'true')
            document.head.appendChild(style)
        }

        loader.appendChild(spinner)
        return loader
    }

    // Helper function to create powered by element
    function createPoweredByElement(): HTMLDivElement {
        const powered = document.createElement("div")
        powered.className = "wauth-powered"

        // Use secure link creation instead of innerHTML
        const poweredLink = HTMLSanitizer.createSafeLink("https://wauth_subspace.ar.io", "powered by wauth", "_blank")
        powered.appendChild(poweredLink)

        powered.style.position = "absolute"
        powered.style.bottom = "15px"
        powered.style.textAlign = "center"
        powered.style.fontSize = "0.95rem"
        powered.style.color = "#b3b3b3"
        powered.style.opacity = "0.7"
        powered.style.letterSpacing = "0.02em"
        powered.style.left = "0"
        powered.style.right = "0"

        // Style the link directly
        poweredLink.style.color = "inherit"
        poweredLink.style.textDecoration = "inherit"

        return powered
    }

    // Modal card (content only, container handled by index.ts) - Responsive design
    const modal = document.createElement("div")
    modal.id = "modal-content"
    modal.style.background = "linear-gradient(135deg, #2a2a2a 0%, #1e1e1e 100%)"
    modal.style.padding = "clamp(10px, 4vw, 20px)" // Responsive padding
    modal.style.width = "min(400px, calc(100vw - 32px))" // Responsive width with proper margins
    modal.style.maxHeight = "calc(100vh - 32px)" // Account for margins on both sides
    modal.style.overflowY = "auto"
    modal.style.borderRadius = "clamp(12px, 3vw, 20px)" // Responsive border radius
    modal.style.border = "1px solid rgba(255, 255, 255, 0.1)"
    modal.style.boxShadow = "0 20px 40px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.05)"
    modal.style.position = "relative"
    modal.style.display = "flex"
    modal.style.flexDirection = "column"
    modal.style.gap = "clamp(8px, 2vw, 12px)" // Responsive gap
    modal.style.animation = "slideUp 0.4s ease-out"
    modal.style.backdropFilter = "blur(20px)"
    modal.setAttribute('role', 'dialog') // Accessibility
    modal.setAttribute('aria-modal', 'true') // Accessibility
    modal.setAttribute('aria-labelledby', 'modal-title') // Link to title
    modal.setAttribute('aria-describedby', 'modal-description') // Link to description

    // Add custom scrollbar styling
    const scrollbarStyle = document.createElement("style")
    scrollbarStyle.textContent = `
        #modal-content::-webkit-scrollbar {
            width: 6px;
        }
        #modal-content::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 3px;
        }
        #modal-content::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.3);
            border-radius: 3px;
        }
        #modal-content::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.5);
        }
    `
    if (!document.head.querySelector('style[data-wauth-scrollbar]')) {
        scrollbarStyle.setAttribute('data-wauth-scrollbar', 'true')
        document.head.appendChild(scrollbarStyle)
    }

    // Header with enhanced styling
    const header = document.createElement("div")
    header.className = "modal-header"
    header.style.display = "flex"
    header.style.justifyContent = "space-between"
    header.style.alignItems = "center"
    header.style.margin = "-10px"
    header.style.marginBottom = "8px"
    header.style.padding = "12px"
    header.style.paddingLeft = "16px"
    header.style.borderBottom = "1px solid rgba(255, 255, 255, 0.1)"

    const title = document.createElement("div")
    title.className = "modal-title"
    title.id = "modal-title" // For aria-labelledby
    title.textContent = "Transfer"
    title.style.fontSize = "2rem"
    title.style.fontWeight = "700"
    title.style.letterSpacing = "-0.02em"
    title.style.background = "linear-gradient(135deg, #ffffff 0%, #e0e0e0 100%)"
    title.style.backgroundClip = "text"
    title.style.webkitBackgroundClip = "text"
    title.style.webkitTextFillColor = "transparent"

    const appIcon = document.createElement("div")
    appIcon.className = "modal-appicon"
    appIcon.style.width = "40px"
    appIcon.style.height = "40px"
    appIcon.style.borderRadius = "12px"
    appIcon.style.background = "linear-gradient(135deg, #6c63ff 0%, #8b7fff 100%)"
    appIcon.style.display = "flex"
    appIcon.style.alignItems = "center"
    appIcon.style.justifyContent = "center"
    appIcon.style.boxShadow = "0 4px 12px rgba(108, 99, 255, 0.4)"
    appIcon.style.position = "relative"
    appIcon.style.overflow = "hidden"

    // Add favicon as background
    const favicon = document.createElement("img")
    favicon.src = `${window.location.origin}/favicon.ico`
    favicon.style.width = "24px"
    favicon.style.height = "24px"
    favicon.style.borderRadius = "6px"
    favicon.style.filter = "brightness(1.2)"
    favicon.onerror = () => {
        // Fallback to a nice icon - use textContent for safety
        appIcon.textContent = "₿"
        appIcon.style.fontSize = "20px"
    }
    appIcon.appendChild(favicon)

    header.appendChild(title)
    header.appendChild(appIcon)
    modal.appendChild(header)

    // Enhanced description - SECURITY: Use safe HTML to prevent XSS
    const desc = document.createElement("div")
    desc.className = "modal-desc"
    desc.id = "modal-description" // For aria-describedby

    // Create safe description with escaped hostname and proper line break
    const hostname = HTMLSanitizer.escapeHTML(window.location.hostname);
    const descText = `${hostname} wants to sign a transaction.`;
    const reviewText = "Review the details below.";

    desc.appendChild(document.createTextNode(descText));
    desc.appendChild(document.createElement("br"));
    desc.appendChild(document.createTextNode(reviewText));

    desc.style.fontSize = "0.95rem"
    desc.style.color = "rgba(255, 255, 255, 0.7)"
    desc.style.lineHeight = "1.5"
    desc.style.marginBottom = "8px"
    desc.style.textAlign = "center"
    modal.appendChild(desc)

    // Enhanced center section
    const center = document.createElement("div")
    center.className = "modal-center"
    center.style.display = "flex"
    center.style.flexDirection = "column"
    center.style.alignItems = "center"
    center.style.margin = "10px"
    center.style.padding = "10px"
    center.style.background = "rgba(255, 255, 255, 0.02)"
    center.style.borderRadius = "16px"
    center.style.border = "1px solid rgba(255, 255, 255, 0.05)"

    // Enhanced token logo or loader
    if (isLoading) {
        const loader = createLoader()
        loader.style.animation = "glow 2s ease-in-out infinite"
        center.appendChild(loader)
    } else {
        const tokenLogoEl = document.createElement("img")
        tokenLogoEl.className = "token-logo"
        tokenLogoEl.src = tokenLogo
        tokenLogoEl.alt = `${tokenName} Logo`
        tokenLogoEl.style.width = "64px"
        tokenLogoEl.style.height = "64px"
        tokenLogoEl.style.borderRadius = "16px"
        tokenLogoEl.style.background = "linear-gradient(135deg, #ffffff 0%, #f0f0f0 100%)"
        tokenLogoEl.style.display = "flex"
        tokenLogoEl.style.alignItems = "center"
        tokenLogoEl.style.justifyContent = "center"
        tokenLogoEl.style.marginBottom = "8px"
        tokenLogoEl.style.border = "2px solid #6c63ff"
        tokenLogoEl.style.boxShadow = "0 4px 12px rgba(108, 99, 255, 0.3)"
        tokenLogoEl.style.transition = "transform 0.2s ease"

        tokenLogoEl.onmouseover = () => {
            tokenLogoEl.style.transform = "scale(1.05)"
        }
        tokenLogoEl.onmouseleave = () => {
            tokenLogoEl.style.transform = "scale(1)"
        }

        // Handle image load errors - show loader instead
        tokenLogoEl.onerror = () => {
            const loader = createLoader()
            center.replaceChild(loader, tokenLogoEl)
        }
        center.appendChild(tokenLogoEl)
    }

    const tokenAmount = document.createElement("div")
    tokenAmount.className = "token-amount"
    tokenAmount.textContent = `${amount} `

    // Dynamic font sizing based on amount length
    let fontSize = "2.5rem"
    const amountLength = amount.length
    if (amountLength > 15) {
        fontSize = "1.6rem"
    } else if (amountLength > 12) {
        fontSize = "1.8rem"
    } else if (amountLength > 9) {
        fontSize = "2rem"
    } else if (amountLength > 6) {
        fontSize = "2.2rem"
    }

    tokenAmount.style.fontSize = fontSize
    tokenAmount.style.fontWeight = "800"
    tokenAmount.style.background = "linear-gradient(135deg, #ffffff 0%, #e0e0e0 100%)"
    tokenAmount.style.backgroundClip = "text"
    tokenAmount.style.webkitBackgroundClip = "text"
    tokenAmount.style.webkitTextFillColor = "transparent"
    tokenAmount.style.marginBottom = "4px"
    tokenAmount.style.letterSpacing = "-0.02em"
    tokenAmount.style.lineHeight = "1.1"
    tokenAmount.style.textAlign = "center"
    tokenAmount.style.wordBreak = "break-all"
    tokenAmount.style.maxWidth = "100%"

    const tokenUnit = document.createElement("span")
    tokenUnit.className = "token-unit"
    tokenUnit.textContent = unit

    // Adjust unit font size relative to amount font size
    const unitFontSize = parseFloat(fontSize) * 0.52 + "rem" // About 52% of amount font size
    tokenUnit.style.fontSize = unitFontSize
    tokenUnit.style.color = "rgba(255, 255, 255, 0.6)"
    tokenUnit.style.marginLeft = "6px"
    tokenUnit.style.fontWeight = "600"

    // Add loading animation to unit if loading
    if (isLoading) {
        tokenUnit.style.opacity = "0.6"
        tokenUnit.style.animation = "pulse 2s infinite"
    }

    tokenAmount.appendChild(tokenUnit)
    center.appendChild(tokenAmount)
    modal.appendChild(center)

    // Enhanced details section
    const details = document.createElement("div")
    details.className = "modal-details"
    details.style.margin = "0 0 12px 0"
    details.style.background = "rgba(255, 255, 255, 0.02)"
    details.style.borderRadius = "12px"
    details.style.padding = "14px"
    details.style.border = "1px solid rgba(255, 255, 255, 0.05)"

    // Helper function to create detail rows with enhanced styling
    function createDetailRow(label: string, value: string, shouldTruncate: boolean = true) {
        const row = document.createElement("div")
        row.className = "modal-details-row"
        row.style.display = "flex"
        row.style.justifyContent = "space-between"
        row.style.marginBottom = "12px"
        row.style.fontSize = "0.95rem"
        row.style.alignItems = "flex-start"
        row.style.gap = "12px"
        row.style.padding = "8px 0"
        row.style.borderBottom = "1px solid rgba(255, 255, 255, 0.05)"

        const labelSpan = document.createElement("span")
        labelSpan.className = "modal-details-label"
        labelSpan.textContent = label
        labelSpan.style.color = "rgba(255, 255, 255, 0.6)"
        labelSpan.style.flexShrink = "0"
        labelSpan.style.minWidth = "90px"
        labelSpan.style.fontWeight = "500"

        const valueSpan = document.createElement("span")
        valueSpan.className = "modal-details-value"
        valueSpan.textContent = shouldTruncate ? truncateString(value) : value
        valueSpan.style.color = "#ffffff"
        valueSpan.style.fontFamily = "'JetBrains Mono', 'Courier New', monospace"
        valueSpan.style.wordBreak = "break-all"
        valueSpan.style.textAlign = "right"
        valueSpan.style.fontSize = "0.9rem"
        valueSpan.style.lineHeight = "1.4"
        valueSpan.style.fontWeight = "500"
        valueSpan.style.background = "rgba(255, 255, 255, 0.05)"
        valueSpan.style.padding = "4px 8px"
        valueSpan.style.borderRadius = "6px"
        valueSpan.style.transition = "background 0.2s ease"

        // Add tooltip and hover effects
        if (shouldTruncate && value.length > 20) {
            valueSpan.title = value
            valueSpan.style.cursor = "help"
            valueSpan.onmouseover = () => {
                valueSpan.style.background = "rgba(255, 255, 255, 0.08)"
            }
            valueSpan.onmouseleave = () => {
                valueSpan.style.background = "rgba(255, 255, 255, 0.05)"
            }
        }

        row.appendChild(labelSpan)
        row.appendChild(valueSpan)
        details.appendChild(row)
    }

    createDetailRow("Process ID", processId)
    // createDetailRow("From", from)

    // Add token name row if available or loading
    if (tokenDetails.Name || isLoading) {
        const tokenInfoText = isLoading ? "Loading token info..." : `${tokenName} (${tokenSymbol})`
        createDetailRow("Token", tokenInfoText, false)
    }

    // Enhanced tags section
    const tagsDiv = document.createElement("div")
    tagsDiv.className = "modal-tags"
    tagsDiv.style.display = "flex"
    tagsDiv.style.flexDirection = "column"
    tagsDiv.style.gap = "4px"
    tagsDiv.style.marginTop = "12px"
    tagsDiv.style.background = "rgba(255, 255, 255, 0.02)"
    tagsDiv.style.borderRadius = "12px"
    tagsDiv.style.paddingLeft = "4px"
    tagsDiv.style.paddingRight = "4px"
    tagsDiv.style.border = "1px solid rgba(255, 255, 255, 0.05)"
    tagsDiv.style.maxHeight = "200px"
    tagsDiv.style.overflowY = "auto"

    const tagsTitle = document.createElement("div")
    tagsTitle.className = "modal-tags-title"
    tagsTitle.textContent = "Transaction Tags"
    tagsTitle.style.color = "rgba(255, 255, 255, 0.8)"
    tagsTitle.style.fontSize = "0.95rem"
    tagsTitle.style.fontWeight = "600"
    tagsTitle.style.margin = "-4px"
    tagsTitle.style.marginBottom = "6px"
    tagsTitle.style.padding = "6px"
    tagsTitle.style.borderBottom = "1px solid rgba(255, 255, 255, 0.1)"
    tagsTitle.style.position = "sticky"
    tagsTitle.style.top = "0"
    tagsTitle.style.background = "rgba(255, 255, 255, 0.02)"
    tagsTitle.style.backdropFilter = "blur(10px)"
    tagsTitle.style.borderRadius = "12px 12px 0px 0px"
    tagsDiv.appendChild(tagsTitle)

    // Add tag rows with enhanced styling
    tags.forEach((tag: { name: string, value: string }) => {
        const tagRow = document.createElement("div")
        tagRow.className = "modal-tag"
        tagRow.style.display = "flex"
        tagRow.style.justifyContent = "space-between"
        tagRow.style.alignItems = "flex-start"
        tagRow.style.marginBottom = "6px"
        tagRow.style.fontSize = "0.85rem"
        tagRow.style.gap = "10px"
        tagRow.style.padding = "6px 10px"
        tagRow.style.background = "rgba(255, 255, 255, 0.03)"
        tagRow.style.borderRadius = "6px"
        tagRow.style.border = "1px solid rgba(255, 255, 255, 0.05)"
        tagRow.style.transition = "background 0.2s ease"

        const tagLabel = document.createElement("span")
        tagLabel.className = "modal-tag-label"
        tagLabel.textContent = tag.name
        tagLabel.style.color = "rgba(255, 255, 255, 0.6)"
        tagLabel.style.fontSize = "0.8rem"
        tagLabel.style.flexShrink = "0"
        tagLabel.style.minWidth = "70px"
        tagLabel.style.fontWeight = "500"

        const tagValue = document.createElement("span")
        tagValue.className = "modal-tag-value"
        tagValue.textContent = tag.value.length > 20 ? truncateString(tag.value) : tag.value
        tagValue.style.color = "#ffffff"
        tagValue.style.wordBreak = "break-all"
        tagValue.style.textAlign = "right"
        tagValue.style.fontSize = "0.8rem"
        tagValue.style.lineHeight = "1.3"
        tagValue.style.fontFamily = "'JetBrains Mono', 'Courier New', monospace"
        tagValue.style.fontWeight = "500"

        // Add tooltip for long values
        if (tag.value.length > 20) {
            tagValue.title = tag.value
            tagValue.style.cursor = "help"
        }

        // Hover effect
        tagRow.onmouseover = () => {
            tagRow.style.background = "rgba(255, 255, 255, 0.05)"
        }
        tagRow.onmouseleave = () => {
            tagRow.style.background = "rgba(255, 255, 255, 0.03)"
        }

        tagRow.appendChild(tagLabel)
        tagRow.appendChild(tagValue)
        tagsDiv.appendChild(tagRow)
    })
    details.appendChild(tagsDiv)
    modal.appendChild(details)

    // Enhanced actions section
    const actions = document.createElement("div")
    actions.className = "modal-actions"
    actions.style.display = "flex"
    actions.style.flexDirection = "column"
    actions.style.gap = "10px"
    actions.style.marginTop = "6px"

    const signBtn = document.createElement("button")
    signBtn.className = "modal-btn modal-btn-primary"
    signBtn.textContent = "Sign Transaction"
    signBtn.setAttribute('aria-describedby', 'modal-description') // Accessibility
    signBtn.setAttribute('aria-disabled', isLoading ? 'true' : 'false') // Accessibility
    signBtn.style.width = "100%"
    signBtn.style.padding = "14px 0"
    signBtn.style.border = "none"
    signBtn.style.borderRadius = "12px"
    signBtn.style.fontSize = "1rem"
    signBtn.style.fontWeight = "600"
    signBtn.style.cursor = isLoading ? "not-allowed" : "pointer"
    signBtn.style.transition = "all 0.2s ease"
    signBtn.style.position = "relative"
    signBtn.style.overflow = "hidden"
    signBtn.disabled = Boolean(isLoading)

    // Apply different styles based on loading state
    if (isLoading) {
        signBtn.style.background = "rgba(108, 99, 255, 0.3)"
        signBtn.style.color = "rgba(255, 255, 255, 0.5)"
        signBtn.style.boxShadow = "none"
        signBtn.setAttribute('aria-label', 'Loading token details, please wait') // Better accessibility

        // Add loading animation with better UX
        signBtn.style.position = "relative"
        const loadingSpinner = document.createElement("div")
        loadingSpinner.style.width = "16px"
        loadingSpinner.style.height = "16px"
        loadingSpinner.style.border = "2px solid rgba(255, 255, 255, 0.3)"
        loadingSpinner.style.borderTop = "2px solid rgba(255, 255, 255, 0.8)"
        loadingSpinner.style.borderRadius = "50%"
        loadingSpinner.style.animation = "spin 1s linear infinite"
        loadingSpinner.style.display = "inline-block"
        loadingSpinner.style.marginRight = "8px"
        loadingSpinner.style.verticalAlign = "middle"
        loadingSpinner.setAttribute('aria-hidden', 'true') // Hide from screen readers

        signBtn.textContent = ""
        signBtn.appendChild(loadingSpinner)
        signBtn.appendChild(document.createTextNode("Loading Token Details..."))

        // Add timeout fallback for loading state
        setTimeout(() => {
            if (signBtn.disabled) {
                signBtn.textContent = "Continue without token details"
                signBtn.disabled = false
                signBtn.style.background = "rgba(108, 99, 255, 0.6)"
                signBtn.style.color = "rgba(255, 255, 255, 0.8)"
                signBtn.setAttribute('aria-label', 'Token details could not be loaded, but you can still proceed with the transaction')
            }
        }, 10000) // 10 second timeout
    } else {
        signBtn.style.background = "linear-gradient(135deg, #6c63ff 0%, #8b7fff 100%)"
        signBtn.style.color = "#fff"
        signBtn.style.boxShadow = "0 4px 12px rgba(108, 99, 255, 0.4)"

        signBtn.onmouseover = () => {
            if (!signBtn.disabled) {
                signBtn.style.background = "linear-gradient(135deg, #7f6fff 0%, #9c8fff 100%)"
                signBtn.style.transform = "translateY(-2px)"
                signBtn.style.boxShadow = "0 6px 20px rgba(108, 99, 255, 0.5)"
            }
        }
        signBtn.onmouseleave = () => {
            if (!signBtn.disabled) {
                signBtn.style.background = "linear-gradient(135deg, #6c63ff 0%, #8b7fff 100%)"
                signBtn.style.transform = "translateY(0)"
                signBtn.style.boxShadow = "0 4px 12px rgba(108, 99, 255, 0.4)"
            }
        }
    }

    signBtn.onclick = () => {
        if (!signBtn.disabled) {
            onResult({ proceed: true })
        }
    }
    actions.appendChild(signBtn)

    const cancelBtn = document.createElement("button")
    cancelBtn.className = "modal-btn modal-btn-secondary"
    cancelBtn.textContent = "Cancel"
    cancelBtn.style.width = "100%"
    cancelBtn.style.padding = "12px 0"
    cancelBtn.style.border = "1px solid rgba(255, 255, 255, 0.2)"
    cancelBtn.style.borderRadius = "12px"
    cancelBtn.style.fontSize = "1rem"
    cancelBtn.style.fontWeight = "600"
    cancelBtn.style.cursor = "pointer"
    cancelBtn.style.transition = "all 0.2s ease"
    cancelBtn.style.background = "rgba(255, 255, 255, 0.05)"
    cancelBtn.style.color = "rgba(255, 255, 255, 0.8)"
    cancelBtn.style.backdropFilter = "blur(10px)"

    cancelBtn.onmouseover = () => {
        cancelBtn.style.background = "rgba(255, 255, 255, 0.1)"
        cancelBtn.style.color = "#ffffff"
        cancelBtn.style.borderColor = "rgba(255, 255, 255, 0.3)"
    }
    cancelBtn.onmouseleave = () => {
        cancelBtn.style.background = "rgba(255, 255, 255, 0.05)"
        cancelBtn.style.color = "rgba(255, 255, 255, 0.8)"
        cancelBtn.style.borderColor = "rgba(255, 255, 255, 0.2)"
    }
    cancelBtn.onclick = () => {
        console.log("[modal-helper] Cancel button clicked");
        onResult({ proceed: false })
    }
    cancelBtn.onmouseup = (e) => {
        e.stopPropagation()
    }
    actions.appendChild(cancelBtn)

    modal.appendChild(actions)

    // Don't add powered by element to modal - it should be added to container
    return modal
}

export function createPasswordNewModal(payload: ModalPayload, onResult: (result: ModalResult) => void): HTMLDivElement {
    // Modal card (content only, container handled by index.ts) - Responsive design
    const modal = document.createElement("div")
    modal.id = "modal-content"
    modal.style.background = "linear-gradient(135deg, #2a2a2a 0%, #1e1e1e 100%)"
    modal.style.padding = "clamp(16px, 5vw, 24px)" // Responsive padding
    modal.style.width = "min(400px, calc(100vw - 32px))" // Responsive width with proper margins
    modal.style.maxHeight = "calc(100vh - 32px)" // Account for margins on both sides
    modal.style.overflowY = "auto"
    modal.style.borderRadius = "clamp(12px, 3vw, 20px)" // Responsive border radius
    modal.style.border = "1px solid rgba(255, 255, 255, 0.1)"
    modal.style.boxShadow = "0 20px 40px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.05)"
    modal.style.position = "relative"
    modal.style.display = "flex"
    modal.style.flexDirection = "column"
    modal.style.gap = "clamp(16px, 4vw, 24px)" // Responsive gap
    modal.style.animation = "slideUp 0.4s ease-out"
    modal.style.backdropFilter = "blur(20px)"
    modal.style.pointerEvents = "auto" // Ensure modal content is interactive
    modal.setAttribute('role', 'dialog') // Accessibility
    modal.setAttribute('aria-modal', 'true') // Accessibility

    // Remove problematic event listeners that interfere with button clicks
    // These were preventing proper button interactions

    // Header
    const header = document.createElement("div")
    header.className = "modal-header"
    header.style.textAlign = "center"
    header.style.marginBottom = "10px"

    const title = document.createElement("div")
    title.className = "modal-title"
    title.textContent = "Create Master Password"
    title.style.fontSize = "2rem"
    title.style.fontWeight = "700"
    title.style.letterSpacing = "-0.02em"
    title.style.background = "linear-gradient(135deg, #ffffff 0%, #e0e0e0 100%)"
    title.style.backgroundClip = "text"
    title.style.webkitBackgroundClip = "text"
    title.style.webkitTextFillColor = "transparent"
    title.style.marginBottom = "8px"

    const subtitle = document.createElement("div")
    subtitle.className = "modal-subtitle"
    subtitle.textContent = "Secure your wallet with a strong password"
    subtitle.style.fontSize = "0.95rem"
    subtitle.style.color = "rgba(255, 255, 255, 0.7)"
    subtitle.style.lineHeight = "1.5"

    header.appendChild(title)
    header.appendChild(subtitle)
    modal.appendChild(header)

    // Warning section
    const warning = document.createElement("div")
    warning.className = "modal-warning"
    warning.style.background = "rgba(255, 193, 7, 0.1)"
    warning.style.border = "1px solid rgba(255, 193, 7, 0.3)"
    warning.style.borderRadius = "12px"
    warning.style.padding = "16px"
    warning.style.margin = "0 0 20px 0"
    warning.style.display = "flex"
    warning.style.alignItems = "flex-start"
    warning.style.gap = "12px"

    const warningIcon = document.createElement("div")
    warningIcon.textContent = "⚠️"
    warningIcon.style.fontSize = "1.2rem"
    warningIcon.style.flexShrink = "0"
    warningIcon.style.marginTop = "2px"

    const warningContent = document.createElement("div")
    warningContent.style.flex = "1"

    const warningTitle = document.createElement("div")
    warningTitle.textContent = "Important: Store Your Password Safely"
    warningTitle.style.fontSize = "0.95rem"
    warningTitle.style.fontWeight = "600"
    warningTitle.style.color = "#ffc107"
    warningTitle.style.marginBottom = "6px"

    const warningText = document.createElement("div")
    warningText.textContent = "Save this password in a password manager or secure location. If you forget your master password, you will permanently lose access to your wallet and funds. There is no password recovery option."
    warningText.style.fontSize = "0.85rem"
    warningText.style.color = "rgba(255, 255, 255, 0.8)"
    warningText.style.lineHeight = "1.4"

    warningContent.appendChild(warningTitle)
    warningContent.appendChild(warningText)
    warning.appendChild(warningIcon)
    warning.appendChild(warningContent)
    modal.appendChild(warning)

    // Form container - use actual form element for password manager support
    const form = document.createElement("form")
    form.className = "modal-form"
    form.action = "#" // Required for password manager detection
    form.method = "post" // Required for password manager detection
    form.style.display = "flex"
    form.style.flexDirection = "column"
    form.style.gap = "16px"
    form.autocomplete = "on"
    form.onsubmit = (e) => e.preventDefault() // Prevent actual form submission

    // Hidden username field to help password managers understand context
    const hiddenUsernameInput = document.createElement("input")
    hiddenUsernameInput.type = "text"
    hiddenUsernameInput.name = "username"
    hiddenUsernameInput.id = "username-new"
    hiddenUsernameInput.autocomplete = "username"
    hiddenUsernameInput.value = `wauth-${window.location.hostname}` // Make it unique per domain
    hiddenUsernameInput.readOnly = true
    hiddenUsernameInput.style.display = "none"
    hiddenUsernameInput.style.position = "absolute"
    hiddenUsernameInput.style.left = "-9999px"
    hiddenUsernameInput.tabIndex = -1
    hiddenUsernameInput.setAttribute('aria-hidden', 'true')
    form.appendChild(hiddenUsernameInput)

    // Password input
    const passwordContainer = document.createElement("div")
    passwordContainer.style.display = "flex"
    passwordContainer.style.flexDirection = "column"
    passwordContainer.style.gap = "6px"

    const passwordLabel = document.createElement("label")
    passwordLabel.textContent = "Master Password"
    passwordLabel.htmlFor = "new-password"
    passwordLabel.style.fontSize = "0.9rem"
    passwordLabel.style.color = "rgba(255, 255, 255, 0.8)"
    passwordLabel.style.fontWeight = "600"

    const passwordInput = document.createElement("input")
    passwordInput.type = "password"
    passwordInput.name = "password"
    passwordInput.id = "new-password"
    passwordInput.autocomplete = "new-password"
    passwordInput.placeholder = "Enter your master password"
    passwordInput.required = true // Required for password manager detection
    passwordInput.minLength = 8 // Helps password managers understand requirements
    // Auto-focus handled by focus management system
    passwordInput.style.padding = "12px 16px"
    passwordInput.style.borderRadius = "8px"
    passwordInput.style.border = "1px solid rgba(255, 255, 255, 0.2)"
    passwordInput.style.background = "rgba(255, 255, 255, 0.05)"
    passwordInput.style.color = "#ffffff"
    passwordInput.style.fontSize = "1rem"
    passwordInput.style.outline = "none"
    passwordInput.style.transition = "all 0.2s ease"

    passwordInput.onfocus = () => {
        passwordInput.style.borderColor = "#6c63ff"
        passwordInput.style.boxShadow = "0 0 0 2px rgba(108, 99, 255, 0.2)"
    }
    passwordInput.onblur = () => {
        passwordInput.style.borderColor = "rgba(255, 255, 255, 0.2)"
        passwordInput.style.boxShadow = "none"
    }

    passwordContainer.appendChild(passwordLabel)
    passwordContainer.appendChild(passwordInput)

    // Confirm password input
    const confirmContainer = document.createElement("div")
    confirmContainer.style.display = "flex"
    confirmContainer.style.flexDirection = "column"
    confirmContainer.style.gap = "6px"

    const confirmLabel = document.createElement("label")
    confirmLabel.textContent = "Confirm Password"
    confirmLabel.htmlFor = "confirm-password"
    confirmLabel.style.fontSize = "0.9rem"
    confirmLabel.style.color = "rgba(255, 255, 255, 0.8)"
    confirmLabel.style.fontWeight = "600"

    const confirmInput = document.createElement("input")
    confirmInput.type = "password"
    confirmInput.name = "confirmPassword"
    confirmInput.id = "confirm-password"
    confirmInput.autocomplete = "new-password"
    confirmInput.placeholder = "Confirm your master password"
    confirmInput.required = true // Required for password manager detection
    confirmInput.style.padding = "12px 16px"
    confirmInput.style.borderRadius = "8px"
    confirmInput.style.border = "1px solid rgba(255, 255, 255, 0.2)"
    confirmInput.style.background = "rgba(255, 255, 255, 0.05)"
    confirmInput.style.color = "#ffffff"
    confirmInput.style.fontSize = "1rem"
    confirmInput.style.outline = "none"
    confirmInput.style.transition = "all 0.2s ease"

    confirmInput.onfocus = () => {
        confirmInput.style.borderColor = "#6c63ff"
        confirmInput.style.boxShadow = "0 0 0 2px rgba(108, 99, 255, 0.2)"
    }
    confirmInput.onblur = () => {
        confirmInput.style.borderColor = "rgba(255, 255, 255, 0.2)"
        confirmInput.style.boxShadow = "none"
    }

    confirmContainer.appendChild(confirmLabel)
    confirmContainer.appendChild(confirmInput)

    // Error message
    const errorMessage = document.createElement("div")
    errorMessage.className = "error-message"
    errorMessage.style.color = "#ff6b6b"
    errorMessage.style.fontSize = "0.85rem"
    errorMessage.style.textAlign = "center"
    errorMessage.style.display = "none"
    errorMessage.style.padding = "8px"
    errorMessage.style.background = "rgba(255, 107, 107, 0.1)"
    errorMessage.style.borderRadius = "6px"
    errorMessage.style.border = "1px solid rgba(255, 107, 107, 0.3)"

    form.appendChild(passwordContainer)
    form.appendChild(confirmContainer)
    form.appendChild(errorMessage)
    modal.appendChild(form)

    // Password strength indicator
    const strengthContainer = document.createElement("div")
    strengthContainer.style.display = "flex"
    strengthContainer.style.flexDirection = "column"
    strengthContainer.style.gap = "8px"
    strengthContainer.style.margin = "-10px 0 10px 0"

    const strengthLabel = document.createElement("div")
    strengthLabel.textContent = "Password Strength:"
    strengthLabel.style.fontSize = "0.85rem"
    strengthLabel.style.color = "rgba(255, 255, 255, 0.6)"

    const strengthBar = document.createElement("div")
    strengthBar.style.height = "4px"
    strengthBar.style.background = "rgba(255, 255, 255, 0.1)"
    strengthBar.style.borderRadius = "2px"
    strengthBar.style.overflow = "hidden"

    const strengthFill = document.createElement("div")
    strengthFill.style.height = "100%"
    strengthFill.style.width = "0%"
    strengthFill.style.transition = "all 0.3s ease"
    strengthFill.style.borderRadius = "2px"

    strengthBar.appendChild(strengthFill)
    strengthContainer.appendChild(strengthLabel)
    strengthContainer.appendChild(strengthBar)
    modal.appendChild(strengthContainer)

    // Function to check password strength
    function checkPasswordStrength(password: string) {
        let score = 0
        let feedback = ""

        if (password.length >= 8) score += 1
        if (password.length >= 12) score += 1
        if (/[a-z]/.test(password)) score += 1
        if (/[A-Z]/.test(password)) score += 1
        if (/[0-9]/.test(password)) score += 1
        if (/[^A-Za-z0-9]/.test(password)) score += 1

        const colors = ["#ff6b6b", "#ff8e53", "#feca57", "#48cae4", "#06d6a0"]
        const labels = ["Very Weak", "Weak", "Fair", "Good", "Strong"]

        const strength = Math.min(Math.floor(score / 1.2), 4)

        strengthFill.style.width = `${(strength + 1) * 20}%`
        strengthFill.style.background = colors[strength]
        strengthLabel.textContent = `Password Strength: ${labels[strength]}`

        return strength >= 2 // Require at least "Fair" strength
    }

    // Password input validation
    passwordInput.oninput = () => {
        checkPasswordStrength(passwordInput.value)
        if (errorMessage.style.display !== "none") {
            errorMessage.style.display = "none"
        }
    }

    confirmInput.oninput = () => {
        if (errorMessage.style.display !== "none") {
            errorMessage.style.display = "none"
        }
    }

    // Actions
    const actions = document.createElement("div")
    actions.className = "modal-actions"
    actions.style.display = "flex"
    actions.style.flexDirection = "column"
    actions.style.gap = "10px"
    actions.style.marginTop = "10px"

    const createBtn = document.createElement("button")
    createBtn.type = "submit" // Important for password manager detection
    createBtn.className = "modal-btn modal-btn-primary"
    createBtn.textContent = "Create Wallet"
    createBtn.style.width = "100%"
    createBtn.style.padding = "14px 0"
    createBtn.style.border = "none"
    createBtn.style.borderRadius = "12px"
    createBtn.style.fontSize = "1rem"
    createBtn.style.fontWeight = "600"
    createBtn.style.cursor = "pointer"
    createBtn.style.transition = "all 0.2s ease"
    createBtn.style.background = "linear-gradient(135deg, #6c63ff 0%, #8b7fff 100%)"
    createBtn.style.color = "#fff"
    createBtn.style.boxShadow = "0 4px 12px rgba(108, 99, 255, 0.4)"

    createBtn.onmouseover = () => {
        createBtn.style.background = "linear-gradient(135deg, #7f6fff 0%, #9c8fff 100%)"
        createBtn.style.transform = "translateY(-2px)"
        createBtn.style.boxShadow = "0 6px 20px rgba(108, 99, 255, 0.5)"
    }
    createBtn.onmouseleave = () => {
        createBtn.style.background = "linear-gradient(135deg, #6c63ff 0%, #8b7fff 100%)"
        createBtn.style.transform = "translateY(0)"
        createBtn.style.boxShadow = "0 4px 12px rgba(108, 99, 255, 0.4)"
    }

    const cancelBtn = document.createElement("button")
    cancelBtn.className = "modal-btn modal-btn-secondary"
    cancelBtn.textContent = "Cancel"
    cancelBtn.style.width = "100%"
    cancelBtn.style.padding = "12px 0"
    cancelBtn.style.border = "1px solid rgba(255, 255, 255, 0.2)"
    cancelBtn.style.borderRadius = "12px"
    cancelBtn.style.fontSize = "1rem"
    cancelBtn.style.fontWeight = "600"
    cancelBtn.style.cursor = "pointer"
    cancelBtn.style.transition = "all 0.2s ease"
    cancelBtn.style.background = "rgba(255, 255, 255, 0.05)"
    cancelBtn.style.color = "rgba(255, 255, 255, 0.8)"
    cancelBtn.style.backdropFilter = "blur(10px)"

    cancelBtn.onmouseover = () => {
        cancelBtn.style.background = "rgba(255, 255, 255, 0.1)"
        cancelBtn.style.color = "#ffffff"
        cancelBtn.style.borderColor = "rgba(255, 255, 255, 0.3)"
    }
    cancelBtn.onmouseleave = () => {
        cancelBtn.style.background = "rgba(255, 255, 255, 0.05)"
        cancelBtn.style.color = "rgba(255, 255, 255, 0.8)"
        cancelBtn.style.borderColor = "rgba(255, 255, 255, 0.2)"
    }
    cancelBtn.onclick = () => {
        console.log("[modal-helper] Cancel button clicked");
        onResult({ proceed: false })
    }
    cancelBtn.onmouseup = (e) => {
        e.stopPropagation()
    }

    // Handle form submission and Enter key
    const handleSubmit = (event?: Event) => {
        wauthLogger.simple('info', 'New password modal handleSubmit called');
        const password = passwordInput.value
        const confirmPassword = confirmInput.value

        // Validation
        if (!password) {
            wauthLogger.simple('warn', 'New password validation failed: Password is required');
            errorMessage.textContent = "Password is required"
            errorMessage.style.display = "block"
            passwordInput.focus()
            return false
        }

        if (password.length < 8) {
            wauthLogger.simple('warn', 'Validation failed: Password too short');
            errorMessage.textContent = "Password must be at least 8 characters long"
            errorMessage.style.display = "block"
            passwordInput.focus()
            return false
        }

        if (!checkPasswordStrength(password)) {
            wauthLogger.simple('warn', 'Validation failed: Password too weak');
            errorMessage.textContent = "Password is too weak. Please use a stronger password."
            errorMessage.style.display = "block"
            passwordInput.focus()
            return false
        }

        if (password !== confirmPassword) {
            wauthLogger.simple('warn', 'Validation failed: Passwords do not match');
            errorMessage.textContent = "Passwords do not match"
            errorMessage.style.display = "block"
            confirmInput.focus()
            return false
        }

        wauthLogger.simple('info', 'New password validation passed, calling onResult');
        // Trigger result immediately - form element and proper autocomplete attributes 
        // are sufficient for password manager detection
        onResult({ proceed: true, password })

        return true
    }

    // Improved button handlers with better event handling
    createBtn.onclick = (e) => {
        console.log("[modal-helper] Create button clicked");
        e.preventDefault()
        e.stopPropagation()
        handleSubmit(e)
    }

    // Also handle mouse events to ensure clicks work
    createBtn.onmouseup = (e) => {
        e.stopPropagation()
    }

    form.onsubmit = (e) => {
        console.log("[modal-helper] Form submitted");
        e.preventDefault()
        handleSubmit(e)
    }

    actions.appendChild(createBtn)
    actions.appendChild(cancelBtn)

    modal.appendChild(actions)

    // Focus handled by focus management system

    const handleEnter = (e: KeyboardEvent) => {
        if (e.key === "Enter") {
            console.log("[modal-helper] Enter key pressed in new password modal");
            e.preventDefault()
            handleSubmit()
        }
    }
    passwordInput.addEventListener("keydown", handleEnter)
    confirmInput.addEventListener("keydown", handleEnter)

    return modal
}

export function createPasswordExistingModal(payload: ModalPayload, onResult: (result: ModalResult) => void): HTMLDivElement {
    // Modal card (content only, container handled by index.ts) - Responsive design
    const modal = document.createElement("div")
    modal.id = "modal-content"
    modal.style.background = "linear-gradient(135deg, #2a2a2a 0%, #1e1e1e 100%)"
    modal.style.padding = "clamp(16px, 5vw, 24px)" // Responsive padding
    modal.style.width = "min(400px, calc(100vw - 32px))" // Responsive width with proper margins
    modal.style.maxHeight = "calc(100vh - 32px)" // Account for margins on both sides
    modal.style.overflowY = "auto"
    modal.style.borderRadius = "clamp(12px, 3vw, 20px)" // Responsive border radius
    modal.style.border = "1px solid rgba(255, 255, 255, 0.1)"
    modal.style.boxShadow = "0 20px 40px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.05)"
    modal.style.position = "relative"
    modal.style.display = "flex"
    modal.style.flexDirection = "column"
    modal.style.gap = "clamp(16px, 4vw, 24px)" // Responsive gap
    modal.style.animation = "slideUp 0.4s ease-out"
    modal.style.backdropFilter = "blur(20px)"
    modal.style.pointerEvents = "auto" // Ensure modal content is interactive
    modal.setAttribute('role', 'dialog') // Accessibility
    modal.setAttribute('aria-modal', 'true') // Accessibility

    // Remove problematic event listeners that interfere with button clicks
    // These were preventing proper button interactions

    // Header
    const header = document.createElement("div")
    header.className = "modal-header"
    header.style.textAlign = "center"
    header.style.marginBottom = "10px"

    const title = document.createElement("div")
    title.className = "modal-title"
    title.textContent = "Welcome Back"
    title.style.fontSize = "2rem"
    title.style.fontWeight = "700"
    title.style.letterSpacing = "-0.02em"
    title.style.background = "linear-gradient(135deg, #ffffff 0%, #e0e0e0 100%)"
    title.style.backgroundClip = "text"
    title.style.webkitBackgroundClip = "text"
    title.style.webkitTextFillColor = "transparent"
    title.style.marginBottom = "8px"

    const subtitle = document.createElement("div")
    subtitle.className = "modal-subtitle"
    subtitle.textContent = "Enter your master password to access your wallet"
    subtitle.style.fontSize = "0.95rem"
    subtitle.style.color = "rgba(255, 255, 255, 0.7)"
    subtitle.style.lineHeight = "1.5"

    header.appendChild(title)
    header.appendChild(subtitle)
    modal.appendChild(header)

    // Warning section (only show if there's an error message to keep login modal clean)
    if (payload.errorMessage) {
        const warning = document.createElement("div")
        warning.className = "modal-warning"
        warning.style.background = "rgba(255, 107, 107, 0.1)"
        warning.style.border = "1px solid rgba(255, 107, 107, 0.3)"
        warning.style.borderRadius = "12px"
        warning.style.padding = "16px"
        warning.style.margin = "0 0 20px 0"
        warning.style.display = "flex"
        warning.style.alignItems = "flex-start"
        warning.style.gap = "12px"

        const warningIcon = document.createElement("div")
        warningIcon.textContent = "⚠️"
        warningIcon.style.fontSize = "1.2rem"
        warningIcon.style.flexShrink = "0"
        warningIcon.style.marginTop = "2px"

        const warningContent = document.createElement("div")
        warningContent.style.flex = "1"

        const warningTitle = document.createElement("div")
        warningTitle.textContent = "Reminder: No Password Recovery"
        warningTitle.style.fontSize = "0.95rem"
        warningTitle.style.fontWeight = "600"
        warningTitle.style.color = "#ff6b6b"
        warningTitle.style.marginBottom = "6px"

        const warningText = document.createElement("div")
        warningText.textContent = "If you've forgotten your master password, there is no way to recover it. Make sure to store it securely in a password manager for future access."
        warningText.style.fontSize = "0.85rem"
        warningText.style.color = "rgba(255, 255, 255, 0.8)"
        warningText.style.lineHeight = "1.4"

        warningContent.appendChild(warningTitle)
        warningContent.appendChild(warningText)
        warning.appendChild(warningIcon)
        warning.appendChild(warningContent)
        modal.appendChild(warning)
    }

    // Form container - use actual form element for password manager support
    const form = document.createElement("form")
    form.className = "modal-form"
    form.action = "#" // Required for password manager detection
    form.method = "post" // Required for password manager detection
    form.style.display = "flex"
    form.style.flexDirection = "column"
    form.style.gap = "16px"
    form.autocomplete = "on"
    form.onsubmit = (e) => e.preventDefault() // Prevent actual form submission

    // Hidden username field to help password managers understand context
    const hiddenUsernameInput = document.createElement("input")
    hiddenUsernameInput.type = "text"
    hiddenUsernameInput.name = "username"
    hiddenUsernameInput.id = "username-existing"
    hiddenUsernameInput.autocomplete = "username"
    hiddenUsernameInput.value = `wauth-${window.location.hostname}` // Make it unique per domain
    hiddenUsernameInput.readOnly = true
    hiddenUsernameInput.style.display = "none"
    hiddenUsernameInput.style.position = "absolute"
    hiddenUsernameInput.style.left = "-9999px"
    hiddenUsernameInput.tabIndex = -1
    hiddenUsernameInput.setAttribute('aria-hidden', 'true')
    form.appendChild(hiddenUsernameInput)

    // Password input
    const passwordContainer = document.createElement("div")
    passwordContainer.style.display = "flex"
    passwordContainer.style.flexDirection = "column"
    passwordContainer.style.gap = "6px"

    const passwordLabel = document.createElement("label")
    passwordLabel.textContent = "Master Password"
    passwordLabel.htmlFor = "current-password"
    passwordLabel.style.fontSize = "0.9rem"
    passwordLabel.style.color = "rgba(255, 255, 255, 0.8)"
    passwordLabel.style.fontWeight = "600"

    const passwordInput = document.createElement("input")
    passwordInput.type = "password"
    passwordInput.name = "password"
    passwordInput.id = "current-password"
    passwordInput.autocomplete = "current-password"
    passwordInput.placeholder = "Enter your master password"
    passwordInput.required = true // Required for password manager detection
    // Auto-focus handled by focus management system
    passwordInput.style.padding = "12px 16px"
    passwordInput.style.borderRadius = "8px"
    passwordInput.style.border = "1px solid rgba(255, 255, 255, 0.2)"
    passwordInput.style.background = "rgba(255, 255, 255, 0.05)"
    passwordInput.style.color = "#ffffff"
    passwordInput.style.fontSize = "1rem"
    passwordInput.style.outline = "none"
    passwordInput.style.transition = "all 0.2s ease"

    passwordInput.onfocus = () => {
        passwordInput.style.borderColor = "#6c63ff"
        passwordInput.style.boxShadow = "0 0 0 2px rgba(108, 99, 255, 0.2)"
    }
    passwordInput.onblur = () => {
        passwordInput.style.borderColor = "rgba(255, 255, 255, 0.2)"
        passwordInput.style.boxShadow = "none"
    }

    passwordContainer.appendChild(passwordLabel)
    passwordContainer.appendChild(passwordInput)

    // Error message
    const errorMessage = document.createElement("div")
    errorMessage.className = "error-message"
    errorMessage.style.color = "#ff6b6b"
    errorMessage.style.fontSize = "0.85rem"
    errorMessage.style.textAlign = "center"
    errorMessage.style.display = "none"
    errorMessage.style.padding = "8px"
    errorMessage.style.background = "rgba(255, 107, 107, 0.1)"
    errorMessage.style.borderRadius = "6px"
    errorMessage.style.border = "1px solid rgba(255, 107, 107, 0.3)"

    form.appendChild(passwordContainer)
    form.appendChild(errorMessage)
    modal.appendChild(form)

    // Show error message if provided in payload
    if (payload.errorMessage) {
        errorMessage.textContent = payload.errorMessage
        errorMessage.style.display = "block"
    }

    // Password input validation
    passwordInput.oninput = () => {
        if (errorMessage.style.display !== "none") {
            errorMessage.style.display = "none"
        }
    }

    // Actions
    const actions = document.createElement("div")
    actions.className = "modal-actions"
    actions.style.display = "flex"
    actions.style.flexDirection = "column"
    actions.style.gap = "10px"
    actions.style.marginTop = "10px"

    const unlockBtn = document.createElement("button")
    unlockBtn.type = "submit" // Important for password manager detection
    unlockBtn.className = "modal-btn modal-btn-primary"
    unlockBtn.textContent = "Unlock Wallet"
    unlockBtn.style.width = "100%"
    unlockBtn.style.padding = "14px 0"
    unlockBtn.style.border = "none"
    unlockBtn.style.borderRadius = "12px"
    unlockBtn.style.fontSize = "1rem"
    unlockBtn.style.fontWeight = "600"
    unlockBtn.style.cursor = "pointer"
    unlockBtn.style.transition = "all 0.2s ease"
    unlockBtn.style.background = "linear-gradient(135deg, #6c63ff 0%, #8b7fff 100%)"
    unlockBtn.style.color = "#fff"
    unlockBtn.style.boxShadow = "0 4px 12px rgba(108, 99, 255, 0.4)"

    unlockBtn.onmouseover = () => {
        unlockBtn.style.background = "linear-gradient(135deg, #7f6fff 0%, #9c8fff 100%)"
        unlockBtn.style.transform = "translateY(-2px)"
        unlockBtn.style.boxShadow = "0 6px 20px rgba(108, 99, 255, 0.5)"
    }
    unlockBtn.onmouseleave = () => {
        unlockBtn.style.background = "linear-gradient(135deg, #6c63ff 0%, #8b7fff 100%)"
        unlockBtn.style.transform = "translateY(0)"
        unlockBtn.style.boxShadow = "0 4px 12px rgba(108, 99, 255, 0.4)"
    }

    actions.appendChild(unlockBtn)

    const cancelBtn = document.createElement("button")
    cancelBtn.className = "modal-btn modal-btn-secondary"
    cancelBtn.textContent = "Cancel"
    cancelBtn.style.width = "100%"
    cancelBtn.style.padding = "12px 0"
    cancelBtn.style.border = "1px solid rgba(255, 255, 255, 0.2)"
    cancelBtn.style.borderRadius = "12px"
    cancelBtn.style.fontSize = "1rem"
    cancelBtn.style.fontWeight = "600"
    cancelBtn.style.cursor = "pointer"
    cancelBtn.style.transition = "all 0.2s ease"
    cancelBtn.style.background = "rgba(255, 255, 255, 0.05)"
    cancelBtn.style.color = "rgba(255, 255, 255, 0.8)"
    cancelBtn.style.backdropFilter = "blur(10px)"

    cancelBtn.onmouseover = () => {
        cancelBtn.style.background = "rgba(255, 255, 255, 0.1)"
        cancelBtn.style.color = "#ffffff"
        cancelBtn.style.borderColor = "rgba(255, 255, 255, 0.3)"
    }
    cancelBtn.onmouseleave = () => {
        cancelBtn.style.background = "rgba(255, 255, 255, 0.05)"
        cancelBtn.style.color = "rgba(255, 255, 255, 0.8)"
        cancelBtn.style.borderColor = "rgba(255, 255, 255, 0.2)"
    }
    cancelBtn.onclick = () => {
        console.log("[modal-helper] Cancel button clicked");
        onResult({ proceed: false })
    }
    cancelBtn.onmouseup = (e) => {
        e.stopPropagation()
    }
    actions.appendChild(cancelBtn)

    modal.appendChild(actions)

    // Handle form submission and Enter key
    const handleSubmit = (event?: Event) => {
        wauthLogger.simple('info', 'Existing password modal handleSubmit called');
        const password = passwordInput.value

        // Validation
        if (!password) {
            wauthLogger.simple('warn', 'Existing password validation failed: Password is required');
            errorMessage.textContent = "Password is required"
            errorMessage.style.display = "block"
            passwordInput.focus()
            return false
        }

        wauthLogger.simple('info', 'Existing password validation passed, calling onResult');
        // NOTE: Backend verification happens in the caller (index.ts), not here
        // This modal just collects the password and returns it
        onResult({ proceed: true, password })

        return true
    }

    // Improved button handlers with better event handling
    unlockBtn.onclick = (e) => {
        console.log("[modal-helper] Unlock button clicked");
        e.preventDefault()
        e.stopPropagation()
        handleSubmit(e)
    }

    // Also handle mouse events to ensure clicks work
    unlockBtn.onmouseup = (e) => {
        e.stopPropagation()
    }

    form.onsubmit = (e) => {
        console.log("[modal-helper] Form submitted");
        e.preventDefault()
        handleSubmit(e)
    }

    actions.appendChild(unlockBtn)
    actions.appendChild(cancelBtn)

    modal.appendChild(actions)

    // Handle Enter key
    const handleEnter = (e: KeyboardEvent) => {
        if (e.key === "Enter") {
            console.log("[modal-helper] Enter key pressed in existing password modal");
            e.preventDefault()
            handleSubmit()
        }
    }
    passwordInput.addEventListener("keydown", handleEnter)

    return modal
}