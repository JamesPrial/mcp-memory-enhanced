// JSON Schema definitions for MCP tools
export const toolSchemas = {
  memory__create_entities: {
    type: "object",
    properties: {
      entities: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            entityType: { type: "string" },
            observations: {
              type: "array",
              items: { type: "string" }
            }
          },
          required: ["name", "entityType", "observations"]
        }
      }
    },
    required: ["entities"]
  },
  
  memory__create_relations: {
    type: "object",
    properties: {
      relations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            from: { type: "string" },
            to: { type: "string" },
            relationType: { type: "string" }
          },
          required: ["from", "to", "relationType"]
        }
      }
    },
    required: ["relations"]
  },
  
  memory__add_observations: {
    type: "object",
    properties: {
      observations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            entityName: { type: "string" },
            contents: {
              type: "array",
              items: { type: "string" }
            }
          },
          required: ["entityName", "contents"]
        }
      }
    },
    required: ["observations"]
  },
  
  memory__delete_entities: {
    type: "object",
    properties: {
      entityNames: {
        type: "array",
        items: { type: "string" }
      }
    },
    required: ["entityNames"]
  },
  
  memory__delete_observations: {
    type: "object",
    properties: {
      deletions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            entityName: { type: "string" },
            observations: {
              type: "array",
              items: { type: "string" }
            }
          },
          required: ["entityName", "observations"]
        }
      }
    },
    required: ["deletions"]
  },
  
  memory__delete_relations: {
    type: "object",
    properties: {
      relations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            from: { type: "string" },
            to: { type: "string" },
            relationType: { type: "string" }
          },
          required: ["from", "to", "relationType"]
        }
      }
    },
    required: ["relations"]
  },
  
  memory__read_graph: {
    type: "object",
    properties: {}
  },
  
  memory__search_nodes: {
    type: "object",
    properties: {
      query: { type: "string" }
    },
    required: ["query"]
  },
  
  memory__open_nodes: {
    type: "object",
    properties: {
      names: {
        type: "array",
        items: { type: "string" }
      }
    },
    required: ["names"]
  }
};