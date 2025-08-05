import { Entity, Relation } from '../types.js';
import { getLogger } from '../monitoring/logger.js';

const logger = getLogger('security-validator');

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export class SecurityValidator {
  private maxEntityNameLength: number;
  private maxObservationLength: number;
  private maxRelationTypeLength: number;
  private maxObservationsPerEntity: number;
  private bannedPatterns: RegExp[];

  constructor(config?: {
    maxEntityNameLength?: number;
    maxObservationLength?: number;
    maxRelationTypeLength?: number;
    maxObservationsPerEntity?: number;
    bannedPatterns?: RegExp[];
  }) {
    this.maxEntityNameLength = config?.maxEntityNameLength || 256;
    this.maxObservationLength = config?.maxObservationLength || 4096;
    this.maxRelationTypeLength = config?.maxRelationTypeLength || 128;
    this.maxObservationsPerEntity = config?.maxObservationsPerEntity || 1000;
    this.bannedPatterns = config?.bannedPatterns || [
      /[<>]/g, // Basic XSS prevention
      /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, // eslint-disable-line no-control-regex
      /--/g, // SQL comment
      /\/\*/g, // SQL comment
      /\*\//g, // SQL comment
      /;.*?(CREATE|DROP|ALTER|TRUNCATE|DELETE|UPDATE|INSERT)/gi, // SQL injection patterns
    ];
  }

  validateEntity(entity: Entity): ValidationResult {
    const errors: string[] = [];

    // Validate name
    if (!entity.name || typeof entity.name !== 'string') {
      errors.push('Entity name must be a non-empty string');
    } else {
      if (entity.name.length > this.maxEntityNameLength) {
        errors.push(`Entity name exceeds maximum length of ${this.maxEntityNameLength}`);
      }
      
      const nameIssues = this.checkForMaliciousPatterns(entity.name, 'entity name');
      errors.push(...nameIssues);
    }

    // Validate entity type
    if (!entity.entityType || typeof entity.entityType !== 'string') {
      errors.push('Entity type must be a non-empty string');
    } else {
      if (entity.entityType.length > this.maxEntityNameLength) {
        errors.push(`Entity type exceeds maximum length of ${this.maxEntityNameLength}`);
      }
      
      const typeIssues = this.checkForMaliciousPatterns(entity.entityType, 'entity type');
      errors.push(...typeIssues);
    }

    // Validate observations
    if (!Array.isArray(entity.observations)) {
      errors.push('Entity observations must be an array');
    } else {
      if (entity.observations.length > this.maxObservationsPerEntity) {
        errors.push(`Entity has too many observations (${entity.observations.length} > ${this.maxObservationsPerEntity})`);
      }

      entity.observations.forEach((obs, index) => {
        if (typeof obs !== 'string') {
          errors.push(`Observation at index ${index} must be a string`);
        } else {
          if (obs.length > this.maxObservationLength) {
            errors.push(`Observation at index ${index} exceeds maximum length of ${this.maxObservationLength}`);
          }
          
          const obsIssues = this.checkForMaliciousPatterns(obs, `observation ${index}`);
          errors.push(...obsIssues);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  validateRelation(relation: Relation): ValidationResult {
    const errors: string[] = [];

    // Validate from
    if (!relation.from || typeof relation.from !== 'string') {
      errors.push('Relation "from" must be a non-empty string');
    } else {
      if (relation.from.length > this.maxEntityNameLength) {
        errors.push(`Relation "from" exceeds maximum length of ${this.maxEntityNameLength}`);
      }
      
      const fromIssues = this.checkForMaliciousPatterns(relation.from, 'relation from');
      errors.push(...fromIssues);
    }

    // Validate to
    if (!relation.to || typeof relation.to !== 'string') {
      errors.push('Relation "to" must be a non-empty string');
    } else {
      if (relation.to.length > this.maxEntityNameLength) {
        errors.push(`Relation "to" exceeds maximum length of ${this.maxEntityNameLength}`);
      }
      
      const toIssues = this.checkForMaliciousPatterns(relation.to, 'relation to');
      errors.push(...toIssues);
    }

    // Validate relation type
    if (!relation.relationType || typeof relation.relationType !== 'string') {
      errors.push('Relation type must be a non-empty string');
    } else {
      if (relation.relationType.length > this.maxRelationTypeLength) {
        errors.push(`Relation type exceeds maximum length of ${this.maxRelationTypeLength}`);
      }
      
      const typeIssues = this.checkForMaliciousPatterns(relation.relationType, 'relation type');
      errors.push(...typeIssues);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private checkForMaliciousPatterns(text: string, fieldName: string): string[] {
    const errors: string[] = [];

    for (const pattern of this.bannedPatterns) {
      if (pattern.test(text)) {
        errors.push(`${fieldName} contains potentially malicious pattern: ${pattern}`);
        logger.warn('Malicious pattern detected', { 
          field: fieldName, 
          pattern: pattern.toString(),
          sample: text.substring(0, 50)
        });
      }
    }

    return errors;
  }

  // Sanitize input by removing malicious patterns
  sanitize(text: string): string {
    let sanitized = text;

    // Remove control characters
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''); // eslint-disable-line no-control-regex

    // Escape HTML-like characters
    sanitized = sanitized
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');

    return sanitized;
  }

  // Rate limiting helper
  createRateLimiter(maxRequests: number, windowMs: number): (key: string) => boolean {
    const requests = new Map<string, number[]>();

    return (key: string): boolean => {
      const now = Date.now();
      const userRequests = requests.get(key) || [];
      
      // Remove old requests outside the window
      const validRequests = userRequests.filter(time => now - time < windowMs);
      
      if (validRequests.length >= maxRequests) {
        logger.warn('Rate limit exceeded', { key, requests: validRequests.length });
        return false;
      }

      validRequests.push(now);
      requests.set(key, validRequests);
      
      return true;
    };
  }
}

// Export singleton instance
export const validator = new SecurityValidator();