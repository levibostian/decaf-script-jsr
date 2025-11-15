#!/usr/bin/env -S deno run --quiet --allow-all --no-lock

import $ from "@david/dax";
import { getDeployStepInput } from "@levibostian/decaf-sdk";

const input = getDeployStepInput();

// ---------------------------------------------------------------------------------
// Compile the deno binary for all targets and prepare GitHub release assets
// ---------------------------------------------------------------------------------
// Create dist directory if it doesn't exist
await $`mkdir -p dist`.printCommand();
await $`deno compile --output dist/bin-x86_64-Linux --allow-env --allow-net --allow-run --allow-read --allow-write --target x86_64-unknown-linux-gnu script.ts`
  .printCommand();
await $`deno compile --output dist/bin-aarch64-Linux --allow-env --allow-net --allow-run --allow-read --allow-write --target aarch64-unknown-linux-gnu script.ts`
  .printCommand();
await $`deno compile --output dist/bin-x86_64-Darwin --allow-env --allow-net --allow-run --allow-read --allow-write --target x86_64-apple-darwin script.ts`
  .printCommand();
await $`deno compile --output dist/bin-aarch64-Darwin --allow-env --allow-net --allow-run --allow-read --allow-write --target aarch64-apple-darwin script.ts`
  .printCommand();

await $`deno ${[
  `run`,
  `--quiet`,
  `--allow-all`,
  `jsr:@levibostian/decaf-script-github-releases`,
  `set-github-release-assets`,
  ...[
    `dist/bin-x86_64-Linux#bin-x86_64-Linux`,
    `dist/bin-aarch64-Linux#bin-aarch64-Linux`,
    `dist/bin-x86_64-Darwin#bin-x86_64-Darwin`,
    `dist/bin-aarch64-Darwin#bin-aarch64-Darwin`,
  ],
]}`.printCommand();

// ---------------------------------------------------------------------------------
// Publish the deno module to jsr
// ---------------------------------------------------------------------------------

await $`deno run --quiet --allow-all script.ts`.printCommand()

// ---------------------------------------------------------------------------------
// Publish the package to npm
// ---------------------------------------------------------------------------------

await $`deno run --allow-all --quiet jsr:@levibostian/decaf-script-github-npm  --package-path ./node`.printCommand();

// ---------------------------------------------------------------------------------
// Create a GitHub release
// ---------------------------------------------------------------------------------

await $`deno run --allow-all --quiet jsr:@levibostian/decaf-script-github-releases set`.printCommand();
