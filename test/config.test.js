const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { findConfigPath, loadConfig } = require("../dist/config");

function tempProject(files) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wrongler-test-"));
	for (const [name, content] of Object.entries(files)) {
		fs.writeFileSync(path.join(dir, name), content);
	}
	return dir;
}

test("parses wrangler.toml", () => {
	const dir = tempProject({
		"wrangler.toml": 'name = "toml-worker"\nmain = "src/index.ts"\ncompatibility_date = "2026-10-01"\n',
	});
	const config = loadConfig(dir);
	assert.equal(config.name, "toml-worker");
	assert.equal(config.main, "src/index.ts");
	assert.equal(config.compatibility_date, "2026-10-01");
});

test("parses wrangler.jsonc with comments and trailing commas", () => {
	const dir = tempProject({
		"wrangler.jsonc": `{
	// the YOLO-est worker
	"name": "jsonc-worker",
	"main": "src/index.ts", /* inline comment */
	"compatibility_flags": ["nodejs_compat",],
	"vars": { "URL": "https://example.com//not-a-comment" },
}`,
	});
	const config = loadConfig(dir);
	assert.equal(config.name, "jsonc-worker");
	assert.deepEqual(config.compatibility_flags, ["nodejs_compat"]);
	assert.equal(config.vars.URL, "https://example.com//not-a-comment");
});

test("parses wrangler.json", () => {
	const dir = tempProject({ "wrangler.json": '{ "name": "json-worker", "main": "index.js" }' });
	assert.equal(loadConfig(dir).name, "json-worker");
});

test("uses Wrangler's precedence: json, then jsonc, then toml", () => {
	const dir = tempProject({
		"wrangler.toml": 'name = "toml"\n',
		"wrangler.jsonc": '{ "name": "jsonc" }',
	});
	assert.equal(path.basename(findConfigPath(dir)), "wrangler.jsonc");
	fs.writeFileSync(path.join(dir, "wrangler.json"), '{ "name": "json" }');
	assert.equal(loadConfig(dir).name, "json");
});

test("reports broken JSONC with the file path", () => {
	const dir = tempProject({ "wrangler.jsonc": '{ "name": ' });
	assert.throws(() => loadConfig(dir), /Failed to parse config file .*wrangler\.jsonc/);
});

test("returns null when there is no config", () => {
	assert.equal(loadConfig(tempProject({})), null);
});
