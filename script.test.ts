import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@^1.0.10";
import { join } from "jsr:@std/path@^1.0.8";
import $ from "@david/dax";

interface TestEnvOptions {
  inputData: {
    nextVersionName: string;
    testMode: boolean;
  };
  mockAlreadyDeployed?: boolean;
  packageName?: string;
  initialVersion?: string;
  configFileType?: "jsr.json" | "deno.jsonc" | "deno.json";
}

interface RunScriptOptions {
  dataFilePath: string;
  packagePath: string;
  mockAlreadyDeployed?: boolean;
  additionalArgs?: string[];
  mockDenoInstalled?: boolean;
}

function setupTestEnv(options: TestEnvOptions) {
  const {
    inputData,
    mockAlreadyDeployed,
    packageName = "@test/test-package",
    initialVersion = "1.0.0",
    configFileType = "deno.json",
  } = options;

  // Create temporary directory for the test package
  const tempDir = Deno.makeTempDirSync();

  // Create the config file (jsr.json, deno.jsonc, or deno.json)
  const packageJson = {
    name: packageName,
    version: initialVersion,
    description: "Test package",
    license: "MIT",
    exports: "./index.ts",
  };
  Deno.writeTextFileSync(
    join(tempDir, configFileType),
    JSON.stringify(packageJson, null, 2),
  );

  // Create a fake index.ts file
  Deno.writeTextFileSync(
    join(tempDir, "index.ts"),
    "export const test = true;",
  );

  // Create a temporary file for input data from decaf 
  const dataFile = Deno.makeTempFileSync();
  Deno.writeTextFileSync(dataFile, JSON.stringify(inputData));

  return {
    tempDir,
    dataFile,
    mockAlreadyDeployed,
    configFileType,
  };
}

async function runScript(options: RunScriptOptions) {
  const {
    dataFilePath,
    packagePath,
    mockAlreadyDeployed,
    additionalArgs,
    mockDenoInstalled,
  } = options;

  const env: Record<string, string> = {
    DATA_FILE_PATH: dataFilePath,
  };

  if (mockAlreadyDeployed !== undefined) {
    env.DECAF_SCRIPT_JSR_DID_ALREADY_DEPLOY = mockAlreadyDeployed
      ? "true"
      : "false";
  }

  if (mockDenoInstalled !== undefined) {
    env.DECAF_SCRIPT_JSR_IS_DENO_INSTALLED = mockDenoInstalled
      ? "true"
      : "false";
  }

  const command = new Deno.Command("deno", {
    args: [
      "run",
      "--quiet",
      "--allow-all",
      "--no-lock",
      "script.ts",
      "--package-path",
      packagePath,
      ...(additionalArgs || ['--allow-dirty']), // default to --allow-dirty to avoid issues with temp dirs
    ],
    env,
    stdout: "piped",
    stderr: "piped",
  });

  const { code, stdout, stderr } = await command.output();
  const stdoutText = new TextDecoder().decode(stdout);
  const stderrText = new TextDecoder().decode(stderr);

  console.log(stdoutText)
  console.log(stderrText)

  // not sure why, but the stderr is what contains the command outputs.
  // stripAnsi removes weird characters in the output for changing color.
  const commandsExecuted = $.stripAnsi(stderrText).split("\n").filter((line) =>
    line.startsWith("> ")
  // remove the "> " prefix
  ).map((line) => line.slice(2).trim());

  return {
    exitCode: code,
    stdout: stdoutText,
    stderr: stderrText,
    commandsExecuted
  };
}

Deno.test("successfully publishes with correct version", async () => {
  const testEnv = setupTestEnv({
    inputData: {
      nextVersionName: "2.3.4",
      testMode: true,
    },
    initialVersion: "1.0.0",
    mockAlreadyDeployed: false,
  });

  const result = await runScript({
    dataFilePath: testEnv.dataFile,
    packagePath: testEnv.tempDir,
    mockAlreadyDeployed: testEnv.mockAlreadyDeployed,
  });

  assertEquals(result.exitCode, 0);
  const publishCommand = result.commandsExecuted.find((cmd) =>
    cmd.includes("deno publish")
  );
  assert(publishCommand, "Should have executed deno publish command");
  assertStringIncludes(publishCommand, "--set-version");
  assertStringIncludes(publishCommand, "2.3.4");
});

