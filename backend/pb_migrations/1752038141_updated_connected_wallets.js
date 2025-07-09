/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2554787204")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.id != \"\""
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2554787204")

  // update collection data
  unmarshal({
    "createRule": "user.id != \"\" "
  }, collection)

  return app.save(collection)
})
