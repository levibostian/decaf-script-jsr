import { assertSnapshot } from "jsr:@std/testing@^1.0.0/snapshot";
import { join } from "jsr:@std/path@^1.0.8";

interface TestEnv {
  tempDir: string;
  dataFile: string;
}

interface RunScriptWithLogsOptions {
  testEnv: TestEnv;
  mockAlreadyDeployed?: boolean;
}

function setupTestEnv(
  inputData: { nextVersionName: string; testMode: boolean },
  packageName = "@test/test-package",
  initialVersion = "1.0.0",
  configFileType: "jsr.json" | "deno.jsonc" | "deno.json" = "deno.json",
): TestEnv {
  const tempDir = Deno.makeTempDirSync();

  const packageJson = {
    name: packageName,
    version: initialVersion,
    description: "Test package for log testing",
    license: "MIT",
    exports: "./index.ts",
  };
  Deno.writeTextFileSync(
    join(tempDir, configFileType),
    JSON.stringify(packageJson, null, 2),
  );
  Deno.writeTextFileSync(
    join(tempDir, "index.ts"),
    "export const test = true;",
  );

  const dataFile = Deno.makeTempFileSync();
  Deno.writeTextFileSync(dataFile, JSON.stringify(inputData));

  return {
    tempDir,
    dataFile,
  };
}

async function runScriptWithLogs(options: RunScriptWithLogsOptions) {
  const { testEnv, mockAlreadyDeployed } = options;

  const env: Record<string, string> = {
    DATA_FILE_PATH: testEnv.dataFile,
  };

  if (mockAlreadyDeployed !== undefined) {
    env.DECAF_SCRIPT_JSR_DID_ALREADY_DEPLOY = mockAlreadyDeployed
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
      testEnv.tempDir,
    ],
    env,
    stdout: "piped",
    stderr: "piped",
  });

  const { stdout } = await command.output();
  return new TextDecoder().decode(stdout);
}

Deno.test("console logs: successful deployment flow", async (t) => {
  const testEnv = setupTestEnv({
    nextVersionName: "2.0.0",
    testMode: true,
  });

  const logs = await runScriptWithLogs({
    testEnv,
    mockAlreadyDeployed: false,
  });
  await assertSnapshot(t, logs);
});

Deno.test("console logs: already deployed - skip publishing", async (t) => {
  const testEnv = setupTestEnv({
    nextVersionName: "1.5.0",
    testMode: false,
  });

  const logs = await runScriptWithLogs({
    testEnv,
    mockAlreadyDeployed: true,
  });
  await assertSnapshot(t, logs);
});

Deno.test("console logs: no config file error", async (t) => {
  const inputData = {
    nextVersionName: "2.0.0",
    testMode: false,
  };

  const dataFile = Deno.makeTempFileSync();
  Deno.writeTextFileSync(dataFile, JSON.stringify(inputData));
  const emptyDir = Deno.makeTempDirSync();

  const env: Record<string, string> = {
    DATA_FILE_PATH: dataFile,
    DECAF_SCRIPT_JSR_IS_DENO_INSTALLED: "true",
  };

  const command = new Deno.Command("deno", {
    args: [
      "run",
      "--quiet",
      "--allow-all",
      "--no-lock",
      "script.ts",
      "--package-path",
      emptyDir,
    ],
    env,
    stdout: "piped",
    stderr: "piped",
  });

  const { stdout } = await command.output();
  let logs = new TextDecoder().decode(stdout);
  // Normalize temp directory path for consistent snapshots
  logs = logs.replace(emptyDir, "[TEMP_DIR]");
  await assertSnapshot(t, logs);
});

Deno.test("console logs: test mode with dry-run", async (t) => {
  const testEnv = setupTestEnv({
    nextVersionName: "3.0.0",
    testMode: true,
  });

  const logs = await runScriptWithLogs({
    testEnv,
    mockAlreadyDeployed: false,
  });
  await assertSnapshot(t, logs);
});

