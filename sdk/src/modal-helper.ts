
import type { ModalTypes, ModalPayload, ModalResult } from "./index";

export function createModalContainer() {
    const div = document.createElement("div")
    div.style.position = "fixed"
    div.style.top = "0"
    div.style.left = "0"
    div.style.width = "100%"
    div.style.height = "100%"
    div.style.backgroundColor = "rgba(0, 0, 0, 0.5)"
    div.style.zIndex = "9999"
    div.style.display = "flex"
    div.style.justifyContent = "center"
    div.style.alignItems = "center"
    div.style.color = "white"
    div.style.fontSize = "14px"
    div.style.backdropFilter = "blur(5px)"
    return div
}

export function createModal(type: ModalTypes, payload: ModalPayload, onResult: (result: ModalResult) => void): HTMLDivElement {
    if (type === "confirm-tx") {
        return createConfirmTxModal(payload, onResult)
    }
    // Add more modal types as needed
    return document.createElement("div")
}

export function createConfirmTxModal(payload: ModalPayload, onResult: (result: ModalResult) => void): HTMLDivElement {
    // Extract transaction/dataItem details
    const tx = (payload.transaction || payload.dataItem)!
    const tags: { name: string, value: string }[] = tx.tags || []
    const actionTag = tags.find((tag: { name: string, value: string }) => tag.name === "Action")
    const recipientTag = tags.find((tag: { name: string, value: string }) => tag.name === "Recipient")
    const quantityTag = tags.find((tag: { name: string, value: string }) => tag.name === "Quantity")
    const processId = tx.target || "-"
    let from = "-"
    if ('owner' in tx && typeof tx.owner === 'string') {
        from = tx.owner
    } else if ('from' in tx && typeof tx.from === 'string') {
        from = tx.from
    }
    const amount = quantityTag ? quantityTag.value : "0"
    const unit = "AO"

    // Container (overlay)
    const container = document.createElement("div")
    container.id = "modal-container"
    container.style.fontFamily = "'Inter', sans-serif"
    container.style.position = "fixed"
    container.style.top = "0"
    container.style.left = "0"
    container.style.width = "100vw"
    container.style.height = "100vh"
    container.style.backgroundColor = "rgba(0, 0, 0, 0.5)"
    container.style.display = "flex"
    container.style.flexDirection = "column"
    container.style.justifyContent = "center"
    container.style.alignItems = "center"
    container.style.zIndex = "9999"
    container.style.backdropFilter = "blur(3px)"
    container.style.color = "#fff"

    // Modal card
    const modal = document.createElement("div")
    modal.id = "modal-content"
    modal.style.background = "#222"
    modal.style.padding = "32px 28px 24px 28px"
    modal.style.width = "370px"
    modal.style.borderRadius = "18px"
    modal.style.border = "1px solid #333"
    modal.style.boxShadow = "0 0 100px 0 rgba(0, 0, 0, 0.5)"
    modal.style.position = "relative"
    modal.style.display = "flex"
    modal.style.flexDirection = "column"
    modal.style.gap = "18px"

    // Header
    const header = document.createElement("div")
    header.className = "modal-header"
    header.style.display = "flex"
    header.style.justifyContent = "space-between"
    header.style.alignItems = "flex-start"
    header.style.marginBottom = "8px"

    const title = document.createElement("div")
    title.className = "modal-title"
    title.textContent = "Transfer"
    title.style.fontSize = "2rem"
    title.style.fontWeight = "600"
    title.style.letterSpacing = "0.01em"

    const appIcon = document.createElement("img")
    appIcon.className = "modal-appicon"
    appIcon.src = "https://placehold.co/32x32"
    appIcon.alt = "App Icon"
    appIcon.style.width = "32px"
    appIcon.style.height = "32px"
    appIcon.style.borderRadius = "8px"
    appIcon.style.objectFit = "cover"
    appIcon.style.background = "#444"

    header.appendChild(title)
    header.appendChild(appIcon)
    modal.appendChild(header)

    // Description
    const desc = document.createElement("div")
    desc.className = "modal-desc"
    desc.textContent = `'${window.location.hostname}' wants to sign a transaction. Review the details below.`
    desc.style.fontSize = "1rem"
    desc.style.color = "#cfcfd1"
    desc.style.marginBottom = "10px"
    modal.appendChild(desc)

    // Center (token logo, amount)
    const center = document.createElement("div")
    center.className = "modal-center"
    center.style.display = "flex"
    center.style.flexDirection = "column"
    center.style.alignItems = "center"
    center.style.margin = "10px 0 18px 0"

    const tokenLogo = document.createElement("img")
    tokenLogo.className = "token-logo"
    tokenLogo.src = "https://placehold.co/64x64"
    tokenLogo.alt = "App Icon"
    tokenLogo.style.width = "64px"
    tokenLogo.style.height = "64px"
    tokenLogo.style.borderRadius = "20%"
    tokenLogo.style.background = "#fff"
    tokenLogo.style.display = "flex"
    tokenLogo.style.alignItems = "center"
    tokenLogo.style.justifyContent = "center"
    tokenLogo.style.marginBottom = "8px"
    tokenLogo.style.border = "3px solid #6c63ff"
    center.appendChild(tokenLogo)

    const tokenAmount = document.createElement("div")
    tokenAmount.className = "token-amount"
    tokenAmount.textContent = `${amount} `
    tokenAmount.style.fontSize = "2.5rem"
    tokenAmount.style.fontWeight = "700"
    tokenAmount.style.color = "#fff"
    tokenAmount.style.marginBottom = "2px"
    const tokenUnit = document.createElement("span")
    tokenUnit.className = "token-unit"
    tokenUnit.textContent = unit
    tokenUnit.style.fontSize = "1.2rem"
    tokenUnit.style.color = "#cfcfd1"
    tokenUnit.style.marginLeft = "4px"
    tokenAmount.appendChild(tokenUnit)
    center.appendChild(tokenAmount)
    modal.appendChild(center)

    // Details
    const details = document.createElement("div")
    details.className = "modal-details"
    details.style.margin = "0 0 10px 0"

    // Process ID row
    const row1 = document.createElement("div")
    row1.className = "modal-details-row"
    row1.style.display = "flex"
    row1.style.justifyContent = "space-between"
    row1.style.marginBottom = "4px"
    row1.style.fontSize = "1rem"
    const label1 = document.createElement("span")
    label1.className = "modal-details-label"
    label1.textContent = "Process ID"
    label1.style.color = "#b3b3b3"
    const value1 = document.createElement("span")
    value1.className = "modal-details-value"
    value1.textContent = processId
    value1.style.color = "#fff"
    value1.style.fontFamily = "'JetBrains Mono', monospace"
    row1.appendChild(label1)
    row1.appendChild(value1)
    details.appendChild(row1)

    // From row
    const row2 = document.createElement("div")
    row2.className = "modal-details-row"
    row2.style.display = "flex"
    row2.style.justifyContent = "space-between"
    row2.style.marginBottom = "4px"
    row2.style.fontSize = "1rem"
    const label2 = document.createElement("span")
    label2.className = "modal-details-label"
    label2.textContent = "From"
    label2.style.color = "#b3b3b3"
    const value2 = document.createElement("span")
    value2.className = "modal-details-value"
    value2.textContent = from
    value2.style.color = "#fff"
    value2.style.fontFamily = "'JetBrains Mono', monospace"
    row2.appendChild(label2)
    row2.appendChild(value2)
    details.appendChild(row2)

    // Tags
    const tagsDiv = document.createElement("div")
    tagsDiv.className = "modal-tags"
    tagsDiv.style.display = "flex"
    tagsDiv.style.flexDirection = "column"
    tagsDiv.style.gap = "4px"
    tagsDiv.style.marginTop = "8px"
    tagsDiv.style.maxHeight = "100px"
    tagsDiv.style.overflowY = "auto"
    const tagsTitle = document.createElement("div")
    tagsTitle.className = "modal-tags-title"
    tagsTitle.textContent = "Tags"
    tagsTitle.style.color = "#b3b3b3"
    tagsTitle.style.fontSize = "1.1rem"
    tagsTitle.style.marginBottom = "4px"
    tagsDiv.appendChild(tagsTitle)
    // Add tag rows
    tags.forEach((tag: { name: string, value: string }) => {
        const tagRow = document.createElement("div")
        tagRow.className = "modal-tag"
        tagRow.style.display = "flex"
        tagRow.style.justifyContent = "space-between"
        tagRow.style.alignItems = "center"
        tagRow.style.marginBottom = "4px"
        tagRow.style.fontSize = "1rem"
        const tagLabel = document.createElement("span")
        tagLabel.className = "modal-tag-label"
        tagLabel.textContent = tag.name
        tagLabel.style.color = "#b3b3b3"
        tagLabel.style.fontSize = "0.95rem"
        const tagValue = document.createElement("span")
        tagValue.className = "modal-tag-value"
        tagValue.textContent = tag.value
        tagValue.style.color = "#fff"
        tagRow.appendChild(tagLabel)
        tagRow.appendChild(tagValue)
        tagsDiv.appendChild(tagRow)
    })
    details.appendChild(tagsDiv)
    modal.appendChild(details)

    // Actions
    const actions = document.createElement("div")
    actions.className = "modal-actions"
    actions.style.display = "flex"
    actions.style.flexDirection = "column"
    actions.style.gap = "12px"

    const signBtn = document.createElement("button")
    signBtn.className = "modal-btn modal-btn-primary"
    signBtn.textContent = "Sign"
    signBtn.style.width = "100%"
    signBtn.style.padding = "14px 0"
    signBtn.style.border = "none"
    signBtn.style.borderRadius = "10px"
    signBtn.style.fontSize = "1.1rem"
    signBtn.style.fontWeight = "600"
    signBtn.style.cursor = "pointer"
    signBtn.style.background = "linear-gradient(90deg, #6c63ff 0%, #7f6fff 100%)"
    signBtn.style.color = "#fff"
    signBtn.onclick = () => onResult({ proceed: true })
    signBtn.onmouseover = () => signBtn.style.background = "linear-gradient(90deg, #7f6fff 0%, #6c63ff 100%)"
    signBtn.onmouseleave = () => signBtn.style.background = "linear-gradient(90deg, #6c63ff 0%, #7f6fff 100%)"
    actions.appendChild(signBtn)

    const cancelBtn = document.createElement("button")
    cancelBtn.className = "modal-btn modal-btn-secondary"
    cancelBtn.textContent = "Cancel"
    cancelBtn.style.width = "100%"
    cancelBtn.style.padding = "14px 0"
    cancelBtn.style.border = "1px solid #333"
    cancelBtn.style.borderRadius = "10px"
    cancelBtn.style.fontSize = "1.1rem"
    cancelBtn.style.fontWeight = "600"
    cancelBtn.style.cursor = "pointer"
    cancelBtn.style.background = "#18181b"
    cancelBtn.style.color = "#fff"
    cancelBtn.onmouseover = () => cancelBtn.style.background = "#232326"
    cancelBtn.onmouseleave = () => cancelBtn.style.background = "#18181b"
    cancelBtn.onclick = () => onResult({ proceed: false })
    actions.appendChild(cancelBtn)

    modal.appendChild(actions)

    // Powered by (sibling, not child)
    const powered = document.createElement("div")
    powered.className = "wauth-powered"
    powered.innerHTML = '<a href="https://wauth_subspace.ar.io" target="_blank">powered by wauth</a>'
    powered.style.position = "absolute"
    powered.style.bottom = "15px"
    powered.style.textAlign = "center"
    powered.style.fontSize = "0.95rem"
    powered.style.color = "#b3b3b3"
    powered.style.opacity = "0.7"
    powered.style.letterSpacing = "0.02em"
    powered.style.left = "0"
    powered.style.right = "0"

    container.appendChild(modal)
    container.appendChild(powered)
    return container
}