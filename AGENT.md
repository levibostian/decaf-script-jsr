# AGENT.md

This file provides context for AI coding assistants working on this project.

## Project Overview

**decaf-script-jsr** is a [decaf](https://github.com/levibostian/decaf) script that implements the **"deploy"** step of the decaf deployment workflow.

### Purpose
Automates jsr package deployment by using the jsr CLI to publish to the jsr registry. This script is exclusively designed for use with the decaf deployment automation tool.

### Key Behavior
- **Idempotent**: Checks if version is already deployed to jsr before publishing
- **Safe Publishing**: Skips publishing if version already exists in jsr registry
- **Test Mode**: Supports `--dry-run` flag for testing without actual deployment
- **Path Configuration**: Optionally specify deno.json location via `--package-path`
- **Exit Codes**: Returns 0 on success (including when already deployed), 1 on failure

## Architecture

### Core Files

1. **`script.ts`** - Main entry point (script.ts:1)
   - Uses the decaf SDK for input handling via `DATA_FILE_PATH` environment variable
   - Uses `@david/dax` for shell command execution (jsr commands)
   - Uses `@std/cli` for command-line argument parsing
   - Validates deno.json exists, updates version, checks deployment status, publishes to jsr
   - Provides human-readable console output for each deployment step

2. **`script.test.ts`** - Functional test suite (script.test.ts:1)
   - Runs script as subprocess to properly handle `Deno.exit()` calls
   - Tests version updates, already-deployed checks, test mode, error cases
   - Uses temporary directories with mock deno.json files
   - Verifies deno.json updates and jsr publish behavior

3. **`script.logs.test.ts`** - Snapshot test suite (script.logs.test.ts:1)
   - Validates console output formatting and user feedback
   - Uses `@std/testing/snapshot` for output comparison
   - Ensures deployment messages are clear and consistent

4. **`deno.json`** - Configuration (deno.json:1)
   - Package metadata for JSR publishing
   - Import map for dependencies
   - Tasks for testing and linting

5. **`node/`** - Node.js compatibility
   - `deno.json` - NPM package configuration (node/deno.json:1)
   - `script.js` - Node.js wrapper that downloads and runs compiled binary (node/script.js:1)

6. **`install`** - Binary installation script (install:1)
   - Downloads appropriate compiled binary from GitHub releases based on OS/architecture

7. **`scripts/deploy.ts`** - Deployment orchestration (scripts/deploy.ts:1)
   - Compiles binaries for multiple platforms (Linux, macOS - x86_64 and aarch64)
   - Publishes Deno module to JSR
   - Publishes jsr package using this script itself
   - Creates GitHub releases with binary assets

8. **`.github/workflows/`** - CI/CD
   - `test.yml` - Runs tests on PR and push
   - `publish.yml` - Runs scripts/deploy.ts to handle all publishing

## Dependencies

**Important**: Only add dependencies to `deno.json` imports that are used in `script.ts` itself. Test-only dependencies should use inline imports (e.g., `import { assertSnapshot } from "jsr:@std/testing@1.0.16/snapshot"`) to avoid forcing users to download unnecessary dependencies when they only want to run the script.

### Production Dependencies (in deno.json)

- **`@levibostian/decaf-sdk`** (^0.2.1) - Handles input contract with decaf tool
  - `getDeployStepInput()` - Reads deployment input JSON from `DATA_FILE_PATH` env var
  - Provides: `nextVersionName` (version to deploy), `testMode` (whether to use --dry-run)

- **`@david/dax`** (^0.43.2) - Shell command execution library
  - Provides ergonomic API for running shell commands with proper error handling
  - Used for: `jsr version`, `jsr publish`, `jsr pkg get name`, `npx is-it-deployed`
  - Supports command chaining, output capture, working directory changes

- **`@std/cli`** (^1.0.23) - Command-line argument parsing
  - `parseArgs()` - Parses command-line flags like `--package-path`
  - Standard Deno library, lightweight with no external dependencies

### External Tools (called via shell)

- **`jsr`** - jsr Package Manager CLI
  - `jsr version` - Updates deno.json version field
  - `jsr publish` - Publishes package to jsr registry
  - `jsr pkg get name` - Extracts package name from deno.json

- **`is-it-deployed`** - Deployment verification tool
  - `npx is-it-deployed --package-manager jsr --package-name X --package-version Y`
  - Checks if a version is already published to jsr registry
  - Returns exit code 0 if deployed, non-zero if not deployed

### Test-only Dependencies (inline imports)

- **`@std/testing/snapshot`** - Used in `script.logs.test.ts` for snapshot testing console output
  - Imported as `import { assertSnapshot } from "jsr:@std/testing@1.0.16/snapshot"`
  - Not in deno.json to avoid unnecessary downloads for script users

## Input/Output Contract

### Input (from `DATA_FILE_PATH` environment variable)
```json
{
  "nextVersionName": "2.3.4",
  "testMode": false
}
```

### Command Line Arguments
```bash
decaf-script-jsr [--package-path <path>]
```

- `--package-path` (optional): Path to directory containing deno.json (defaults to current directory)

### Environment Variables

- **`DATA_FILE_PATH`** (required): Path to JSON file containing decaf input (set by decaf SDK)
- **`DECAF_SCRIPT_JSR_DID_ALREADY_DEPLOY`** (optional, testing only): Mock override for deployment check
  - `"true"` - Skip publishing (simulate already deployed)
  - `"false"` - Proceed with publishing (simulate not deployed)
  - If not set, uses real `is-it-deployed` check

### Output Behavior

**This script does NOT write output to the DATA_FILE_PATH file.** Instead, it performs actions (version update and jsr publish) and uses exit codes to signal success or failure:

- **Exit code 0**: Success (deployment completed OR already deployed - idempotent)
- **Exit code 1**: Failure (missing deno.json, version update failed, etc.)

## Development Workflow

### Running Tests
```bash
deno task test
```
Tests run the script as a subprocess to properly handle `Deno.exit()` calls.

### Running Linter
```bash
deno task lint
```
Runs Deno linter with auto-fix enabled.

### Caching Dependencies
```bash
deno cache --frozen=false script.ts script.test.ts
```
Updates `deno.lock` file.

### Manual Testing
```bash
# Create a test package directory
mkdir -p test-package
cat > test-package/deno.json << 'EOF'
{
  "name": "@test/my-package",
  "version": "1.0.0",
  "description": "Test package"
}
EOF

# Create decaf input file
export DATA_FILE_PATH="./test-input.json"
cat > test-input.json << 'EOF'
{
  "nextVersionName": "1.1.0",
  "testMode": true
}
EOF

# Run script (will use --dry-run because testMode is true)
deno run --allow-all script.ts --package-path ./test-package

# Verify version was updated
cat test-package/deno.json  # Should show version 1.1.0

# Clean up
rm -rf test-package test-input.json
```

## Distribution Methods

This script supports 4 distribution methods (all must be maintained):

1. **Deno/JSR** - `deno run --allow-all jsr:@levibostian/decaf-script-jsr`
   - Published to JSR (JavaScript Registry) via `deno publish`
   - Only includes: script.ts, README.md, LICENSE
   - Managed by scripts/deploy.ts

2. **NPM** - `npx @levibostian/decaf-script-jsr`
   - node/script.js downloads and runs the appropriate compiled binary
   - Zero npm dependencies (minimal package)
   - Automatically selects correct binary for OS/architecture
   - Published via scripts/deploy.ts running `script.ts --package-path ./node`

3. **Binary** - Compiled with `deno compile`, distributed via GitHub releases
   - Platforms: x86_64-Linux, aarch64-Linux, x86_64-Darwin (Intel Mac), aarch64-Darwin (Apple Silicon)
   - Zero dependencies required at runtime
   - Downloaded via `install` script or directly from GitHub releases
   - Created by scripts/deploy.ts

4. **Direct Script Execution** - `deno run --allow-all script.ts`
   - For development or CI/CD with Deno installed
   - Requires Deno runtime

## Testing Strategy

### Test Structure

**script.test.ts** - Functional tests
- Each test creates a temporary directory with a mock deno.json
- Creates a temporary decaf input file
- Runs script as subprocess with `DATA_FILE_PATH` and `--package-path` arguments
- Verifies deno.json was updated correctly
- Uses `DECAF_SCRIPT_JSR_DID_ALREADY_DEPLOY` env var to mock deployment checks
- Cleans up temp files/directories

**script.logs.test.ts** - Snapshot tests
- Captures console output during script execution
- Compares against saved snapshots in `__snapshots__/`
- Ensures user-facing messages are clear and consistent
- Uses `@std/testing/snapshot` for comparison

### Test Coverage

**script.test.ts**:
- ✅ Version update in deno.json
- ✅ Error when deno.json not found
- ✅ Skips publishing when version already deployed
- ✅ Uses `--dry-run` flag in test mode
- ✅ Uses no flags in production mode
- ✅ Custom package path handling

**script.logs.test.ts**:
- ✅ Console output formatting
- ✅ Deployment success messages
- ✅ Already-deployed messages
- ✅ Error messages

### Why Subprocess Approach?
The script calls `Deno.exit(0)` in certain conditions (already deployed, missing deno.json). Direct imports would crash the test runner, so we run the script as a subprocess instead.

## Common Tasks

### Adding Pre-publish Validation

If you need to add checks before publishing (e.g., verify build succeeds):

1. Add validation logic in `script.ts` before the publish step (around script.ts:88):
```typescript
// Example: Run build command
console.log("Running build before publish...");
await $`jsr run build`.cwd(absolutePathToPackage).printCommand();
console.log("✓ Build succeeded");

// Then proceed with publish
console.log(`Publishing to jsr...`);
await $`jsr ${argsToPushToJsr}`.cwd(absolutePathToPackage).printCommand();
```

2. Add corresponding test in `script.test.ts`
3. Update README.md documentation if behavior changes

### Supporting Additional jsr Flags

To support additional jsr publish flags (e.g., `--tag`, `--access`):

1. Update argument parsing in `script.ts` (around script.ts:8):
```typescript
const args = parseArgs(Deno.args, {
  string: ["package-path", "tag", "access"],
});
```

2. Pass flags to jsr publish (around script.ts:89):
```typescript
const argsToPushToJsr = [`publish`];
if (input.testMode) {
  argsToPushToJsr.push(`--dry-run`);
}
if (args.tag) {
  argsToPushToJsr.push(`--tag`, args.tag);
}
if (args.access) {
  argsToPushToJsr.push(`--access`, args.access);
}
```

3. Update tests and documentation

### Changing Deployment Check Behavior

To modify how the script checks if a version is deployed:

- Edit the deployment check logic in `script.ts` (around script.ts:62-73)
- The current implementation uses `is-it-deployed` tool
- For testing, use `DECAF_SCRIPT_JSR_DID_ALREADY_DEPLOY` environment variable
- Consider edge cases: what if the check fails? Should we proceed or abort?

### Updating Dependencies

1. Edit `deno.json` imports
2. Run `deno cache --frozen=false script.ts script.test.ts`
3. Run `deno task test` to verify
4. For Node.js: No changes needed (node/script.js only downloads binary)

## Important Conventions

### Logging
- Every deployment step produces clear console output
- Format: Action description followed by ✓ on success
- Examples:
  - `Updating deno.json version to 2.3.4...`
  - `✓ Version updated in the deno.json file successfully`
  - `Checking if version 2.3.4 of @my-org/package is already deployed...`
  - `✓ Version 2.3.4 has not yet been deployed to jsr. Proceeding to publish...`
- This is a key feature - users rely on this feedback to understand what's happening

### Error Handling
- Script exits with code 1 on errors (missing deno.json, version update failure)
- Script exits with code 0 on success OR when already deployed (idempotent)
- Version update is verified by reading deno.json after jsr version command
- jsr authentication errors are passed through from jsr CLI

### Idempotency
The script is designed to be safe to run multiple times:
1. Checks if version already exists in jsr registry before publishing
2. If already deployed, logs success message and exits with code 0
3. This prevents errors from jsr rejecting duplicate version publishes
4. Makes the deployment pipeline resilient to retries

### Node.js Compatibility
- `node/script.js` does NOT replicate the logic from `script.ts`
- Instead, it downloads and runs the appropriate compiled binary
- This approach means zero npm dependencies
- The binary is platform-specific (different for Linux/macOS, x86_64/aarch64)
- Version in node/deno.json determines which binary version to download

## Gotchas

1. **Tests must run as subprocess** - Don't import script.ts directly in tests (Deno.exit() would crash the test runner)

2. **jsr authentication required** - The script does not handle jsr authentication; it relies on jsr CLI's existing auth configuration

3. **Version update uses jsr CLI** - The script uses `jsr version` to update deno.json, not direct JSON manipulation; this ensures jsr's validation rules are followed

4. **Binary compilation** - Requires all permissions (`--allow-env --allow-net --allow-run --allow-read --allow-write`)

5. **Node.js distribution downloads binary** - Changes to script.ts do NOT require changes to node/script.js; the Node.js package simply downloads the compiled binary

6. **JSR publishing** - Only includes files listed in `deno.json` publish.include (script.ts, README.md, LICENSE)

7. **is-it-deployed dependency** - The script uses `npx is-it-deployed` to check deployment status; this tool must be available in the environment

8. **deno.json must exist** - The script validates deno.json exists before proceeding; it will not create one if missing

9. **Version in deno.json is modified** - The script modifies deno.json during execution; ensure your CI/CD doesn't fail on uncommitted changes (or commit the version bump)

## Related Documentation

- [decaf tool](https://github.com/levibostian/decaf) - Parent project and deployment automation tool
- [decaf SDK](https://github.com/levibostian/decaf-sdk-deno) - SDK documentation for input/output contract
- [jsr CLI documentation](https://jsr.io/docs/cli) - jsr version and publish commands
- [jsr authentication in CI/CD](https://jsr.io/docs/publishing-packages#authentication) - Setting up jsr auth
- [is-it-deployed](https://github.com/chrisdemars/is-it-deployed) - Tool for checking package deployment status
- [dax](https://github.com/dsherret/dax) - Shell command execution library
- [JSR](https://jsr.io/) - JavaScript Registry for Deno packages

