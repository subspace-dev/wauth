/// <reference path="../pb_data/types.d.ts" />

onBootstrap((e) => {
    console.log("pocketbase started")
    e.next()
})


onRecordAuthWithOAuth2Request((e) => {
    if (e.isNewRecord) {
        console.log("new user signed in with: ", e.providerName)
    }
    else {
        if (e.auth && e.auth.get) {
            console.log("OAuth request:", e.auth.get("email"), e.providerName)
        } else {
            console.log("OAuth request (no auth data yet):", e.providerName)
        }
    }
    e.next()
})

onRecordCreateRequest((e) => {
    const authId = e.auth.get("id")
    console.log("connected wallet create request from", e.auth.email(), authId)
    e.record.set("user", authId)
    e.next()
}, "connected_wallets")

onRecordCreateRequest((e) => {
    const utils = require(`${__hooks}/utils.js`)
    const authId = e.auth.get("id")
    console.log("wallet create request from", e.auth.email(), authId)
    e.record.set("user", authId)

    // if user already has a wallet, skip
    // else get new jwk and address and set in record

    // console.log("finding wallet for user", authId)
    // const wallet = $app.findRecordsByFilter("wallets", `user = "${authId}"`)
    // console.log(wallet.length)
    // console.log("OK")
    try {
        const res = $http.send({
            url: "http://localhost:8091/jwk",
            method: "GET",
        })
        const body = res.body
        const bodyJson = utils.bodyToJson(body)
        e.record.set("jwk", bodyJson.jwk)
        e.record.set("public_key", bodyJson.jwk.n)
        e.record.set("address", bodyJson.address)
    } catch (e) {
        console.log(e)
    }
    e.next()
}, "wallets")

onRecordAfterCreateSuccess((e) => {
    console.log("wallet create success:", e.record.id)
    e.next()
}, "wallets")

onRecordEnrich((e) => {
    e.record.hide("jwk")
    e.next()
}, "wallets")

