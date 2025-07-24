/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_120182150")

  // update collection data
  unmarshal({
    "deleteRule": "@request.auth.id != \"\" && user.id = @request.auth.id",
    "listRule": "@request.auth.id != \"\" && user.id = @request.auth.id",
    "updateRule": "@request.auth.id != \"\" && user.id = @request.auth.id",
    "viewRule": "@request.auth.id != \"\" && user.id = @request.auth.id"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_120182150")

  // update collection data
  unmarshal({
    "deleteRule": null,
    "listRule": "user.id = @request.auth.id",
    "updateRule": null,
    "viewRule": "user.id = @request.auth.id"
  }, collection)

  return app.save(collection)
})
