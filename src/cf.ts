/**
 * Locating and running Cloudflare's `cf` CLI (npm package `cf`).
 *
 * cf is resolved as a Node package rather than from PATH: the Cloud Foundry
 * CLI is also called `cf`, so a PATH lookup could run the wrong tool.
 */

import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

export interface CfBinary {
	/** Absolute path to cf's bin script */
	binPath: string;
	/** Installed cf version */
	version: string;
}

function readCfPackage(packageJsonPath: string): CfBinary | null {
	try {
		const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
			name?: string;
			version?: string;
			description?: string;
			repository?: string | { url?: string };
			bin?: string | Record<string, string>;
		};

		// Make sure this is Cloudflare's cf and not an unrelated package
		const repo = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url ?? "";
		const isCloudflare =
			pkg.name === "cf" &&
			(/cloudflare/i.test(repo) || /cloudflare/i.test(pkg.description ?? ""));
		if (!isCloudflare) {
			return null;
		}

		const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.cf ?? pkg.bin?.cloudflare;
		if (!bin) {
			return null;
		}

		return {
			binPath: path.resolve(path.dirname(packageJsonPath), bin),
			version: pkg.version ?? "unknown",
		};
	} catch {
		return null;
	}
}

function globalNodeModules(): string | null {
	try {
		const result = spawnSync("npm", ["root", "-g"], {
			encoding: "utf-8",
			shell: process.platform === "win32",
			timeout: 10_000,
		});
		const root = result.stdout?.trim();
		return result.status === 0 && root ? root : null;
	} catch {
		return null;
	}
}

/**
 * Finds the cf CLI. Order:
 *   1. The project's own copy (so a pinned version in package.json wins,
 *      matching how cf itself behaves)
 *   2. A copy installed next to wrongler
 *   3. The global npm install
 */
export function resolveCfBinary(cwd: string = process.cwd()): CfBinary | null {
	const searchPaths: string[][] = [[cwd], [__dirname]];

	for (const paths of searchPaths) {
		try {
			const pkgPath = require.resolve("cf/package.json", { paths });
			const found = readCfPackage(pkgPath);
			if (found) return found;
		} catch {
			// not found here, keep looking
		}
	}

	const globalRoot = globalNodeModules();
	if (globalRoot) {
		const found = readCfPackage(path.join(globalRoot, "cf", "package.json"));
		if (found) return found;
	}

	return null;
}

export function printCfNotInstalled(): void {
	console.error("Error: Cloudflare's cf CLI is not installed.");
	console.error("");
	console.error("cf mode needs the cf package (Node.js 22.23+ or 24.22+):");
	console.error("  npm install -g cf");
	console.error("");
	console.error("Or switch back to Wrangler with --wrangler.");
	console.error("");
}

/**
 * Runs cf with inherited stdio and exits with its exit code.
 */
export function passThroughCf(cf: CfBinary, args: string[]): void {
	const child = spawn(process.execPath, [cf.binPath, ...args], {
		stdio: "inherit",
		shell: false,
	});

	child.on("error", (error) => {
		console.error("Error spawning cf:", error);
		process.exit(1);
	});

	child.on("exit", (code) => {
		// A null code means cf was killed by a signal; report failure
		process.exit(code ?? 1);
	});
}
