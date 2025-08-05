# Installation and Configuration Guide

This guide covers installation and configuration of the Enhanced MCP Memory Server with SQLite backend support.

## Table of Contents
- [Requirements](#requirements)
- [Installation Methods](#installation-methods)
  - [Docker Installation](#docker-installation)
  - [Source Installation](#source-installation)
  - [UnRAID Installation](#unraid-installation)
- [Configuration](#configuration)
- [Storage Backend Selection](#storage-backend-selection)
- [Migration from JSON to SQLite](#migration-from-json-to-sqlite)
- [Health Checks](#health-checks)
- [Troubleshooting](#troubleshooting)

## Requirements

- **Node.js**: v20 or higher
- **npm**: v10 or higher
- **Docker**: v24 or higher (for Docker installation)
- **Disk Space**: Minimum 1GB free space
- **Memory**: Minimum 512MB RAM (2GB recommended for large datasets)

## Installation Methods

### Docker Installation

The easiest way to get started is using Docker:

```bash
# Pull the latest image
docker pull ghcr.io/jamesprial/mcp-memory-enhanced:latest

# Run with SQLite backend (recommended)
docker run -d \
  --name mcp-memory-enhanced \
  -p 6970:6970 \
  -v /path/to/data:/data \
  -e STORAGE_TYPE=sqlite \
  -e NODE_ENV=production \
  --restart unless-stopped \
  ghcr.io/jamesprial/mcp-memory-enhanced:latest

# Run with JSON backend (legacy compatibility)
docker run -d \
  --name mcp-memory-json \
  -p 6971:6970 \
  -v /path/to/data:/data \
  -e STORAGE_TYPE=json \
  --restart unless-stopped \
  ghcr.io/jamesprial/mcp-memory-enhanced:latest
```

#### Docker Compose

For more complex deployments, use Docker Compose:

```yaml
# docker-compose.yml
version: '3.8'

services:
  mcp-memory:
    image: ghcr.io/jamesprial/mcp-memory-enhanced:latest
    container_name: mcp-memory-enhanced
    ports:
      - "6970:6970"
    volumes:
      - ./data:/data
      - ./backups:/backups
    environment:
      - STORAGE_TYPE=sqlite
      - NODE_ENV=production
      - BACKUP_ENABLED=true
      - BACKUP_SCHEDULE=0 2 * * *
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:6970/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### Source Installation

For development or custom deployments:

```bash
# Clone the repository
git clone https://github.com/JamesPrial/mcp-memory-enhanced.git
cd mcp-memory-enhanced/src/memory

# Install dependencies
npm install

# Build the project
npm run build

# Run with SQLite backend
STORAGE_TYPE=sqlite npm start

# Run with JSON backend
STORAGE_TYPE=json npm start
```

### UnRAID Installation

For UnRAID users, a community template is available:

1. Open UnRAID Docker tab
2. Click "Add Container"
3. Switch to "Template" mode
4. Select "mcp-memory-enhanced" from Community Applications
5. Configure paths and environment variables:
   - **Data Path**: `/mnt/user/appdata/mcp-memory/data`
   - **Backup Path**: `/mnt/user/appdata/mcp-memory/backups`
   - **Storage Type**: `sqlite` (recommended)
6. Click "Apply"

## Configuration

### Environment Variables

| Variable | Description | Default | Options |
|----------|-------------|---------|---------|
| `STORAGE_TYPE` | Storage backend type | `json` | `json`, `sqlite` |
| `DATA_PATH` | Data storage directory | `/data` | Any valid path |
| `BACKUP_PATH` | Backup directory | `/backups` | Any valid path |
| `BACKUP_ENABLED` | Enable automatic backups | `false` | `true`, `false` |
| `BACKUP_SCHEDULE` | Cron schedule for backups | `0 2 * * *` | Cron expression |
| `LOG_LEVEL` | Logging verbosity | `info` | `debug`, `info`, `warn`, `error` |
| `PORT` | Server port | `6970` | Any valid port |
| `HOST` | Server host | `0.0.0.0` | Any valid host |
| `NODE_ENV` | Node environment | `development` | `development`, `production` |

### Configuration File

Create a `config.json` file in the data directory:

```json
{
  "storage": {
    "type": "sqlite",
    "options": {
      "filename": "/data/memory.db",
      "verbose": false,
      "wal": true,
      "busyTimeout": 5000
    }
  },
  "backup": {
    "enabled": true,
    "schedule": "0 2 * * *",
    "retention": 7,
    "compress": true
  },
  "server": {
    "port": 6970,
    "host": "0.0.0.0",
    "cors": {
      "enabled": true,
      "origins": ["*"]
    }
  }
}
```

## Storage Backend Selection

### SQLite Backend (Recommended)

The SQLite backend offers:
- **250x faster** entity creation
- **15x faster** search operations  
- **79% less** memory usage
- Better scalability for large datasets
- Full-text search capabilities
- ACID compliance

### JSON Backend (Legacy)

The JSON backend provides:
- 100% compatibility with original MCP Memory Server
- Simple file-based storage
- Easy manual editing of data
- No additional dependencies

### Choosing a Backend

Use SQLite when:
- Performance is critical
- Working with >1,000 entities
- Memory usage is a concern
- You need full-text search

Use JSON when:
- Backward compatibility is required
- Working with <100 entities
- Manual data editing is needed
- Simplicity is preferred

## Migration from JSON to SQLite

To migrate existing JSON data to SQLite:

```bash
# Using Docker
docker run --rm \
  -v /path/to/json/data:/source \
  -v /path/to/sqlite/data:/target \
  ghcr.io/jamesprial/mcp-memory-enhanced:latest \
  npm run migrate -- \
    --source /source/memory.json \
    --target /target/memory.db

# Using source installation
npm run migrate -- \
  --source /path/to/memory.json \
  --target /path/to/memory.db \
  --verbose
```

Migration options:
- `--source`: Path to source JSON file
- `--target`: Path to target SQLite database
- `--verbose`: Enable verbose logging
- `--dry-run`: Preview migration without making changes

## Health Checks

The server provides health check endpoints:

```bash
# Basic health check
curl http://localhost:6970/health

# Detailed health status
curl http://localhost:6970/health/detailed
```

Response format:
```json
{
  "status": "healthy",
  "storage": {
    "type": "sqlite",
    "connected": true,
    "entities": 10523,
    "relations": 24891
  },
  "memory": {
    "used": "182MB",
    "available": "3.8GB"
  },
  "uptime": 86400
}
```

## Troubleshooting

### Common Issues

#### 1. SQLite Database Locked
```bash
# Error: SQLITE_BUSY: database is locked
```
**Solution**: Increase busy timeout in configuration:
```json
{
  "storage": {
    "options": {
      "busyTimeout": 10000
    }
  }
}
```

#### 2. Memory Usage High with JSON Backend
**Solution**: Switch to SQLite backend or increase container memory limits

#### 3. Backup Failures
```bash
# Check backup logs
docker logs mcp-memory-enhanced | grep backup

# Verify backup directory permissions
ls -la /path/to/backups
```

#### 4. Migration Errors
```bash
# Validate JSON file
npm run validate -- --file /path/to/memory.json

# Check file permissions
chmod 644 /path/to/memory.json
```

### Debug Mode

Enable debug logging for troubleshooting:

```bash
# Docker
docker run -e LOG_LEVEL=debug ...

# Source
LOG_LEVEL=debug npm start
```

### Performance Tuning

For optimal performance with SQLite:

```json
{
  "storage": {
    "options": {
      "pragma": {
        "journal_mode": "WAL",
        "cache_size": -64000,
        "synchronous": "NORMAL",
        "mmap_size": 268435456
      }
    }
  }
}
```

## Support

- **Issues**: [GitHub Issues](https://github.com/JamesPrial/mcp-memory-enhanced/issues)
- **Documentation**: [README](README.md)
- **Performance Benchmarks**: [PERFORMANCE_RESULTS.md](PERFORMANCE_RESULTS.md)
- **Docker Hub**: [ghcr.io/jamesprial/mcp-memory-enhanced](https://github.com/JamesPrial/mcp-memory-enhanced/pkgs/container/mcp-memory-enhanced)