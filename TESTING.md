# Testing Strategy and Coverage Goals

## Overview

This document outlines the comprehensive testing strategy for the MCP Memory Enhanced project, including our coverage goals, testing philosophy, and implementation guidelines.

## Test Coverage Goals

### Current Status
- **Overall Coverage**: 84.23% (as of last measurement)
- **Target Coverage**: 90%+ for all components
- **Critical Path Coverage**: 100% for core functionality

### Coverage Targets by Component

| Component | Target | Priority | Notes |
|-----------|--------|----------|-------|
| Core MCP Protocol | 95% | Critical | Must handle all protocol operations |
| Storage Backends | 90% | High | Both JSON and SQLite implementations |
| HTTP/SSE Transport | 85% | High | Network layer reliability |
| Knowledge Graph Manager | 90% | Critical | Core business logic |
| Server Factory | 85% | Medium | Configuration and initialization |
| Health Monitoring | 80% | Medium | Operational visibility |

## Testing Pyramid

```
         /\           E2E Tests (10%)
        /  \          - Full system integration
       /    \         - Real protocol validation
      /      \        
     /--------\       Integration Tests (30%)
    /          \      - Component interactions
   /            \     - Database operations
  /              \    - Protocol compliance
 /________________\   Unit Tests (60%)
                      - Individual functions
                      - Error handling
                      - Edge cases
```

## Test Categories

### 1. Unit Tests (`test/unit/`)
**Purpose**: Test individual functions and classes in isolation

**Coverage Areas**:
- Individual method functionality
- Error handling and edge cases
- Input validation
- Return value correctness

**Key Files**:
- `knowledge-graph-manager.test.ts` - 32 tests
- `server-factory.test.ts` - 22 tests
- `server-factory-schemas.test.ts` - 31 tests
- `storage/*.test.ts` - Storage backend tests
- `health-server.test.ts` - 26 tests
- `http-server.test.ts` - 8 tests

### 2. Integration Tests (`test/integration/`)
**Purpose**: Test component interactions and protocol compliance

**Coverage Areas**:
- MCP protocol operations
- Storage backend operations
- Multi-component workflows
- Error propagation

**Key Files**:
- `mcp-server.test.ts` - 30 comprehensive MCP tests
- Storage integration tests for both JSON and SQLite

### 3. End-to-End Tests (`test/e2e/`)
**Purpose**: Validate complete user scenarios

**Coverage Areas**:
- HTTP transport layer
- SSE (Server-Sent Events) transport
- Complete session workflows
- Concurrent operations
- Error recovery

**Key Files**:
- `http-transport.test.ts` - 14 tests
- `sse-transport.test.ts` - 10 tests
- `server-startup.test.ts` - 2 tests

## Testing Tools and Configuration

### Test Runner
- **Framework**: Vitest
- **Coverage Tool**: @vitest/coverage-v8
- **Configuration**: `vitest.config.ts`

### Key Commands
```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test category
npm test -- test/unit
npm test -- test/integration
npm test -- test/e2e

# Watch mode for development
npm run test:ui
```

### Coverage Configuration
```typescript
// vitest.config.ts
coverage: {
  provider: 'v8',
  reporter: ['text', 'json', 'html', 'lcov'],
  exclude: [
    'node_modules/',
    'test/',
    'dist/',
    'mcp-memory-fix/',
    'src/memory/',  // Excluded legacy code
    '*.config.ts',
    '*.config.js'
  ],
  thresholds: {
    lines: 85,
    functions: 85,
    branches: 80,
    statements: 85
  }
}
```

## CI/CD Integration

### GitHub Actions Workflow
The CI/CD pipeline (`/.github/workflows/ci.yml`) includes:

1. **Multi-version Testing**: Node.js 18, 20, 22
2. **Multi-storage Testing**: JSON and SQLite backends
3. **Coverage Reporting**: 
   - Upload to Codecov
   - GitHub Step Summary
   - Threshold checking (85% lines, 85% functions, 80% branches)
4. **Security Scanning**: Trivy vulnerability scanner
5. **Docker Build Verification**

### Coverage Monitoring
- **Codecov Integration**: Automatic coverage tracking
- **PR Comments**: Coverage delta on pull requests
- **Threshold Enforcement**: CI warnings for coverage drops

## Best Practices

### Writing Tests

1. **Follow AAA Pattern**:
   ```typescript
   it('should handle tool calls', async () => {
     // Arrange
     const server = await createServer();
     const request = createToolRequest();
     
     // Act
     const response = await server.handle(request);
     
     // Assert
     expect(response).toHaveProperty('result');
   });
   ```

2. **Mock External Dependencies**:
   ```typescript
   vi.mock('express', () => ({
     default: vi.fn(() => mockApp)
   }));
   ```

3. **Test Error Cases**:
   ```typescript
   it('should handle invalid input gracefully', async () => {
     await expect(functionUnderTest(null))
       .rejects.toThrow('Invalid input');
   });
   ```

4. **Use Descriptive Test Names**:
   - ✅ `should return 404 when session does not exist`
   - ❌ `test session error`

### Test Data Management

1. **Use Fixtures**: Store test data in separate files
2. **Clean State**: Always clean up after tests
3. **Isolation**: Tests should not depend on each other
4. **Deterministic**: Avoid random data that could cause flaky tests

## Continuous Improvement

### Regular Reviews
- Monthly coverage analysis
- Quarterly test strategy review
- Performance testing additions as needed

### Metrics to Track
1. **Coverage Trends**: Monitor coverage over time
2. **Test Execution Time**: Keep tests fast (<5 minutes total)
3. **Flaky Test Rate**: Maintain <1% flaky tests
4. **Defect Escape Rate**: Track bugs found in production

## Excluded from Coverage

The following are intentionally excluded from coverage requirements:

1. **Legacy Code** (`src/memory/`): Being phased out
2. **Generated Files** (`dist/`): Build output
3. **Configuration Files** (`*.config.ts`): Minimal logic
4. **Test Files** (`test/`): Test code itself
5. **Third-party Code** (`node_modules/`): External dependencies

## Future Enhancements

### Planned Improvements
1. **Performance Testing**: Add load testing for HTTP/SSE transports
2. **Stress Testing**: Concurrent operation limits
3. **Mutation Testing**: Ensure test effectiveness
4. **Contract Testing**: Validate API contracts
5. **Visual Regression**: For any UI components

### Research Areas
- Property-based testing for complex scenarios
- Chaos engineering for resilience testing
- AI-assisted test generation for edge cases

## Resources

### Documentation
- [Vitest Documentation](https://vitest.dev/)
- [MCP Protocol Specification](https://modelcontextprotocol.org/)
- [Coverage Best Practices](https://testing.googleblog.com/)

### Support
- Report issues: [GitHub Issues](https://github.com/JamesPrial/mcp-memory-enhanced/issues)
- Discussions: [GitHub Discussions](https://github.com/JamesPrial/mcp-memory-enhanced/discussions)

---

*Last Updated: 2025-08-06*
*Version: 1.0.0*