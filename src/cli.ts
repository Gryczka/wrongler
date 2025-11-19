#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";
import chalk from "chalk";
import { parseArgs } from "./args";
import { loadConfig } from "./config";
import { startYoloMode } from "./yolo/watch";
import type { DeployParams } from "./yolo/deploy";
import { getCachedAccountId } from "./cache";

// Parse command line arguments
const args = process.argv.slice(2);

// Check if wrangler is installed
function checkWranglerInstalled(): boolean {
	try {
		// Try to resolve wrangler
		require.resolve("wrangler");
		return true;
	} catch {
		return false;
	}
}

// Main CLI logic
async function main() {
	// Display warning that this is NOT the official Wrangler
	console.log(chalk.yellow.bold("\n⚠️  WARNING: You are using WRONG-ler, not Wrangler!"));
	console.log(chalk.yellow("   This is an experimental wrapper for fun purposes only."));
	console.log(chalk.yellow("   Looking for the official Cloudflare CLI tool?"));
	console.log(chalk.cyan("   → https://www.npmjs.com/package/wrangler\n"));

	// Check if wrangler is installed
	if (!checkWranglerInstalled()) {
		console.error("Error: wrangler is not installed.");
		console.error("");
		console.error("Wrongler requires wrangler to be installed as a peer dependency.");
		console.error("Install it with: npm install wrangler");
		console.error("");
		process.exit(1);
	}

	// Parse arguments
	const parsed = parseArgs(args);

	// Check if this is a deploy command with --yolo flag
	if (parsed.command === "deploy" && parsed.yolo) {
		// Handle YOLO mode
		await handleYoloMode(parsed);
	} else {
		// Pass through all other commands to wrangler
		passThroughWrangler(args);
	}
}

// Handle YOLO mode deployment
async function handleYoloMode(parsed: ReturnType<typeof parseArgs>) {
	const projectRoot = process.cwd();

	// Load config from wrangler.toml
	const config = loadConfig(projectRoot);
	if (!config) {
		console.error("Error: Could not find wrangler.toml in the current directory.");
		console.error("");
		console.error("YOLO mode requires a wrangler.toml configuration file.");
		console.error("");
		process.exit(1);
	}

	// Determine entry point
	const entryPoint = parsed.entryPoint || config.main || "./src/index.ts";
	const entryPath = path.resolve(projectRoot, entryPoint);

	// Validate entry point exists
	if (!existsSync(entryPath)) {
		console.error(`Error: Entry point file not found: ${entryPoint}`);
		console.error("");
		console.error("Please ensure the file exists or specify a different entry point:");
		console.error(`  - Update 'main' in wrangler.toml`);
		console.error(`  - Or use: wrongler deploy <file> --yolo`);
		console.error("");
		process.exit(1);
	}

	// Determine worker name
	const workerName = parsed.name || config.name;
	if (!workerName) {
		console.error("Error: Worker name not specified.");
		console.error("");
		console.error("Specify a name with --name or in wrangler.toml");
		console.error("");
		process.exit(1);
	}

	// Determine account ID (check config, then cache, then prompt)
	let accountId = config.account_id;

	if (!accountId) {
		// Check cache
		accountId = getCachedAccountId();

		if (!accountId) {
			// No account ID in config or cache - fetch and prompt for selection
			console.log("ℹ️  No account_id found in wrangler.toml or cache.");
			console.log("   Fetching available accounts...\n");

			try {
				const { getAccountsWithLogin, selectAccount } = await import('./account');

				// This will handle login if necessary
				const accounts = await getAccountsWithLogin();

				if (accounts.length === 0) {
					console.error("\n❌ No Cloudflare accounts found.");
					console.error("");
					console.error("Please ensure your Cloudflare account is properly set up.");
					console.error("");
					process.exit(1);
				}

				// Prompt user to select an account
				accountId = await selectAccount(accounts);

				// Cache the selection
				const { setCachedAccountId } = await import('./cache');
				setCachedAccountId(accountId);

				console.log("💾 Account ID cached for future deployments");
				console.log(`   You can also add this to wrangler.toml: account_id = "${accountId}"\n`);
			} catch (error) {
				console.error("\n❌ Error:", error instanceof Error ? error.message : String(error));
				console.error("");
				process.exit(1);
			}
		} else {
			// Account ID found in cache
			console.log(`✓ Using cached account ID: ${accountId}\n`);
		}
	} else {
		// Account ID found in config
		console.log(`✓ Using account ID from wrangler.toml: ${accountId}\n`);
	}

	// Build deploy parameters
	const deployParams: DeployParams = {
		config,
		accountId,
		entry: {
			file: entryPath,
			format: "modules",
		},
		rules: config.rules,
		name: workerName,
		env: parsed.env,
		compatibilityDate: parsed.compatibilityDate || config.compatibility_date,
		compatibilityFlags: parsed.compatibilityFlags || config.compatibility_flags,
		legacyAssetPaths: undefined,
		assetsOptions: undefined,
		vars: config.vars,
		defines: config.define,
		alias: undefined,
		triggers: undefined,
		routes: undefined,
		domains: undefined,
		useServiceEnvironments: undefined,
		jsxFactory: undefined,
		jsxFragment: undefined,
		tsconfig: undefined,
		isWorkersSite: false,
		minify: parsed.minify,
		outDir: undefined,
		outFile: undefined,
		dryRun: parsed.dryRun,
		noBundle: parsed.noBundle,
		keepVars: undefined,
		logpush: undefined,
		uploadSourceMaps: undefined,
		oldAssetTtl: undefined,
		projectRoot,
		dispatchNamespace: undefined,
		experimentalAutoCreate: false,
		metafile: undefined,
		containersRollout: undefined,
		strict: undefined,
		verbose: parsed.verbose,
	};

	// Start YOLO mode
	await startYoloMode(deployParams, {
		verbose: parsed.verbose || false,
		debounceMs: 50,
	});
}

// Pass command through to wrangler
function passThroughWrangler(args: string[]) {
	// Find wrangler binary
	const wranglerPath = require.resolve("wrangler/bin/wrangler.js");

	// Spawn wrangler process
	const wrangler = spawn("node", [wranglerPath, ...args], {
		stdio: "inherit",
		shell: false,
	});

	wrangler.on("error", (error) => {
		console.error("Error spawning wrangler:", error);
		process.exit(1);
	});

	wrangler.on("exit", (code) => {
		process.exit(code || 0);
	});
}

// Run main
main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
