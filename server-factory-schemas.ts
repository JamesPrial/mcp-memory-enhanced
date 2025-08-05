export const CreateEntitiesSchema = {
  type: "object",
  properties: {
    entities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The name of the entity"
          },
          entityType: {
            type: "string",
            description: "The type of the entity"
          },
          observations: {
            type: "array",
            description: "An array of observation contents associated with the entity",
            items: {
              type: "string"
            }
          }
        },
        required: ["name", "entityType", "observations"]
      }
    }
  },
  required: ["entities"]
};

export const CreateRelationsSchema = {
  type: "object",
  properties: {
    relations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          from: {
            type: "string",
            description: "The name of the entity where the relation starts"
          },
          to: {
            type: "string",
            description: "The name of the entity where the relation ends"
          },
          relationType: {
            type: "string",
            description: "The type of the relation"
          }
        },
        required: ["from", "to", "relationType"]
      }
    }
  },
  required: ["relations"]
};

export const AddObservationsSchema = {
  type: "object",
  properties: {
    observations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          entityName: {
            type: "string",
            description: "The name of the entity to add the observations to"
          },
          contents: {
            type: "array",
            description: "An array of observation contents to add",
            items: {
              type: "string"
            }
          }
        },
        required: ["entityName", "contents"]
      }
    }
  },
  required: ["observations"]
};

export const DeleteEntitiesSchema = {
  type: "object",
  properties: {
    entityNames: {
      type: "array",
      description: "An array of entity names to delete",
      items: {
        type: "string"
      }
    }
  },
  required: ["entityNames"]
};

export const DeleteObservationsSchema = {
  type: "object",
  properties: {
    deletions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          entityName: {
            type: "string",
            description: "The name of the entity containing the observations"
          },
          observations: {
            type: "array",
            description: "An array of observations to delete",
            items: {
              type: "string"
            }
          }
        },
        required: ["entityName", "observations"]
      }
    }
  },
  required: ["deletions"]
};

export const DeleteRelationsSchema = {
  type: "object",
  properties: {
    relations: {
      type: "array",
      description: "An array of relations to delete",
      items: {
        type: "object",
        properties: {
          from: {
            type: "string",
            description: "The name of the entity where the relation starts"
          },
          to: {
            type: "string",
            description: "The name of the entity where the relation ends"
          },
          relationType: {
            type: "string",
            description: "The type of the relation"
          }
        },
        required: ["from", "to", "relationType"]
      }
    }
  },
  required: ["relations"]
};

export const ReadGraphSchema = {
  type: "object",
  properties: {}
};

export const SearchNodesSchema = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "The search query to match against entity names, types, and observation content"
    }
  },
  required: ["query"]
};

export const OpenNodesSchema = {
  type: "object",
  properties: {
    names: {
      type: "array",
      description: "An array of entity names to retrieve",
      items: {
        type: "string"
      }
    }
  },
  required: ["names"]
};