Deno.test("exits with error if no config file found", async () => {
  const inputData = {
    nextVersionName: "2.0.0",
    testMode: false,
  };

  const dataFile = Deno.makeTempFileSync();
  Deno.writeTextFileSync(dataFile, JSON.stringify(inputData));

  const emptyDir = Deno.makeTempDirSync();

  const result = await runScript({
    dataFilePath: dataFile,
    packagePath: emptyDir,
  });

  assertEquals(result.exitCode, 1);
  // Error message goes to stderr, not stdout
  const output = result.stdout + result.stderr;
  assertStringIncludes(output, "No jsr.json, deno.jsonc, deno.json file found");
});

Deno.test("skips publishing when already deployed", async () => {
  const testEnv = setupTestEnv({
    inputData: {
      nextVersionName: "3.0.0",
      testMode: false,
    },
    mockAlreadyDeployed: true,
  });

  const result = await runScript({
    dataFilePath: testEnv.dataFile,
    packagePath: testEnv.tempDir,
    mockAlreadyDeployed: true,
  });

  assertEquals(result.exitCode, 0);
  assertStringIncludes(result.stdout, "already deployed");
  assertStringIncludes(result.stdout, "skip publishing");
});

Deno.test("publishes in test mode with --dry-run flag", async () => {
  const testEnv = setupTestEnv({
    inputData: {
      nextVersionName: "4.0.0",
      testMode: true,
    },
    mockAlreadyDeployed: false,
  });

  const result = await runScript({
    dataFilePath: testEnv.dataFile,
    packagePath: testEnv.tempDir,
    mockAlreadyDeployed: false,
  });

  assertEquals(result.exitCode, 0);
  const publishCommand = result.commandsExecuted.find(cmd => cmd.includes("deno publish"));
  assert(publishCommand, "Should have executed jsr publish command");
  assertStringIncludes(publishCommand, "--dry-run");
  assertStringIncludes(publishCommand, "--set-version");
  assertStringIncludes(publishCommand, "4.0.0");
});

Deno.test("publishes without --dry-run when not in test mode", async () => {
  const testEnv = setupTestEnv({
    inputData: {
      nextVersionName: "5.0.0",
      testMode: false,
    },
    mockAlreadyDeployed: false,
  });

  // Note: we actually run jsr publish here without mocking, but it will fail
  // because of auth. we just want to verify the command executed.
  const result = await runScript({
    dataFilePath: testEnv.dataFile,
    packagePath: testEnv.tempDir,
    mockAlreadyDeployed: false,
  });

  assertStringIncludes(result.stdout, "Publishing to jsr");
  const publishCommand = result.commandsExecuted.find(cmd => cmd.includes("deno publish"));
  assert(publishCommand, "Should have executed jsr publish command");
  // Should NOT include --dry-run when not in test mode
  assertEquals(publishCommand.includes("--dry-run"), false);
  assertStringIncludes(publishCommand, "--set-version");
  assertStringIncludes(publishCommand, "5.0.0");
});

Deno.test("works with jsr.json config file", async () => {
  const testEnv = setupTestEnv({
    inputData: {
      nextVersionName: "6.0.0",
      testMode: true,
    },
    mockAlreadyDeployed: false,
    configFileType: "jsr.json",
  });

  const result = await runScript({
    dataFilePath: testEnv.dataFile,
    packagePath: testEnv.tempDir,
    mockAlreadyDeployed: false,
  });

  assertEquals(result.exitCode, 0);
  assertStringIncludes(result.stdout, "Publishing to jsr");
  const publishCommand = result.commandsExecuted.find((cmd) =>
    cmd.includes("deno publish")
  );
  assert(publishCommand, "Should have executed jsr publish command");
});

Deno.test("works with deno.jsonc config file", async () => {
  const testEnv = setupTestEnv({
    inputData: {
      nextVersionName: "7.0.0",
      testMode: true,
    },
    mockAlreadyDeployed: false,
    configFileType: "deno.jsonc",
  });

  const result = await runScript({
    dataFilePath: testEnv.dataFile,
    packagePath: testEnv.tempDir,
    mockAlreadyDeployed: false,
  });

  assertEquals(result.exitCode, 0);
  assertStringIncludes(result.stdout, "Publishing to jsr");
  const publishCommand = result.commandsExecuted.find((cmd) =>
    cmd.includes("deno publish")
  );
  assert(publishCommand, "Should have executed jsr publish command");
});

Deno.test("works with deno.json config file", async () => {
  const testEnv = setupTestEnv({
    inputData: {
      nextVersionName: "8.0.0",
      testMode: true,
    },
    mockAlreadyDeployed: false,
    configFileType: "deno.json",
  });

  const result = await runScript({
    dataFilePath: testEnv.dataFile,
    packagePath: testEnv.tempDir,
    mockAlreadyDeployed: false,
  });

  assertEquals(result.exitCode, 0);
  assertStringIncludes(result.stdout, "Publishing to jsr");
  const publishCommand = result.commandsExecuted.find((cmd) =>
    cmd.includes("deno publish")
  );
  assert(publishCommand, "Should have executed jsr publish command");
});

