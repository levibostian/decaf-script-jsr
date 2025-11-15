#!/usr/bin/env -S deno run --quiet --allow-all --no-lock

import { getDeployStepInput } from "@levibostian/decaf-sdk";
import $ from "@david/dax";
import { parseArgs } from "@std/cli/parse-args";

// Parse the command line arguments to configure the script
const args = parseArgs(Deno.args, {
  string: ["package-path"],
  unknown: (arg: string) => {
    // Allow all unknown arguments to be collected
    return true;
  },
});

// Collect any additional arguments for jsr (excluding --package-path)
const jsrArguments: string[] = [];
for (let i = 0; i < Deno.args.length; i++) {
  const arg = Deno.args[i];
  if (arg === "--package-path") {
    i++; // Skip the next arg (the value)
  } else {
    jsrArguments.push(arg);
  }
}

const absolutePathToPackage = Deno.realPathSync(args["package-path"] ?? ".");

// Find the config file (check for jsr.json, deno.jsonc, or deno.json)
// jsr allows multiple config file options: https://jsr.io/docs/introduction#publishing-jsr-packages
let configFileName: string | null = null;
const possibleConfigFiles = ["jsr.json", "deno.jsonc", "deno.json"];

for (const fileName of possibleConfigFiles) {
  try {
    if (Deno.statSync(`${absolutePathToPackage}/${fileName}`).isFile) {
      configFileName = fileName;
      break;
    }
  } catch (_e) {
    // File doesn't exist, continue checking
  }
}

if (!configFileName) {
  console.log(
    `No ${possibleConfigFiles.join(", ")} file found at ${absolutePathToPackage}. Exiting.`,
  );
  Deno.exit(1);
}

const input = getDeployStepInput();

// log an intro message
console.log("Time to deploy to jsr!");
console.log("");

// Update the config file version to the new version
const nameOfPackage: string = JSON.parse(Deno.readTextFileSync(
  `${absolutePathToPackage}/${configFileName}`,
)).name;

console.log(
  `Checking if version ${input.nextVersionName} of ${nameOfPackage} is already deployed...`,
);
const didAlreadyDeployToJsr = await (async () => {
  // simple mocking mechanism for testing. 
  const mockResult = Deno.env.get("DECAF_SCRIPT_JSR_DID_ALREADY_DEPLOY");
  if (mockResult === "true") return true;
  if (mockResult === "false") return false;

  const didAlreadyDeploy =
    (await $`npx is-it-deployed --package-manager jsr --package-name ${nameOfPackage} --package-version ${input.nextVersionName}`
      .cwd(absolutePathToPackage).noThrow()).code === 0;

  return didAlreadyDeploy;
})();

if (didAlreadyDeployToJsr) {
  console.log(
    `✓ Version ${input.nextVersionName} of ${nameOfPackage} is already deployed to jsr`,
  );
  console.log(
    "Therefore, I'm going to skip publishing to jsr right now. Deploying to jsr complete!",
  );
  Deno.exit(0);
}
console.log(
    `✓ Version ${input.nextVersionName} has not yet been deployed to jsr. Proceeding to publish...`,
  );

// Publish the package to jsr
console.log(`Publishing to jsr...`);
const argsToJsrPublish = [
  "publish",
  "--set-version",
  input.nextVersionName,
  ...jsrArguments
];

if (input.testMode) {
  argsToJsrPublish.push("--dry-run");
}

// Check if deno is installed, fallback to npx jsr if not
// simple mocking mechanism for testing
const isDenoInstalled = await (async () => {
  const mockResult = Deno.env.get("DECAF_SCRIPT_JSR_IS_DENO_INSTALLED");
  if (mockResult === "true") return true;
  if (mockResult === "false") return false;

  return await $.commandExists("deno");
})();

if (isDenoInstalled) {
  // https://github.com/dsherret/dax#providing-arguments-to-a-command
  await $`deno ${argsToJsrPublish}`.cwd(absolutePathToPackage).printCommand();
} else {
  argsToJsrPublish.unshift("jsr");
  await $`npx ${argsToJsrPublish}`.cwd(absolutePathToPackage).printCommand();
}

console.log(
  `✓ Successfully published ${nameOfPackage}@${input.nextVersionName} to jsr!`,
);
if (input.testMode) {
  console.log(
    "Note: You were in test mode, so no real publishing occurred. 😉",
  );
}
