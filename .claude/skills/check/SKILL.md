---
name: check
description: Run the local CI gate (lint, type-check, tests) before pushing. Use to verify changes pass the same checks GitHub Actions enforces.
---

Run the project's CI gate locally — the same steps `.github/workflows/ci.yml` runs. Execute in order and report which pass/fail:

1. `npm run lint`
2. `npm run typecheck`
3. `npm test`

If any step fails, stop and show the failing output rather than continuing. If the user is making changes to covered files, optionally run `npm run test:coverage` and confirm coverage stays at/above the CI thresholds (85% lines, 85% functions, 80% branches).
