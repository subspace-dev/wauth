/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_120182150")

  // update field
  collection.fields.addAt(2, new Field({
    "hidden": false,
    "id": "json2080773",
    "maxSize": 0,
    "name": "jwk",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "json"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_120182150")

  // update field
  collection.fields.addAt(2, new Field({
    "hidden": true,
    "id": "json2080773",
    "maxSize": 0,
    "name": "jwk",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "json"
  }))

  return app.save(collection)
})
