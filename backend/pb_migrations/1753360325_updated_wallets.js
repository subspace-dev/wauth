/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_120182150")

  // remove field
  collection.fields.removeById("json2080773")

  // add field
  collection.fields.addAt(4, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text1452109028",
    "max": 0,
    "min": 0,
    "name": "encrypted_jwk",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": true,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(5, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text2415649015",
    "max": 0,
    "min": 0,
    "name": "salt",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": true,
    "system": false,
    "type": "text"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_120182150")

  // add field
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

  // remove field
  collection.fields.removeById("text1452109028")

  // remove field
  collection.fields.removeById("text2415649015")

  return app.save(collection)
})
