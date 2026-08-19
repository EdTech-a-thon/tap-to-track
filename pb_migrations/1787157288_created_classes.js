/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    "createRule": "@request.auth.id != \"\" && @request.body.owner = @request.auth.id",
    "deleteRule": "@request.auth.id != \"\" && owner = @request.auth.id",
    "fields": [
      {
        "autogeneratePattern": "[a-z0-9]{15}",
        "help": "",
        "hidden": false,
        "id": "text3208210256",
        "max": 15,
        "min": 15,
        "name": "id",
        "pattern": "^[a-z0-9]+$",
        "presentable": false,
        "primaryKey": true,
        "required": true,
        "system": true,
        "type": "text"
      },
      {
        "cascadeDelete": true,
        "collectionId": "pbc_3614170744",
        "help": "",
        "hidden": false,
        "id": "relation3479234172",
        "maxSelect": 1,
        "minSelect": 0,
        "name": "owner",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "relation"
      },
      {
        "autogeneratePattern": "",
        "help": "",
        "hidden": false,
        "id": "text1579384326",
        "max": 120,
        "min": 1,
        "name": "name",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "help": "",
        "hidden": false,
        "id": "text2792196114",
        "max": 12,
        "min": 6,
        "name": "joinCode",
        "pattern": "^[A-Z0-9]+$",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "help": "",
        "hidden": false,
        "id": "select2943398405",
        "maxSelect": 1,
        "name": "activeLens",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "select",
        "values": [
          "participation",
          "skills"
        ]
      },
      {
        "help": "",
        "hidden": false,
        "id": "json3846545605",
        "maxSize": 0,
        "name": "settings",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "json"
      }
    ],
    "id": "pbc_2478702895",
    "indexes": [
      "CREATE UNIQUE INDEX idx_classes_join_code ON classes (joinCode)"
    ],
    "listRule": "@request.auth.id != \"\" && owner = @request.auth.id",
    "name": "classes",
    "system": false,
    "type": "base",
    "updateRule": "@request.auth.id != \"\" && owner = @request.auth.id",
    "viewRule": "@request.auth.id != \"\" && owner = @request.auth.id"
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2478702895");

  return app.delete(collection);
})