Deno.test("passes single extra argument through to jsr publish", async () => {
  const testEnv = setupTestEnv({
    inputData: {
      nextVersionName: "9.0.0",
      testMode: true,
    },
    mockAlreadyDeployed: false,
  });

  const result = await runScript({
    dataFilePath: testEnv.dataFile,
    packagePath: testEnv.tempDir,
    mockAlreadyDeployed: false,
    additionalArgs: ["--allow-slow-types"],
  });

  assertEquals(result.exitCode, 0);
  const publishCommand = result.commandsExecuted.find((cmd) =>
    cmd.includes("deno publish")
  )!;
  assertStringIncludes(publishCommand, "--allow-slow-types");
  assertStringIncludes(publishCommand, "--set-version");
  assertStringIncludes(publishCommand, "9.0.0");
});

Deno.test("passes multiple extra arguments through to jsr publish", async () => {
  const testEnv = setupTestEnv({
    inputData: {
      nextVersionName: "10.0.0",
      testMode: true,
    },
    mockAlreadyDeployed: false,
  });

  const result = await runScript({
    dataFilePath: testEnv.dataFile,
    packagePath: testEnv.tempDir,
    mockAlreadyDeployed: false,
    additionalArgs: ["--allow-slow-types", "--allow-dirty"],
  });

  assertEquals(result.exitCode, 0);
  const publishCommand = result.commandsExecuted.find((cmd) =>
    cmd.includes("deno publish")
  )!;
  assertStringIncludes(publishCommand, "--allow-slow-types");
  assertStringIncludes(publishCommand, "--allow-dirty");
  assertStringIncludes(publishCommand, "--set-version");
  assertStringIncludes(publishCommand, "10.0.0");
});

Deno.test("does not pass --package-path to jsr publish command", async () => {
  const testEnv = setupTestEnv({
    inputData: {
      nextVersionName: "11.0.0",
      testMode: true,
    },
    mockAlreadyDeployed: false,
  });

  const result = await runScript({
    dataFilePath: testEnv.dataFile,
    packagePath: testEnv.tempDir,
    mockAlreadyDeployed: false,
  });

  assertEquals(result.exitCode, 0);
  const publishCommand = result.commandsExecuted.find((cmd) =>
    cmd.includes("deno publish")
  )!;
  // Verify --package-path is NOT in the jsr publish command
  assertEquals(publishCommand.includes("--package-path"), false);
  // Verify the command still has the expected arguments
  assertStringIncludes(publishCommand, "--set-version");
  assertStringIncludes(publishCommand, "11.0.0");
});

Deno.test("uses deno publish when deno is installed", async () => {
  const testEnv = setupTestEnv({
    inputData: {
      nextVersionName: "12.0.0",
      testMode: true,
    },
    mockAlreadyDeployed: false,
  });

  const result = await runScript({
    dataFilePath: testEnv.dataFile,
    packagePath: testEnv.tempDir,
    mockAlreadyDeployed: false,
    additionalArgs: ["--allow-dirty"],
    mockDenoInstalled: true,
  });

  assertEquals(result.exitCode, 0);
  const publishCommand = result.commandsExecuted.find((cmd) =>
    cmd.includes("deno publish")
  );
  assert(publishCommand, "Should have executed deno publish command");
  assertEquals(
    publishCommand,
    "deno publish '--set-version' '12.0.0' '--allow-dirty' '--dry-run'",
  );
});

Deno.test("uses npx jsr publish when deno is not installed", async () => {
  const testEnv = setupTestEnv({
    inputData: {
      nextVersionName: "13.0.0",
      testMode: true,
    },
    mockAlreadyDeployed: false,
  });

  const result = await runScript({
    dataFilePath: testEnv.dataFile,
    packagePath: testEnv.tempDir,
    mockAlreadyDeployed: false,
    additionalArgs: ["--allow-dirty"],
    mockDenoInstalled: false,
  });

  assertEquals(result.exitCode, 0);
  const publishCommand = result.commandsExecuted.find((cmd) =>
    cmd.includes("npx jsr publish")
  );
  assert(publishCommand, "Should have executed npx jsr publish command");
  assertEquals(
    publishCommand,
    "npx jsr publish '--set-version' '13.0.0' '--allow-dirty' '--dry-run'",
  );
});
