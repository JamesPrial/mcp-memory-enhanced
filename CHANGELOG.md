# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### ⚠️ Breaking Changes
- **Tool names are now namespaced with the `memory__` prefix on every transport.**
  The stdio transport previously exposed unprefixed names (`create_entities`,
  `read_graph`, ...); it now matches the HTTP/SSE transport (`memory__create_entities`,
  `memory__read_graph`, ...). MCP clients that discover tools dynamically are
  unaffected; any client, script, or allow-list that hard-codes the old stdio names
  must be updated.

### Added
- `memory__get_stats` is now exposed over HTTP/SSE as well (previously stdio-only), so
  both transports expose the same 10 tools
- Shared tool module (`tools.ts`) used by both transports, removing duplicated tool
  definitions and dispatch logic that could drift between transports
- JSON-storage durability tests and a SQLite N+1 regression test
- `.dockerignore`

### Changed
- The server version reported to MCP clients is now read from `package.json` (single
  source of truth) instead of a hard-coded string that had drifted to `0.6.3`
- Coverage thresholds aligned to 85% lines / 85% functions / 80% branches across
  vitest, CI, and docs

### Fixed
- **JSON storage durability** - writes are now atomic (temp file + fsync + rename) and
  serialized, so concurrent tool calls can no longer lose data and a crash mid-write
  can no longer corrupt the JSONL file; parse errors now report the offending line
- Resolved unresolved git merge-conflict markers shipped in `README.md`
- Build now cleans `dist/` first, so stale/test artifacts are no longer published
- **Graceful shutdown** - the server now handles SIGINT/SIGTERM, closing the storage
  backend (whose `close()` was previously never called) and the health/HTTP servers
- **HTTP session resource leak** - all HTTP/SSE sessions now share one storage backend
  instead of each opening (and never closing) its own backend, which for SQLite leaked
  a database connection per session
- The SSE `/events` endpoint now rejects a second concurrent stream for a session
  instead of connecting the server to a second transport and leaking the first stream

### Performance
- Eliminated the SQLite N+1 observation query in `loadGraph`, `searchEntities`, and
  `getEntities` (one grouped query instead of one query per entity)

### Removed
- Dead `src/memory/**` tree (excluded from the build, never imported) and stray root
  files (`test-benchmark.ts`, `test-sqlite.ts`, `test-coverage-analysis.md`)

## [1.0.3] - 2026-06-13

### 📊 Benchmarking & Tooling

This patch release adds a comprehensive performance benchmarking system, refreshes
documentation with validated metrics, and cleans up CI tooling.

### Added
- **Comprehensive benchmarking system** - Benchmark suites and infrastructure under
  `test/benchmarks/`, a runner at `scripts/run-benchmarks.ts`, documentation in
  `BENCHMARKS.md`, a `benchmark.yml` CI workflow, and `npm run benchmark*` scripts
- **Claude Code project configuration** - `CLAUDE.md` guidance and `.claude/` config

### Changed
- Updated README with validated performance metrics

### Fixed
- Resolved ESLint/CI errors in the benchmark suite
- Fixed `package-lock.json` generation and added a presence check in CI
- PR source-branch check now accepts any `release/vX.Y.Z` branch

### Removed
- Accidentally committed runtime data artifacts (`memory.db`, `memory.json`); these
  local storage-backend files are now gitignored

## [1.0.2] - 2025-08-08

### 🔒 Security Update

This patch release addresses security vulnerabilities detected in the Docker image dependencies.

### Security
- **Fixed CVE-2024-21538 (HIGH)** - cross-spawn ReDoS vulnerability
- **Fixed CVE-2025-5889 (LOW)** - brace-expansion ReDoS vulnerability  
- **Documented CVE-2025-47907** - Go stdlib issue in esbuild (not affecting runtime)

### Changed
- Updated Docker base image from Node 22.12/22-alpine to 22.13-alpine
- Added npm update to latest version in both Docker build stages
- Improved Docker image security posture

### Technical Details
- Vulnerabilities were in the Docker base image's global npm installation
- Application dependencies remain secure (0 vulnerabilities via npm audit)
- No breaking changes to application functionality

## [1.0.1] - 2024-08-08

### 🐛 Migration Tool Improvements

This patch release focuses on improving the migration tool's reliability and test coverage.

### Added
- **Comprehensive test coverage for migration tool** - Achieving near 100% coverage
- **CLI interface tests** - Testing command-line argument parsing and help functionality
- **Edge case handling tests** - Malformed JSON, special characters, large datasets
- **Data quality improvement tests** - Deduplication and invalid relation handling
- **Backup functionality tests** - Ensuring backup creation and restoration works correctly

### Changed
- Migration tool now properly included in TypeScript build output
- Improved error messages during migration failures
- Enhanced data validation during migration process
- Better handling of duplicate observations and invalid relations

### Fixed
- Migration tool not being compiled to dist directory
- CLI interface not properly handling all argument combinations
- Error cleanup not properly closing database connections
- Data quality improvements not being properly reported

### Testing
- Added 26 new test cases for migration tool
- Improved overall test coverage
- Validated migration with datasets of 1000+ entities
- Tested all error scenarios and edge cases

## [1.0.0] - 2024-08-07

### 🎉 First Production Release

This is the first production-ready release of MCP Memory Enhanced, featuring comprehensive testing, multiple storage backends, and flexible deployment options.

### Added
- **100% SQLite test coverage** - Complete testing of all storage operations
- **HTTP/SSE transport support** - Web-based integrations with session management
- **Docker deployment guides** - Comprehensive containerization documentation
- **Migration tools** - Seamless migration from JSON to SQLite storage
- **Health check endpoints** - Production monitoring capabilities
- **Performance benchmarks** - Validation of large dataset operations
- **Unicode/emoji support** - Full international character handling
- **Edge case handling** - Robust error recovery and validation

### Changed
- Improved test coverage from 82.66% to 91%+ overall
- Enhanced CI/CD pipeline with multiple Node.js versions
- Optimized Docker builds with multi-stage process
- Updated dependencies to latest stable versions
- Refined error messages and logging

### Fixed
- Vitest coverage configuration issues
- Transaction handling edge cases in SQLite
- Relation query performance optimizations
- Docker build caching problems
- Test isolation and cleanup

### Security
- Input validation for all storage operations
- SQL injection prevention in SQLite backend
- Proper error handling without stack trace exposure
- Secure defaults for production deployment

### Performance
- 250x faster entity creation with SQLite
- 15x faster search operations
- 79% memory usage reduction
- 30% storage size optimization

### Testing
- 256 total tests (Unit, Integration, E2E)
- 91%+ overall code coverage
- 100% SQLite storage coverage
- Tested on Node.js 18, 20, and 22

## [0.6.3] - 2024-08-01

### Added
- Initial SQLite backend implementation
- Basic Docker support
- JSON to SQLite migration script

### Changed
- Refactored storage interface for multiple backends
- Updated MCP SDK to latest version

### Fixed
- Memory leaks in JSON storage
- Connection handling issues

## [0.5.0] - 2024-07-15

### Added
- Initial fork from official MCP Memory Server
- Basic project structure
- README and documentation

---

For detailed release notes, see the [GitHub Releases](https://github.com/JamesPrial/mcp-memory-enhanced/releases) page.