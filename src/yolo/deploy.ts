/**
 * Deploy wrapper - invokes wrangler deploy command
 */

import { spawn } from "node:child_process";
import type { DeploymentResult, Config, Entry, AssetsOptions, LegacyAssetPaths } from "../types";

/**
 * Parses wrangler output to extract deployment information
 */
function parseWranglerOutput(output: string): { url?: string; versionId?: string } {
	const lines = output.split("\n");
	let url: string | undefined;
	let versionId: string | undefined;

	for (const line of lines) {
		// Match deployment URL patterns
		if (line.includes("https://") && line.includes(".workers.dev")) {
			const match = line.match(/https:\/\/[^\s]+\.workers\.dev[^\s]*/);
			if (match && !url) {
				url = match[0];
			}
		}

		// Match version ID
		if (line.includes("Version ID:") || line.includes("Current Version ID:")) {
			const match = line.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
			if (match) {
				versionId = match[0];
			}
		}
	}

	return { url, versionId };
}

export interface DeployParams {
	config: Config;
	accountId: string | undefined;
	entry: Entry;
	rules: Config["rules"];
	name: string;
	env: string | undefined;
	compatibilityDate: string | undefined;
	compatibilityFlags: string[] | undefined;
	legacyAssetPaths: LegacyAssetPaths | undefined;
	assetsOptions: AssetsOptions | undefined;
	vars: Record<string, string> | undefined;
	defines: Record<string, string> | undefined;
	alias: Record<string, string> | undefined;
	triggers: string[] | undefined;
	routes: string[] | undefined;
	domains: string[] | undefined;
	useServiceEnvironments: boolean | undefined;
	jsxFactory: string | undefined;
	jsxFragment: string | undefined;
	tsconfig: string | undefined;
	isWorkersSite: boolean;
	minify: boolean | undefined;
	outDir: string | undefined;
	outFile: string | undefined;
	dryRun: boolean | undefined;
	noBundle: boolean | undefined;
	keepVars: boolean | undefined;
	logpush: boolean | undefined;
	uploadSourceMaps: boolean | undefined;
	oldAssetTtl: number | undefined;
	projectRoot: string | undefined;
	dispatchNamespace: string | undefined;
	experimentalAutoCreate: boolean;
	metafile: string | boolean | undefined;
	containersRollout: "immediate" | "gradual" | undefined;
	strict: boolean | undefined;
	verbose: boolean | undefined;
}

/**
 * Deploys a worker using wrangler CLI
 */
export default async function deploy(params: DeployParams): Promise<DeploymentResult> {
	return new Promise((resolve, reject) => {
		// Find wrangler binary
		let wranglerPath: string;
		try {
			wranglerPath = require.resolve("wrangler/bin/wrangler.js");
		} catch {
			reject(new Error("wrangler is not installed"));
			return;
		}

		// Build wrangler deploy command arguments
		const args: string[] = ["deploy"];

		// Add entry file
		if (params.entry.file) {
			args.push(params.entry.file);
		}

		// Add worker name
		if (params.name) {
			args.push("--name", params.name);
		}

		// Add environment
		if (params.env) {
			args.push("--env", params.env);
		}

		// Add compatibility date
		if (params.compatibilityDate) {
			args.push("--compatibility-date", params.compatibilityDate);
		}

		// Add compatibility flags
		if (params.compatibilityFlags && params.compatibilityFlags.length > 0) {
			for (const flag of params.compatibilityFlags) {
				args.push("--compatibility-flags", flag);
			}
		}

		// Add other flags
		if (params.minify) {
			args.push("--minify");
		}

		if (params.noBundle) {
			args.push("--no-bundle");
		}

		if (params.dryRun) {
			args.push("--dry-run");
		}

		// Decide stdio mode based on verbose flag
		const stdio: import("child_process").StdioOptions = params.verbose
			? "inherit"
			: "pipe";

		// Build environment variables
		const env = { ...process.env };
		if (params.accountId) {
			env.CLOUDFLARE_ACCOUNT_ID = params.accountId;
		}

		// Spawn wrangler process
		const wrangler = spawn("node", [wranglerPath, ...args], {
			stdio,
			shell: false,
			cwd: params.projectRoot || process.cwd(),
			env,
		});

		// Capture output for parsing (only when not in verbose mode)
		let stdout = "";
		let stderr = "";

		if (!params.verbose && wrangler.stdout && wrangler.stderr) {
			wrangler.stdout.on("data", (data) => {
				stdout += data.toString();
			});

			wrangler.stderr.on("data", (data) => {
				stderr += data.toString();
			});
		}

		wrangler.on("error", (error) => {
			reject(error);
		});

		wrangler.on("exit", (code) => {
			if (code === 0) {
				// Parse output to extract deployment info
				const combinedOutput = stdout + stderr;
				const { url, versionId } = parseWranglerOutput(combinedOutput);

				resolve({
					versionId,
					targets: url ? [url] : undefined,
					workerName: params.name,
				});
			} else {
				// Show error output in non-verbose mode
				if (!params.verbose) {
					const errorOutput = (stdout + stderr).trim();
					if (errorOutput) {
						console.error(errorOutput);
					}
				}
				reject(new Error(`wrangler deploy failed with exit code ${code}`));
			}
		});
	});
}
