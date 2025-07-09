/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2554787204")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE UNIQUE INDEX `idx_VyuoakusLV` ON `connected_wallets` (`address`)",
      "CREATE INDEX `idx_LxTNAwin5F` ON `connected_wallets` (`public_key`)"
    ]
  }, collection)

  // add field
  collection.fields.addAt(3, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text1727648867",
    "max": 0,
    "min": 0,
    "name": "public_key",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2554787204")

  // update collection data
  unmarshal({
    "indexes": []
  }, collection)

  // remove field
  collection.fields.removeById("text1727648867")

  return app.save(collection)
})
