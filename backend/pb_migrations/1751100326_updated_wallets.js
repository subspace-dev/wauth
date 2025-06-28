/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_120182150")

  // update collection data
  unmarshal({
    "deleteRule": null,
    "updateRule": null
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_120182150")

  // update collection data
  unmarshal({
    "deleteRule": "id = @request.auth.id",
    "updateRule": ""
  }, collection)

  return app.save(collection)
})
