#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";
import chalk from "chalk";
import { parseArgs } from "./args";
import { loadConfig } from "./config";
import { startYoloMode, startYoloWatch, createCfIgnoreMatcher } from "./yolo/watch";
import type { DeployParams } from "./yolo/deploy";
import { getCachedAccountId } from "./cache";
import {
	resolveMode,
	getCommand,
	mapEnvToMode,
	hasCfConfig,
	hasWranglerConfig,
	WRANGLER_ONLY_COMMANDS,
	CF_PROJECT_COMMANDS,
	type ModeResolution,
} from "./mode";
import { resolveCfBinary, passThroughCf, printCfNotInstalled, type CfBinary } from "./cf";
import { buildCfDeployArgs, deployWithCf } from "./yolo/cf-deploy";

// Parse command line arguments
const rawArgs = process.argv.slice(2);

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

function printWranglerNotInstalled() {
	console.error("Error: wrangler is not installed.");
	console.error("");
	console.error("Wrongler requires wrangler to be installed as a peer dependency.");
	console.error("Install it with: npm install wrangler");
	console.error("");
}

// Display warning that this is NOT the official CLI. Written to stderr so
// JSON output on stdout (cf's default, wrangler's --json) can still be piped.
function printBanner(resolution: ModeResolution) {
	const official = resolution.mode === "cf" ? "cf" : "Wrangler";
	const pkg = resolution.mode === "cf" ? "cf" : "wrangler";
	console.error(chalk.yellow.bold(`\n⚠️  WARNING: You are using WRONG-ler, not ${official}!`));
	console.error(chalk.yellow("   This is an experimental wrapper for fun purposes only."));
	console.error(chalk.yellow("   Looking for the official Cloudflare CLI tool?"));
	console.error(chalk.cyan(`   → https://www.npmjs.com/package/${pkg}`));

	if (resolution.mode === "cf") {
		const reason =
			resolution.source === "flag"
				? "--cf"
				: resolution.source === "env"
					? "WRONGLER_CLI=cf"
					: "found cloudflare.config.ts";
		console.error(chalk.dim(`   cf mode (${reason})`));
	}
	console.error("");
}

// Main CLI logic
async function main() {
	const resolution = resolveMode(rawArgs);
	const args = resolution.args;

	printBanner(resolution);

	if (resolution.mode === "cf") {
		await runCfMode(args);
		return;
	}

	// Check if wrangler is installed
	if (!checkWranglerInstalled()) {
		printWranglerNotInstalled();
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

// Run a command with Cloudflare's cf CLI
async function runCfMode(args: string[]) {
	const projectRoot = process.cwd();
	const command = getCommand(args);

	// Live logs and single-secret commands are still Wrangler-only during the cf beta
	if (command && WRANGLER_ONLY_COMMANDS.has(command)) {
		console.error(chalk.dim(`   cf has no "${command}" command yet, so this one goes to Wrangler.\n`));
		if (!checkWranglerInstalled()) {
			printWranglerNotInstalled();
			process.exit(1);
		}
		passThroughWrangler(args);
		return;
	}

	const cf = resolveCfBinary(projectRoot);
	if (!cf) {
		printCfNotInstalled();
		process.exit(1);
	}

	let cfArgs = args;

	if (command && CF_PROJECT_COMMANDS.has(command)) {
		// cf must not dev/build/deploy a project that only has a Wrangler config
		if (!hasCfConfig(projectRoot) && hasWranglerConfig(projectRoot)) {
			console.error("Error: this project has a Wrangler config but no cloudflare.config.ts.");
			console.error("");
			console.error(`cf can't ${command} it until it's migrated. Preview the migration with:`);
			console.error("  wrongler --cf migrate --dry-run");
			console.error("");
			console.error(`Or keep using Wrangler: wrongler --wrangler ${command}`);
			console.error("");
			process.exit(1);
		}

		// Wrangler's --env maps to cf's --mode
		const { args: mapped, mapped: modeName } = mapEnvToMode(args);
		if (modeName !== undefined) {
			console.error(chalk.dim(`   Using --mode ${modeName} (cf's equivalent of --env)\n`));
		}
		cfArgs = mapped;
	}

	if (command === "deploy" && cfArgs.includes("--yolo")) {
		await handleCfYoloMode(cf, cfArgs, projectRoot);
		return;
	}

	passThroughCf(cf, cfArgs);
}

// Handle YOLO mode deployment with cf
async function handleCfYoloMode(cf: CfBinary, args: string[], projectRoot: string) {
	if (!hasCfConfig(projectRoot)) {
		console.error("Error: Could not find cloudflare.config.ts in the current directory.");
		console.error("");
		console.error("YOLO mode with cf needs a cloudflare.config.ts project file.");
		console.error("");
		process.exit(1);
	}

	const verbose = args.includes("--verbose") || args.includes("-v");
	const deployArgs = buildCfDeployArgs(args);

	console.log(`✓ Using cf ${cf.version}\n`);

	await startYoloWatch(
		{
			deploy: () => deployWithCf({ cf, args: deployArgs, projectRoot, verbose }),
			watchPaths: [projectRoot],
			ignored: createCfIgnoreMatcher(projectRoot),
		},
		{
			verbose,
			debounceMs: 50,
		}
	);
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
