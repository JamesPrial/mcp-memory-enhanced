# MCP Memory Enhanced

[![CI](https://github.com/JamesPrial/mcp-memory-enhanced/actions/workflows/ci.yml/badge.svg)](https://github.com/JamesPrial/mcp-memory-enhanced/actions/workflows/ci.yml)
[![Docker Build](https://github.com/JamesPrial/mcp-memory-enhanced/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/JamesPrial/mcp-memory-enhanced/actions/workflows/docker-publish.yml)
[![Version](https://img.shields.io/github/v/release/JamesPrial/mcp-memory-enhanced)](https://github.com/JamesPrial/mcp-memory-enhanced/releases)
[![Coverage](https://img.shields.io/badge/coverage-91%25-brightgreen)](https://github.com/JamesPrial/mcp-memory-enhanced)
[![License](https://img.shields.io/github/license/JamesPrial/mcp-memory-enhanced)](LICENSE)

An enhanced fork of the official [MCP Memory Server](https://github.com/modelcontextprotocol/servers) with SQLite backend support for improved performance and scalability. **Now at v1.0.0 - Production Ready!** 🚀

## 🚀 Features

- **Dual Storage Backend**: Choose between JSON (original) and SQLite storage
- **Performance Optimized**: SQLite backend for faster entity creation and searches
- **Production-Ready Docker Support**: Multi-stage builds, health checks, and UnRAID compatibility
- **Backward Compatible**: 100% compatible with the original MCP protocol
- **Migration Tools**: Seamlessly migrate from JSON to SQLite storage
- **Comprehensive Benchmarking**: Built-in performance validation and monitoring

## 📊 Performance Comparison

Based on benchmarks with 10,000 entities:

| Operation | JSON Backend | SQLite Backend | Improvement |
|-----------|--------------|----------------|-------------|
| Entity Creation | 678ms | 145ms | **4.7x faster** |
| Search (5 queries) | 90ms | 67ms | **1.3x faster** |
| Memory Usage | 11.3MB | 11.3MB | **Similar** |
| Storage Size | 3.9MB | 9.6MB | **JSON more compact** |

*Note: Performance varies based on hardware and dataset characteristics. SQLite excels at indexed searches and concurrent access, while JSON provides simpler deployment and smaller file sizes for this dataset size.*

## 🐳 Quick Start with Docker

```bash
docker run -d \
  --name mcp-memory-enhanced \
  -p 6970:6970 \
  -v /path/to/data:/data \
  -e STORAGE_TYPE=sqlite \
  ghcr.io/jamesprial/mcp-memory-enhanced:latest
```

## 📦 Installation

### From npm (via GitHub)
```bash
# Latest version
npm install github:JamesPrial/mcp-memory-enhanced

# Specific version
npm install github:JamesPrial/mcp-memory-enhanced#v1.0.0
```

### From Source
```bash
git clone https://github.com/JamesPrial/mcp-memory-enhanced.git
cd mcp-memory-enhanced
npm install
npm run build
```

### Using Docker Compose
```bash
docker-compose up -d
```

## 🔧 Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `STORAGE_TYPE` | `json` | Storage backend: `sqlite` or `json` |
| `STORAGE_PATH` | OS temp dir | Directory for data files |
| `SQLITE_DB_NAME` | `knowledge.db` | SQLite database filename |
| `PORT` | `6970` | Health check server port (Docker only) |
| `LOG_LEVEL` | `info` | Logging level |

### MCP Configuration

Add to your MCP client settings:

```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["/path/to/mcp-memory-enhanced/dist/index.js"],
      "env": {
        "STORAGE_TYPE": "sqlite",
        "STORAGE_PATH": "/path/to/data"
      }
    }
  }
}
```

## 🔄 Migration from JSON to SQLite

```bash
# Using the migration tool
npm run migrate /path/to/knowledge-graph.jsonl
```

Or with Docker:
```bash
docker run --rm \
  -v /path/to/json-data:/source \
  -v /path/to/sqlite-data:/data \
  ghcr.io/jamesprial/mcp-memory-enhanced:latest \
  node dist/migrate.js /source/knowledge-graph.jsonl
```

## 🏥 Health Check (Docker only)

The Docker container provides a health endpoint at `http://localhost:6970/health`:

```json
{
  "status": "healthy",
  "timestamp": "2025-08-05T12:00:00.000Z",
  "storage": {
    "type": "sqlite",
    "stats": {
      "entityCount": 1000,
      "relationCount": 500,
      "observationCount": 2000,
      "storageSize": 1048576
    }
  }
}
```

## 🚀 UnRAID Deployment

1. Download the [UnRAID template](unraid-template.xml)
2. In UnRAID web UI: Docker → Add Container → Template
3. Select the template file and configure as needed

## 🛠️ Development

### Running Tests
```bash
npm test
```

### Building Docker Image
```bash
docker build -f Dockerfile.standalone -t mcp-memory-enhanced .
```

### Running Locally
```bash
STORAGE_TYPE=sqlite npm start
```

## 📈 Architecture

The Enhanced MCP Memory Server uses a clean storage abstraction layer:

```
┌─────────────────┐
│   MCP Client    │
└────────┬────────┘
         │ stdio
┌────────▼────────┐
│   MCP Server    │
│   (index.ts)    │
└────────┬────────┘
         │
┌────────▼────────┐
│ KnowledgeGraph  │
│    Manager      │
└────────┬────────┘
         │
┌────────▼────────┐
│ IStorageBackend │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
┌───▼───┐ ┌──▼────┐
│ JSON  │ │SQLite │
└───────┘ └───────┘
```

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feat/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Original [MCP Memory Server](https://github.com/modelcontextprotocol/servers) by Anthropic
- Built with the [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- Powered by [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)

## 📊 Status

- Phase 1: ✅ Core Implementation (Complete)
- Phase 2: ✅ Docker Support (Complete)
- Phase 3: ✅ CI/CD Pipeline (Complete)
- Phase 4: 🔄 Production Hardening (Next)

---

🤖 Enhanced for production use with ❤️ by [@JamesPrial](https://github.com/JamesPrial)