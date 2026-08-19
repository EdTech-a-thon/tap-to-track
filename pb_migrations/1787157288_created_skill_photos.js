/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    "createRule": "@request.auth.id != \"\" && @request.body.class.owner = @request.auth.id",
    "deleteRule": "@request.auth.id != \"\" && class.owner = @request.auth.id",
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
        "collectionId": "pbc_2478702895",
        "help": "",
        "hidden": false,
        "id": "relation3981121951",
        "maxSelect": 1,
        "minSelect": 0,
        "name": "class",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "relation"
      },
      {
        "autogeneratePattern": "",
        "help": "",
        "hidden": false,
        "id": "text2562666392",
        "max": 15,
        "min": 0,
        "name": "studentId",
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
        "id": "text3987002527",
        "max": 15,
        "min": 0,
        "name": "skillId",
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
        "id": "text2244690409",
        "max": 15,
        "min": 0,
        "name": "periodId",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "help": "",
        "hidden": false,
        "id": "date557336517",
        "max": "",
        "min": "",
        "name": "assessedAt",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "date"
      },
      {
        "help": "",
        "hidden": false,
        "id": "file347571224",
        "maxSelect": 1,
        "maxSize": 10485760,
        "mimeTypes": [
          "image/jpeg",
          "image/png",
          "image/webp"
        ],
        "name": "photo",
        "presentable": false,
        "protected": true,
        "required": true,
        "system": false,
        "thumbs": null,
        "type": "file"
      }
    ],
    "id": "pbc_1889857739",
    "indexes": [
      "CREATE INDEX idx_skill_photos_student ON skill_photos (class, studentId, skillId)"
    ],
    "listRule": "@request.auth.id != \"\" && class.owner = @request.auth.id",
    "name": "skill_photos",
    "system": false,
    "type": "base",
    "updateRule": "@request.auth.id != \"\" && class.owner = @request.auth.id",
    "viewRule": "@request.auth.id != \"\" && class.owner = @request.auth.id"
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1889857739");

  return app.delete(collection);
})
