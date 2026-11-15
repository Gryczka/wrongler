/**
 * Locates the Wrangler CLI entry point
 */

import path from "node:path";

/**
 * Returns the absolute path to Wrangler's CLI script.
 *
 * Wrangler 4.100+ ships an "exports" map that no longer exposes
 * `wrangler/bin/wrangler.js`, so we find its package.json (which is
 * exported) and follow the "bin" field from there.
 *
 * Throws if Wrangler is not installed.
 */
export function resolveWranglerBin(): string {
	const pkgPath = require.resolve("wrangler/package.json");
	const pkg = require(pkgPath) as { bin?: string | Record<string, string> };
	const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.wrangler;
	return path.join(path.dirname(pkgPath), bin ?? path.join("bin", "wrangler.js"));
}

