const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseArgs } = require("../dist/args");

test("parses deploy --yolo with entry point and flags", () => {
	const parsed = parseArgs([
		"deploy", "src/index.ts", "--yolo", "--name", "w", "--env", "staging",
		"--compatibility-flags", "a", "--compatibility-flags", "b", "--dry-run", "--minify", "--keep-vars",
	]);
	assert.equal(parsed.command, "deploy");
	assert.equal(parsed.entryPoint, "src/index.ts");
	assert.equal(parsed.yolo, true);
	assert.equal(parsed.name, "w");
	assert.equal(parsed.env, "staging");
	assert.deepEqual(parsed.compatibilityFlags, ["a", "b"]);
	assert.equal(parsed.dryRun, true);
	assert.equal(parsed.minify, true);
	assert.deepEqual(parsed.remainingArgs, ["--keep-vars"]);
});

test("plain deploy is not YOLO", () => {
	assert.equal(parseArgs(["deploy"]).yolo, undefined);
});
