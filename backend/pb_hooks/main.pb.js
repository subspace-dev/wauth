/// <reference path="../pb_data/types.d.ts" />

onBootstrap((e) => {
    console.log("pocketbase started")
    e.next()
})


onRecordAuthWithOAuth2Request((e) => {
    if (e.isNewRecord) {
        console.log("new user signed in with", e.providerName)
    }
    else {
        console.log(`${e.auth.get("email")} requested login with ${e.providerName}`)
    }
    e.next()
})

onRecordCreateRequest((e) => {
    const authId = e.auth.get("id")
    console.log("wallet create request from", e.auth.email(), authId)
    e.record.set("user", authId)
    e.next()
}, "wallets")

onRecordAfterCreateSuccess((e) => {
    console.log("wallet create success:", e.record.id)
    e.record.hide("jwk")
    e.next()
}, "wallets")

onRecordEnrich((e) => {
    e.record.hide("jwk")
    e.next()
}, "wallets")

