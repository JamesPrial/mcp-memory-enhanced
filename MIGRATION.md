# JSON to SQLite Migration Guide

This guide provides detailed instructions for migrating from the JSON storage backend to the SQLite storage backend in the Enhanced MCP Memory Server.

## Table of Contents
- [Overview](#overview)
- [Benefits of Migration](#benefits-of-migration)
- [Pre-Migration Checklist](#pre-migration-checklist)
- [Migration Methods](#migration-methods)
  - [Automated Migration](#automated-migration)
  - [Manual Migration](#manual-migration)
  - [Incremental Migration](#incremental-migration)
- [Data Validation](#data-validation)
- [Rollback Procedures](#rollback-procedures)
- [Post-Migration Steps](#post-migration-steps)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)

## Overview

The migration process converts your existing JSON-based memory graph to a SQLite database, providing significant performance improvements while maintaining 100% data integrity and compatibility.

### Migration Architecture

```
JSON File                    SQLite Database
├── entities.json     →      ├── entities table
├── relations.json    →      ├── relations table
└── metadata.json     →      └── metadata table
```

## Benefits of Migration

| Metric | JSON Backend | SQLite Backend | Improvement |
|--------|--------------|----------------|-------------|
| Entity Creation | 3.5s (10k) | 0.014s (10k) | **250x faster** |
| Search Speed | 450ms | 30ms | **15x faster** |
| Memory Usage | 850MB | 180MB | **79% reduction** |
| Storage Size | 125MB | 87MB | **30% smaller** |
| Concurrent Access | Limited | Full ACID | **∞ better** |

## Pre-Migration Checklist

Before starting migration:

- [ ] **Backup your data** - Create a complete backup of your JSON files
- [ ] **Check disk space** - Ensure 2x the current data size is available
- [ ] **Stop the server** - Prevent data modifications during migration
- [ ] **Verify JSON integrity** - Run validation tool on existing data
- [ ] **Plan downtime** - Migration takes ~1 minute per 100k entities
- [ ] **Test migration** - Run with `--dry-run` flag first

## Migration Methods

### Automated Migration

The recommended approach using the built-in migration tool:

```bash
# Using Docker
docker run --rm \
  -v /path/to/json/data:/source:ro \
  -v /path/to/sqlite/data:/target \
  ghcr.io/jamesprial/mcp-memory-enhanced:latest \
  npm run migrate -- \
    --source /source \
    --target /target \
    --verbose

# Using source installation
cd src/memory
npm run migrate -- \
  --source /path/to/json/data \
  --target /path/to/sqlite/data \
  --verbose
```

#### Migration Options

| Option | Description | Default |
|--------|-------------|---------|
| `--source` | Path to JSON data directory | Required |
| `--target` | Path for SQLite database | Required |
| `--verbose` | Enable detailed logging | `false` |
| `--dry-run` | Preview without migrating | `false` |
| `--batch-size` | Entities per transaction | `1000` |
| `--validate` | Validate after migration | `true` |
| `--compress` | Compress backup files | `true` |

### Manual Migration

For custom migration requirements:

```javascript
// migration-custom.js
const { JSONStorage } = require('./storage/json-storage');
const { SQLiteStorage } = require('./storage/sqlite-storage');

async function migrate() {
  // Initialize storages
  const jsonStorage = new JSONStorage({ 
    path: '/path/to/json/data' 
  });
  const sqliteStorage = new SQLiteStorage({ 
    filename: '/path/to/sqlite/memory.db' 
  });

  // Load JSON data
  await jsonStorage.initialize();
  const graph = await jsonStorage.readGraph();

  // Initialize SQLite
  await sqliteStorage.initialize();

  // Migrate entities
  console.log(`Migrating ${graph.entities.length} entities...`);
  for (const entity of graph.entities) {
    await sqliteStorage.createEntity(
      entity.name,
      entity.entityType,
      entity.observations
    );
  }

  // Migrate relations
  console.log(`Migrating ${graph.relations.length} relations...`);
  for (const relation of graph.relations) {
    await sqliteStorage.createRelation(
      relation.from,
      relation.to,
      relation.relationType
    );
  }

  console.log('Migration complete!');
}

migrate().catch(console.error);
```

### Incremental Migration

For zero-downtime migration of large datasets:

```bash
# Step 1: Initial sync (server remains online with JSON)
npm run migrate -- \
  --source /json/data \
  --target /sqlite/data \
  --mode incremental \
  --since "2024-01-01T00:00:00Z"

# Step 2: Stop server and final sync
docker stop mcp-memory
npm run migrate -- \
  --source /json/data \
  --target /sqlite/data \
  --mode incremental \
  --since "1 hour ago"

# Step 3: Switch to SQLite backend
docker run -d \
  -e STORAGE_TYPE=sqlite \
  -v /sqlite/data:/data \
  mcp-memory-enhanced
```

## Data Validation

### Pre-Migration Validation

Validate JSON data integrity:

```bash
# Check JSON structure
npm run validate -- \
  --file /path/to/memory.json \
  --schema src/schemas/memory.schema.json

# Verify entity counts
jq '.entities | length' /path/to/memory.json
jq '.relations | length' /path/to/memory.json
```

### Post-Migration Validation

Verify migration success:

```bash
# Compare entity counts
npm run validate -- \
  --source /json/data \
  --target /sqlite/data \
  --compare

# Test query performance
npm run benchmark -- \
  --database /sqlite/data/memory.db \
  --operations search,create,read
```

### Validation Output

```
Migration Validation Report
==========================
Source: JSON (/json/data)
Target: SQLite (/sqlite/data)

Entities:
  Source: 10,523 entities
  Target: 10,523 entities
  Match: ✓ 100%

Relations:
  Source: 24,891 relations  
  Target: 24,891 relations
  Match: ✓ 100%

Data Integrity:
  Checksums match: ✓
  No orphaned relations: ✓
  All observations preserved: ✓

Performance Test:
  Search: 30ms (15x improvement)
  Create: 0.014s (250x improvement)
  Memory: 180MB (79% reduction)
```

## Rollback Procedures

If issues occur during or after migration:

### Immediate Rollback

```bash
# Stop the SQLite server
docker stop mcp-memory-enhanced

# Restore JSON backend
docker run -d \
  --name mcp-memory-json \
  -e STORAGE_TYPE=json \
  -v /json/data:/data \
  mcp-memory-enhanced

# Verify functionality
curl http://localhost:6970/health
```

### Data Recovery

```bash
# Restore from automatic backup
tar -xzf /backups/pre-migration-backup.tar.gz \
  -C /json/data

# Or convert SQLite back to JSON
npm run migrate -- \
  --source /sqlite/data/memory.db \
  --target /json/data \
  --format json \
  --reverse
```

## Post-Migration Steps

### 1. Update Configuration

```bash
# Update environment variables
export STORAGE_TYPE=sqlite
export DATA_PATH=/sqlite/data

# Or update docker-compose.yml
environment:
  - STORAGE_TYPE=sqlite
```

### 2. Optimize SQLite Performance

```sql
-- Run optimization commands
PRAGMA optimize;
PRAGMA analysis_limit=1000;
ANALYZE;

-- Configure for production
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -64000;
```

### 3. Set Up Automated Backups

```bash
# Add to crontab
0 2 * * * sqlite3 /data/memory.db ".backup /backups/memory-$(date +\%Y\%m\%d).db"
```

### 4. Monitor Performance

```bash
# Enable metrics collection
docker run -d \
  -e METRICS_ENABLED=true \
  -e METRICS_PORT=9090 \
  mcp-memory-enhanced

# View metrics
curl http://localhost:9090/metrics
```

## Troubleshooting

### Common Issues

#### 1. "Database is locked" Error
```bash
# Solution: Close all connections
fuser -k /path/to/memory.db

# Or increase timeout
npm run migrate -- --busy-timeout 10000
```

#### 2. Out of Memory During Migration
```bash
# Use smaller batch size
npm run migrate -- --batch-size 100

# Or increase available memory
docker run -m 4g ...
```

#### 3. Corrupted JSON File
```bash
# Attempt repair
npm run repair -- --file /path/to/memory.json

# Or skip corrupted entries
npm run migrate -- --skip-errors --log-errors errors.log
```

#### 4. Slow Migration Performance
```bash
# Disable validation during migration
npm run migrate -- --validate false

# Use memory-mapped I/O
npm run migrate -- --mmap-size 1073741824
```

### Debug Mode

Enable detailed logging:

```bash
# Set debug environment
export DEBUG=mcp:migration:*
export LOG_LEVEL=debug

# Run with verbose output
npm run migrate -- --verbose --debug
```

## FAQ

### Q: How long does migration take?
**A:** Approximately 1 minute per 100,000 entities on standard hardware.

### Q: Can I migrate while the server is running?
**A:** Not recommended. Use incremental migration for zero-downtime.

### Q: Will my existing integrations break?
**A:** No. The MCP protocol interface remains identical.

### Q: Can I run both backends simultaneously?
**A:** Yes, on different ports for A/B testing.

### Q: Is the migration reversible?
**A:** Yes, you can convert SQLite back to JSON at any time.

### Q: What happens to timestamps and metadata?
**A:** All metadata is preserved with microsecond precision.

### Q: Can I migrate partially?
**A:** Yes, use filters: `--entities "user:*" --relations "follows"`

### Q: How do I verify data integrity?
**A:** Use `--validate` flag or run `npm run validate` post-migration.

## Support

- **Issues**: [GitHub Issues](https://github.com/JamesPrial/mcp-memory-enhanced/issues)
- **Migration Help**: Tag issues with `migration`
- **Performance Reports**: [PERFORMANCE_RESULTS.md](PERFORMANCE_RESULTS.md)
- **Installation Guide**: [INSTALL.md](INSTALL.md)