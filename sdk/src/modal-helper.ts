

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

export function createModal() {
    const div = document.createElement("div")
}