import { Entity, Relation } from '../../../types.js';
import { DatasetConfig } from './types.js';

export class DatasetGenerator {
  private entityTypes = ['Person', 'Organization', 'Project', 'Document', 'Location'];
  private relationTypes = ['works_for', 'collaborates_with', 'manages', 'funds', 'located_at', 'authored', 'contributes_to'];
  private adjectives = ['innovative', 'strategic', 'global', 'advanced', 'critical', 'emerging', 'sustainable'];
  private nouns = ['technology', 'research', 'development', 'initiative', 'platform', 'solution', 'framework'];

  constructor(private seed: number = 42) {
    // Simple deterministic random for reproducibility
    this.random = this.createRandom(seed);
  }

  private random: () => number;

  private createRandom(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state * 1664525 + 1013904223) % 2147483648;
      return state / 2147483648;
    };
  }

  generateDataset(config: DatasetConfig): { entities: Entity[], relations: Relation[] } {
    const { entityCount, relationMultiplier, observationsPerEntity } = config;
    
    const entities = this.generateEntities(entityCount, observationsPerEntity);
    const relations = this.generateRelations(entities, Math.floor(entityCount * relationMultiplier));

    return { entities, relations };
  }

  private generateEntities(count: number, observationsPerEntity: number): Entity[] {
    const entities: Entity[] = [];

    for (let i = 0; i < count; i++) {
      const entityType = this.entityTypes[Math.floor(this.random() * this.entityTypes.length)];
      const name = `${entityType}_${i}_${this.generateName()}`;
      
      const observations: string[] = [];
      for (let j = 0; j < observationsPerEntity; j++) {
        observations.push(this.generateObservation(name, entityType, j));
      }

      entities.push({
        name,
        entityType,
        observations,
      });
    }

    return entities;
  }

  private generateRelations(entities: Entity[], count: number): Relation[] {
    const relations: Relation[] = [];
    const entityNames = entities.map(e => e.name);
    const addedRelations = new Set<string>();

    for (let i = 0; i < count; i++) {
      let attempts = 0;
      let relationKey: string;
      let from: string;
      let to: string;
      let relationType: string;

      // Try to generate unique relations
      do {
        from = entityNames[Math.floor(this.random() * entityNames.length)];
        to = entityNames[Math.floor(this.random() * entityNames.length)];
        relationType = this.relationTypes[Math.floor(this.random() * this.relationTypes.length)];
        relationKey = `${from}-${relationType}-${to}`;
        attempts++;
      } while (
        (from === to || addedRelations.has(relationKey)) && 
        attempts < 100
      );

      if (attempts < 100 && from !== to) {
        relations.push({ from, to, relationType });
        addedRelations.add(relationKey);
      }
    }

    return relations;
  }

  private generateName(): string {
    const adj = this.adjectives[Math.floor(this.random() * this.adjectives.length)];
    const noun = this.nouns[Math.floor(this.random() * this.nouns.length)];
    const num = Math.floor(this.random() * 1000);
    return `${adj}_${noun}_${num}`;
  }

  private generateObservation(name: string, type: string, index: number): string {
    const templates = [
      `${name} is a ${type} that focuses on ${this.generateName()}`,
      `Important details about ${name}: established in ${2000 + Math.floor(this.random() * 24)}`,
      `${name} has been recognized for excellence in ${this.generateName()}`,
      `Key metrics for ${name}: ${Math.floor(this.random() * 1000)} units processed`,
      `${name} collaborates with multiple partners on ${this.generateName()}`,
      `Recent update for ${name}: expanded operations to include ${this.generateName()}`,
      `${name} achieved milestone #${index + 1} in Q${Math.floor(this.random() * 4) + 1}`,
    ];

    const template = templates[Math.floor(this.random() * templates.length)];
    
    // Add variable length content to test different observation sizes
    const extraContent = index % 3 === 0 
      ? `. Additional context: ${this.generateLongText(50 + Math.floor(this.random() * 200))}`
      : '';

    return template + extraContent;
  }

  private generateLongText(length: number): string {
    const words = ['data', 'process', 'system', 'analysis', 'network', 'protocol', 
                   'interface', 'module', 'component', 'service', 'application'];
    let text = '';
    
    while (text.length < length) {
      text += words[Math.floor(this.random() * words.length)] + ' ';
    }
    
    return text.trim();
  }

  // Generate search queries based on the dataset
  generateSearchQueries(entities: Entity[], count: number): string[] {
    const queries: string[] = [];
    
    for (let i = 0; i < count; i++) {
      const queryType = Math.floor(this.random() * 4);
      
      switch (queryType) {
        case 0: { // Exact entity name
          const entity = entities[Math.floor(this.random() * entities.length)];
          queries.push(entity.name);
          break;
        }
        
        case 1: { // Partial name
          const entity2 = entities[Math.floor(this.random() * entities.length)];
          const parts = entity2.name.split('_');
          queries.push(parts[Math.floor(this.random() * parts.length)]);
          break;
        }
        
        case 2: // Entity type
          queries.push(this.entityTypes[Math.floor(this.random() * this.entityTypes.length)]);
          break;
        
        case 3: // Common word
          queries.push(this.nouns[Math.floor(this.random() * this.nouns.length)]);
          break;
      }
    }
    
    return queries;
  }
}