const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { createIgnoreMatcher } = require("../dist/yolo/watch");

const root = path.resolve("/projects/build/my-worker");
const ignored = createIgnoreMatcher(root);
const at = (...parts) => path.join(root, ...parts);

test("ignores dependency, VCS, build and state directories", () => {
	for (const dir of ["node_modules", ".git", ".wrangler", "dist", "build"]) {
		assert.equal(ignored(at(dir)), true, dir);
		assert.equal(ignored(at(dir, "nested", "file.js")), true, dir);
	}
	assert.equal(ignored(at("src", "node_modules", "pkg", "index.js")), true);
	assert.equal(ignored(at(".wrangler", "tmp", "bundle.js")), true);
});

test("watches source files", () => {
	assert.equal(ignored(root), false);
	assert.equal(ignored(at("src", "index.ts")), false);
	assert.equal(ignored(at("wrangler.jsonc")), false);
	assert.equal(ignored(at("src", "distance.ts")), false);
});

test("only checks path segments below the project root", () => {
	// root itself lives under a folder named "build"
	assert.equal(ignored(at("src", "index.ts")), false);
	assert.equal(ignored(path.resolve("/elsewhere/dist/file.js")), false);
});
