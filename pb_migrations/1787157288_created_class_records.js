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
        "help": "",
        "hidden": false,
        "id": "select1002749145",
        "maxSelect": 1,
        "name": "kind",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "select",
        "values": [
          "student",
          "skill",
          "mastery",
          "mastery_event",
          "period",
          "attendance",
          "participation",
          "request_type",
          "request",
          "tag",
          "group",
          "group_member",
          "timer"
        ]
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
        "required": false,
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
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "help": "",
        "hidden": false,
        "id": "text1266139423",
        "max": 15,
        "min": 0,
        "name": "requestTypeId",
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
        "id": "json1110206997",
        "maxSize": 0,
        "name": "payload",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "json"
      },
      {
        "help": "",
        "hidden": false,
        "id": "date2120770295",
        "max": "",
        "min": "",
        "name": "occurredAt",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "date"
      }
    ],
    "id": "pbc_2967208651",
    "indexes": [
      "CREATE INDEX idx_class_records_kind ON class_records (class, kind)",
      "CREATE INDEX idx_class_records_student ON class_records (class, studentId, kind)",
      "CREATE INDEX idx_class_records_period ON class_records (class, periodId, kind)"
    ],
    "listRule": "@request.auth.id != \"\" && class.owner = @request.auth.id",
    "name": "class_records",
    "system": false,
    "type": "base",
    "updateRule": "@request.auth.id != \"\" && class.owner = @request.auth.id",
    "viewRule": "@request.auth.id != \"\" && class.owner = @request.auth.id"
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2967208651");

  return app.delete(collection);
})
