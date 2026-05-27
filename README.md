# decaf-script-jsr

A script specifically designed for the [decaf](https://github.com/levibostian/decaf) deployment automation tool. This script automates the deployment of jsr packages by updating the package version and publishing to the jsr registry.

## What does this script do?

This is a decaf deploy step script that handles jsr package deployment. When decaf has determined a new version should be released, this script will:

1. **Publish a new version of the package** to match the release version determined by decaf
2. **Check if the version is already deployed** to jsr (to avoid the script throwing an error because of jsr not allowing you to publish the same version multiple times)
3. **Publish the package to jsr** 

# Getting Started

Run using decaf's `shebang` command in your deployment workflow.

**GitHub Actions Example**

```yaml
- uses: levibostian/decaf
  with:
    deploy: decaf shebang git@github.com:levibostian/decaf-script-jsr.git/shebang.sh@<version-here>
    # Other decaf arguments...
```

Replace `<version-here>` with a [release](https://github.com/levibostian/decaf-script-jsr/releases). Latest: ![GitHub Release](https://img.shields.io/github/v/release/levibostian/decaf-script-jsr)

**Command Line Example**

```bash
decaf \
  --deploy "decaf shebang git@github.com:levibostian/decaf-script-jsr.git/shebang.sh@<version-here>"
```

# Configuration

This script requires minimal configuration and works automatically with decaf's deploy step.

### Command Line Options

- `--package-path` - (Optional) Path to the directory containing the jsr.json, deno.jsonc, or deno.json file. Defaults to the current directory.

**Example:**

```bash
decaf shebang git@github.com:levibostian/decaf-script-jsr.git/shebang.sh@<version-here> --package-path ./packages/my-package
```

### Passing Arguments to jsr CLI

Any arguments you pass to this script (except `--package-path`) will be forwarded directly to the `jsr publish` command. This allows you to customize jsr's behavior as needed.

**Example:**

```bash
# Use any jsr publish flag
decaf shebang git@github.com:levibostian/decaf-script-jsr.git/shebang.sh@<version-here> --allow-dirty

# Combine with package path
decaf shebang git@github.com:levibostian/decaf-script-jsr.git/shebang.sh@<version-here> --package-path ./packages/my-package --allow-slow-types
```

See the [jsr publish documentation](https://jsr.io/docs/publishing-packages) for all available options.

### jsr Authentication

This script simply runs `jsr publish`, so you'll need to ensure your jsr authentication is set up correctly in the environment where decaf is running.

See the [jsr documentation](https://jsr.io/docs/publishing-packages#authentication) and choose the method that best fits your CI/CD environment.


