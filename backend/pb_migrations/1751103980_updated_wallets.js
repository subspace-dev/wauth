/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_120182150")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE UNIQUE INDEX `idx_e77dZ3vqHD` ON `wallets` (`user`)"
    ]
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_120182150")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE INDEX `idx_e77dZ3vqHD` ON `wallets` (\n  `user`,\n  `jwk`,\n  `address`\n)"
    ]
  }, collection)

  return app.save(collection)
})
