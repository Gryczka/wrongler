const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parseArgs, toWranglerDeployArgs } = require("../dist/args");
const { loadConfig, resolveEnvConfig } = require("../dist/config");
const { buildDeployArgs } = require("../dist/yolo/deploy");

test("YOLO redeploys pass the user's flags to Wrangler, minus wrongler's own", () => {
	const argv = ["deploy", "--yolo", "--env", "staging", "-c", "wrangler.prod.jsonc", "--var", "A:1", "--keep-vars", "-v", "--dry-run"];
	assert.deepEqual(toWranglerDeployArgs(argv), [
		"deploy", "--env", "staging", "-c", "wrangler.prod.jsonc", "--var", "A:1", "--keep-vars", "--dry-run",
	]);
});

test("buildDeployArgs uses wranglerArgs as-is and never forces --name", () => {
	const args = buildDeployArgs({
		name: "yolo-test", env: "staging", entry: { file: "/abs/src/index.ts" },
		compatibilityDate: "2026-11-01", wranglerArgs: ["deploy", "--env", "staging"],
	});
	assert.deepEqual(args, ["deploy", "--env", "staging"]);
});

test("parseArgs understands --flag=value", () => {
	const parsed = parseArgs(["deploy", "--yolo", "--env=staging", "--name=w", "--config=alt.toml"]);
	assert.equal(parsed.env, "staging");
	assert.equal(parsed.name, "w");
	assert.equal(parsed.config, "alt.toml");
});

test("resolveEnvConfig follows Wrangler's <name>-<env> naming and env overrides", () => {
	const config = {
		name: "yolo-test", main: "src/index.ts", account_id: "top", assets: { directory: "public" },
		env: { staging: { account_id: "stage" }, named: { name: "custom", main: "src/other.ts" } },
	};
	assert.equal(resolveEnvConfig(config).name, "yolo-test");
	const staging = resolveEnvConfig(config, "staging");
	assert.equal(staging.name, "yolo-test-staging");
	assert.equal(staging.account_id, "stage");
	assert.deepEqual(staging.assets, { directory: "public" });
	const named = resolveEnvConfig(config, "named");
	assert.equal(named.name, "custom");
	assert.equal(named.main, "src/other.ts");
	assert.equal(resolveEnvConfig({ ...config, legacy_env: false }, "staging").name, "yolo-test");
});

test("loadConfig honours an explicit --config path", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wrongler-test-"));
	fs.writeFileSync(path.join(dir, "wrangler.toml"), 'name = "default"\n');
	fs.mkdirSync(path.join(dir, "cfg"));
	fs.writeFileSync(path.join(dir, "cfg", "prod.jsonc"), '{ "name": "prod", }');
	assert.equal(loadConfig(dir).name, "default");
	assert.equal(loadConfig(dir, "cfg/prod.jsonc").name, "prod");
	assert.equal(loadConfig(dir, "missing.toml"), null);
});

test("values of Wrangler's own flags aren't mistaken for the entry point", () => {
	const parsed = parseArgs(["deploy", "--var", "FOO:bar", "--routes", "example.com/*", "--yolo"]);
	assert.equal(parsed.entryPoint, undefined);
	assert.deepEqual(parsed.remainingArgs, ["--var", "FOO:bar", "--routes", "example.com/*"]);
	assert.equal(parseArgs(["deploy", "--var", "A:1", "src/main.ts"]).entryPoint, "src/main.ts");
});
