/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const collection = new Collection({
      createRule: '@request.auth.id != "" && owner = @request.auth.id',
      deleteRule: '@request.auth.id != "" && owner = @request.auth.id',
      fields: [
        {
          autogeneratePattern: "[a-z0-9]{15}",
          help: "",
          hidden: false,
          id: "text3208210256",
          max: 15,
          min: 15,
          name: "id",
          pattern: "^[a-z0-9]+$",
          presentable: false,
          primaryKey: true,
          required: true,
          system: true,
          type: "text",
        },
        {
          cascadeDelete: true,
          collectionId: "pbc_2478702895",
          help: "",
          hidden: false,
          id: "relation3981121951",
          maxSelect: 1,
          minSelect: 0,
          name: "class",
          presentable: false,
          required: true,
          system: false,
          type: "relation",
        },
        {
          help: "",
          hidden: false,
          id: "date60179772",
          max: "",
          min: "",
          name: "openedAt",
          presentable: false,
          required: true,
          system: false,
          type: "date",
        },
        {
          help: "",
          hidden: false,
          id: "date3884100663",
          max: "",
          min: "",
          name: "endedAt",
          presentable: false,
          required: false,
          system: false,
          type: "date",
        },
        {
          cascadeDelete: true,
          collectionId: "_pb_users_auth_",
          help: "",
          hidden: false,
          id: "relation3479234172",
          maxSelect: 1,
          minSelect: 0,
          name: "owner",
          presentable: false,
          required: true,
          system: false,
          type: "relation",
        },
      ],
      id: "pbc_3660498186",
      indexes: [],
      listRule: '@request.auth.id != "" && owner = @request.auth.id',
      name: "sessions",
      system: false,
      type: "base",
      updateRule: '@request.auth.id != "" && owner = @request.auth.id',
      viewRule: '@request.auth.id != "" && owner = @request.auth.id',
    });

    return app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("pbc_3660498186");

    return app.delete(collection);
  },
);
