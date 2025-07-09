import WAuthStrategy, { WAuthProviders } from "@wauth/strategy";

const strategies: { [key: string]: WAuthStrategy } = {
    [WAuthProviders.Google]: new WAuthStrategy({ provider: WAuthProviders.Google }),
    [WAuthProviders.Github]: new WAuthStrategy({ provider: WAuthProviders.Github }),
    [WAuthProviders.Discord]: new WAuthStrategy({ provider: WAuthProviders.Discord })
}

export function getStrategy(provider: WAuthProviders): WAuthStrategy {
    return strategies[provider]
}

export function getActiveWAuthProvider(): WAuthProviders {
    let provider = localStorage.getItem("wallet_kit_strategy_id")
    if (!provider) return null

    if (!provider.startsWith("wauth")) return null
    provider = provider.split("-")[1]

    switch (provider) {
        case WAuthProviders.Google:
            return WAuthProviders.Google
        case WAuthProviders.Github:
            return WAuthProviders.Github
        case WAuthProviders.Discord:
            return WAuthProviders.Discord
        default:
            return null
    }
}