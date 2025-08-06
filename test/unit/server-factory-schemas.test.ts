import { describe, it, expect } from 'vitest';
import {
  CreateEntitiesSchema,
  CreateRelationsSchema,
  AddObservationsSchema,
  DeleteEntitiesSchema,
  DeleteObservationsSchema,
  DeleteRelationsSchema,
  ReadGraphSchema,
  SearchNodesSchema,
  OpenNodesSchema
} from '../../server-factory-schemas.js';

describe('server-factory-schemas', () => {
  describe('CreateEntitiesSchema', () => {
    it('should have correct structure', () => {
      expect(CreateEntitiesSchema.type).toBe('object');
      expect(CreateEntitiesSchema.required).toEqual(['entities']);
      expect(CreateEntitiesSchema.properties.entities.type).toBe('array');
    });

    it('should define entity item structure correctly', () => {
      const entityItem = CreateEntitiesSchema.properties.entities.items;
      expect(entityItem.type).toBe('object');
      expect(entityItem.required).toEqual(['name', 'entityType', 'observations']);
      expect(entityItem.properties.name.type).toBe('string');
      expect(entityItem.properties.entityType.type).toBe('string');
      expect(entityItem.properties.observations.type).toBe('array');
      expect(entityItem.properties.observations.items.type).toBe('string');
    });

    it('should include descriptions', () => {
      const entityItem = CreateEntitiesSchema.properties.entities.items;
      expect(entityItem.properties.name.description).toBe('The name of the entity');
      expect(entityItem.properties.entityType.description).toBe('The type of the entity');
      expect(entityItem.properties.observations.description).toContain('observation contents');
    });
  });

  describe('CreateRelationsSchema', () => {
    it('should have correct structure', () => {
      expect(CreateRelationsSchema.type).toBe('object');
      expect(CreateRelationsSchema.required).toEqual(['relations']);
      expect(CreateRelationsSchema.properties.relations.type).toBe('array');
    });

    it('should define relation item structure correctly', () => {
      const relationItem = CreateRelationsSchema.properties.relations.items;
      expect(relationItem.type).toBe('object');
      expect(relationItem.required).toEqual(['from', 'to', 'relationType']);
      expect(relationItem.properties.from.type).toBe('string');
      expect(relationItem.properties.to.type).toBe('string');
      expect(relationItem.properties.relationType.type).toBe('string');
    });

    it('should include descriptions', () => {
      const relationItem = CreateRelationsSchema.properties.relations.items;
      expect(relationItem.properties.from.description).toContain('starts');
      expect(relationItem.properties.to.description).toContain('ends');
      expect(relationItem.properties.relationType.description).toBe('The type of the relation');
    });
  });

  describe('AddObservationsSchema', () => {
    it('should have correct structure', () => {
      expect(AddObservationsSchema.type).toBe('object');
      expect(AddObservationsSchema.required).toEqual(['observations']);
      expect(AddObservationsSchema.properties.observations.type).toBe('array');
    });

    it('should define observation item structure correctly', () => {
      const observationItem = AddObservationsSchema.properties.observations.items;
      expect(observationItem.type).toBe('object');
      expect(observationItem.required).toEqual(['entityName', 'contents']);
      expect(observationItem.properties.entityName.type).toBe('string');
      expect(observationItem.properties.contents.type).toBe('array');
      expect(observationItem.properties.contents.items.type).toBe('string');
    });

    it('should include descriptions', () => {
      const observationItem = AddObservationsSchema.properties.observations.items;
      expect(observationItem.properties.entityName.description).toContain('entity to add');
      expect(observationItem.properties.contents.description).toContain('observation contents');
    });
  });

  describe('DeleteEntitiesSchema', () => {
    it('should have correct structure', () => {
      expect(DeleteEntitiesSchema.type).toBe('object');
      expect(DeleteEntitiesSchema.required).toEqual(['entityNames']);
      expect(DeleteEntitiesSchema.properties.entityNames.type).toBe('array');
      expect(DeleteEntitiesSchema.properties.entityNames.items.type).toBe('string');
    });

    it('should include description', () => {
      expect(DeleteEntitiesSchema.properties.entityNames.description).toContain('entity names to delete');
    });
  });

  describe('DeleteObservationsSchema', () => {
    it('should have correct structure', () => {
      expect(DeleteObservationsSchema.type).toBe('object');
      expect(DeleteObservationsSchema.required).toEqual(['deletions']);
      expect(DeleteObservationsSchema.properties.deletions.type).toBe('array');
    });

    it('should define deletion item structure correctly', () => {
      const deletionItem = DeleteObservationsSchema.properties.deletions.items;
      expect(deletionItem.type).toBe('object');
      expect(deletionItem.required).toEqual(['entityName', 'observations']);
      expect(deletionItem.properties.entityName.type).toBe('string');
      expect(deletionItem.properties.observations.type).toBe('array');
      expect(deletionItem.properties.observations.items.type).toBe('string');
    });

    it('should include descriptions', () => {
      const deletionItem = DeleteObservationsSchema.properties.deletions.items;
      expect(deletionItem.properties.entityName.description).toContain('entity containing');
      expect(deletionItem.properties.observations.description).toContain('observations to delete');
    });
  });

  describe('DeleteRelationsSchema', () => {
    it('should have correct structure', () => {
      expect(DeleteRelationsSchema.type).toBe('object');
      expect(DeleteRelationsSchema.required).toEqual(['relations']);
      expect(DeleteRelationsSchema.properties.relations.type).toBe('array');
    });

    it('should define relation item structure correctly', () => {
      const relationItem = DeleteRelationsSchema.properties.relations.items;
      expect(relationItem.type).toBe('object');
      expect(relationItem.required).toEqual(['from', 'to', 'relationType']);
      expect(relationItem.properties.from.type).toBe('string');
      expect(relationItem.properties.to.type).toBe('string');
      expect(relationItem.properties.relationType.type).toBe('string');
    });

    it('should include description for relations array', () => {
      expect(DeleteRelationsSchema.properties.relations.description).toContain('relations to delete');
    });
  });

  describe('ReadGraphSchema', () => {
    it('should have correct structure', () => {
      expect(ReadGraphSchema.type).toBe('object');
      expect(ReadGraphSchema.properties).toEqual({});
    });

    it('should not have required fields', () => {
      expect(ReadGraphSchema.required).toBeUndefined();
    });
  });

  describe('SearchNodesSchema', () => {
    it('should have correct structure', () => {
      expect(SearchNodesSchema.type).toBe('object');
      expect(SearchNodesSchema.required).toEqual(['query']);
      expect(SearchNodesSchema.properties.query.type).toBe('string');
    });

    it('should include description', () => {
      expect(SearchNodesSchema.properties.query.description).toContain('search query');
      expect(SearchNodesSchema.properties.query.description).toContain('entity names');
      expect(SearchNodesSchema.properties.query.description).toContain('observation content');
    });
  });

  describe('OpenNodesSchema', () => {
    it('should have correct structure', () => {
      expect(OpenNodesSchema.type).toBe('object');
      expect(OpenNodesSchema.required).toEqual(['names']);
      expect(OpenNodesSchema.properties.names.type).toBe('array');
      expect(OpenNodesSchema.properties.names.items.type).toBe('string');
    });

    it('should include description', () => {
      expect(OpenNodesSchema.properties.names.description).toContain('entity names to retrieve');
    });
  });

  describe('Schema validation patterns', () => {
    it('should all be valid JSON Schema objects', () => {
      const schemas = [
        CreateEntitiesSchema,
        CreateRelationsSchema,
        AddObservationsSchema,
        DeleteEntitiesSchema,
        DeleteObservationsSchema,
        DeleteRelationsSchema,
        ReadGraphSchema,
        SearchNodesSchema,
        OpenNodesSchema
      ];

      schemas.forEach(schema => {
        expect(schema).toHaveProperty('type');
        expect(schema.type).toBe('object');
        expect(schema).toHaveProperty('properties');
        expect(typeof schema.properties).toBe('object');
      });
    });

    it('should have consistent naming for entity-related fields', () => {
      // Check that entityType is used in CreateEntities
      const createEntityItem = CreateEntitiesSchema.properties.entities.items;
      expect(createEntityItem.properties).toHaveProperty('entityType');
      
      // Check that relationType is used in relations
      const createRelationItem = CreateRelationsSchema.properties.relations.items;
      expect(createRelationItem.properties).toHaveProperty('relationType');
      
      const deleteRelationItem = DeleteRelationsSchema.properties.relations.items;
      expect(deleteRelationItem.properties).toHaveProperty('relationType');
    });

    it('should use consistent field names across schemas', () => {
      // Entity name fields
      expect(CreateEntitiesSchema.properties.entities.items.properties.name).toBeDefined();
      expect(AddObservationsSchema.properties.observations.items.properties.entityName).toBeDefined();
      expect(DeleteEntitiesSchema.properties.entityNames).toBeDefined();
      expect(DeleteObservationsSchema.properties.deletions.items.properties.entityName).toBeDefined();
      
      // Relation fields
      expect(CreateRelationsSchema.properties.relations.items.properties.from).toBeDefined();
      expect(CreateRelationsSchema.properties.relations.items.properties.to).toBeDefined();
      expect(DeleteRelationsSchema.properties.relations.items.properties.from).toBeDefined();
      expect(DeleteRelationsSchema.properties.relations.items.properties.to).toBeDefined();
    });

    it('should define array items properly', () => {
      // Check all array properties have items defined
      expect(CreateEntitiesSchema.properties.entities.items).toBeDefined();
      expect(CreateRelationsSchema.properties.relations.items).toBeDefined();
      expect(AddObservationsSchema.properties.observations.items).toBeDefined();
      expect(DeleteEntitiesSchema.properties.entityNames.items).toBeDefined();
      expect(DeleteObservationsSchema.properties.deletions.items).toBeDefined();
      expect(DeleteRelationsSchema.properties.relations.items).toBeDefined();
      expect(OpenNodesSchema.properties.names.items).toBeDefined();
      
      // Check nested arrays
      const entityObservations = CreateEntitiesSchema.properties.entities.items.properties.observations;
      expect(entityObservations.items).toBeDefined();
      expect(entityObservations.items.type).toBe('string');
      
      const addObsContents = AddObservationsSchema.properties.observations.items.properties.contents;
      expect(addObsContents.items).toBeDefined();
      expect(addObsContents.items.type).toBe('string');
    });
  });

  describe('Required fields validation', () => {
    it('should mark critical fields as required in CreateEntitiesSchema', () => {
      const required = CreateEntitiesSchema.properties.entities.items.required;
      expect(required).toContain('name');
      expect(required).toContain('entityType');
      expect(required).toContain('observations');
    });

    it('should mark critical fields as required in CreateRelationsSchema', () => {
      const required = CreateRelationsSchema.properties.relations.items.required;
      expect(required).toContain('from');
      expect(required).toContain('to');
      expect(required).toContain('relationType');
    });

    it('should mark critical fields as required in AddObservationsSchema', () => {
      const required = AddObservationsSchema.properties.observations.items.required;
      expect(required).toContain('entityName');
      expect(required).toContain('contents');
    });

    it('should mark critical fields as required in DeleteObservationsSchema', () => {
      const required = DeleteObservationsSchema.properties.deletions.items.required;
      expect(required).toContain('entityName');
      expect(required).toContain('observations');
    });
  });
});