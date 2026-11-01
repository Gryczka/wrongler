const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { resolveWranglerBin } = require("../dist/wrangler-bin");

test("finds Wrangler's CLI script even though its exports map hides bin/", () => {
	const bin = resolveWranglerBin();
	assert.match(bin.replace(/\\/g, "/"), /wrangler\/bin\/wrangler\.js$/);
	assert.ok(fs.existsSync(bin));
});
