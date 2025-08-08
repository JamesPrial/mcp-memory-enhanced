# Branching Strategy

This project follows a **release branch strategy** to maintain stable releases while enabling continuous development.

## Branch Structure

```
main                    # Latest stable code, protected
├── release/1.0.0       # Stable v1.0.0 release (frozen)
├── release/1.0.1       # Current development branch
│   ├── feat/1.0.1/feature-name     # Feature branches
│   ├── fix/1.0.1/bug-name          # Bug fix branches
│   └── chore/1.0.1/task-name       # Maintenance branches
└── release/1.1.0       # Future minor version (when needed)
```

## Branch Types

### Main Branch (`main`)
- **Purpose**: Latest stable code
- **Protection**: Yes - requires PR and reviews
- **Deployment**: Triggers production releases
- **Direct commits**: Never

### Release Branches (`release/x.x.x`)
- **Purpose**: Stable version baselines
- **Naming**: `release/MAJOR.MINOR.PATCH`
- **Creation**: From main or previous release
- **Examples**: `release/1.0.0`, `release/1.0.1`

### Feature Branches
- **Purpose**: New features and enhancements
- **Naming**: `feat/VERSION/description`
- **Base**: Current development release branch
- **Examples**: 
  - `feat/1.0.1/postgres-backend`
  - `feat/1.0.1/api-endpoints`

### Fix Branches
- **Purpose**: Bug fixes
- **Naming**: `fix/VERSION/description`
- **Base**: Release branch needing the fix
- **Examples**: 
  - `fix/1.0.1/memory-leak`
  - `fix/1.0.0/critical-security` (hotfix)

## Workflow

### Starting New Feature (v1.0.1)
```bash
# Start from the development release branch
git checkout release/1.0.1
git pull origin release/1.0.1

# Create feature branch
git checkout -b feat/1.0.1/my-feature

# Work and commit
git add .
git commit -m "feat: add my feature"

# Push and create PR
git push -u origin feat/1.0.1/my-feature
gh pr create --base release/1.0.1
```

### Creating a Release
```bash
# Merge all features to release branch
git checkout release/1.0.1
git pull origin release/1.0.1

# Update version
npm version patch  # or minor/major

# Tag and push
git push origin release/1.0.1
git tag v1.0.1
git push origin v1.0.1

# Merge to main
git checkout main
git merge release/1.0.1
git push origin main

# Create next development branch
git checkout -b release/1.0.2
npm version 1.0.2-dev
git push -u origin release/1.0.2
```

### Hotfix for Production
```bash
# Start from stable release branch
git checkout release/1.0.0
git checkout -b fix/1.0.0/critical-bug

# Fix and commit
git add .
git commit -m "fix: resolve critical bug"

# Create PR to release branch
gh pr create --base release/1.0.0

# After merge, tag as patch
git checkout release/1.0.0
git tag v1.0.0-hotfix.1
git push origin v1.0.0-hotfix.1
```

## Version Management

### Version Numbers
- **Stable Release**: `1.0.0`
- **Development**: `1.0.1-dev`
- **Pre-release**: `1.0.1-rc.1`
- **Hotfix**: `1.0.0-hotfix.1`

### Semantic Versioning
- **MAJOR**: Breaking changes (1.0.0 → 2.0.0)
- **MINOR**: New features, backward compatible (1.0.0 → 1.1.0)
- **PATCH**: Bug fixes (1.0.0 → 1.0.1)

## Best Practices

1. **Never commit directly to main** - Always use PRs
2. **Keep release branches stable** - Only merge tested code
3. **Use descriptive branch names** - Include version and purpose
4. **Delete merged branches** - Keep repository clean
5. **Tag all releases** - Maintain version history
6. **Update CHANGELOG.md** - Document all changes

## Current Active Branches

- `main` - Latest stable (v1.0.0)
- `release/1.0.0` - Stable v1.0.0 release
- `release/1.0.1` - Current development

## Examples

### Feature Development
```bash
# Feature: Add PostgreSQL support
git checkout release/1.0.1
git checkout -b feat/1.0.1/postgres-support

# Feature: Add caching layer
git checkout release/1.0.1
git checkout -b feat/1.0.1/redis-cache
```

### Bug Fixes
```bash
# Fix: Memory leak in SQLite
git checkout release/1.0.1
git checkout -b fix/1.0.1/sqlite-memory-leak

# Hotfix: Security vulnerability in 1.0.0
git checkout release/1.0.0
git checkout -b fix/1.0.0/security-patch
```

## Questions?

For questions about branching strategy, please open an issue or discussion on GitHub.