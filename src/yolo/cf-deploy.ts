/**
 * Deploy wrapper for cf mode - invokes `cf deploy`
 */

import { spawn } from "node:child_process";
import type { CfBinary } from "../cf";
import type { DeploymentResult } from "../types";
import { parseDeployOutput } from "./deploy";

export interface CfDeployParams {
	cf: CfBinary;
	/** Full argument list for cf, starting with the deploy command */
	args: string[];
	projectRoot: string;
	verbose: boolean;
	/** Worker name, if known, for display only */
	workerName?: string;
}

/**
 * Wrongler flags that cf doesn't understand. `-v` is wrongler's verbose
 * shorthand but means --version to cf, so it is consumed here too.
 */
const WRONGLER_ONLY_FLAGS = new Set(["--yolo", "--verbose", "-v"]);

/**
 * Removes wrongler-only flags from the args passed through to cf deploy.
 */
export function buildCfDeployArgs(args: string[]): string[] {
	const out: string[] = [];
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--") {
			out.push(...args.slice(i));
			break;
		}
		if (WRONGLER_ONLY_FLAGS.has(arg)) {
			continue;
		}
		out.push(arg);
	}
	return out;
}

/**
 * Runs `cf deploy` once and resolves with the parsed result.
 */
export function deployWithCf(params: CfDeployParams): Promise<DeploymentResult> {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [params.cf.binPath, ...params.args], {
			stdio: params.verbose ? "inherit" : "pipe",
			shell: false,
			cwd: params.projectRoot,
			env: process.env,
		});

		let stdout = "";
		let stderr = "";

		if (!params.verbose && child.stdout && child.stderr) {
			child.stdout.on("data", (data) => {
				stdout += data.toString();
			});
			child.stderr.on("data", (data) => {
				stderr += data.toString();
			});
		}

		child.on("error", (error) => {
			reject(error);
		});

		child.on("exit", (code) => {
			if (code === 0) {
				const { url, versionId } = parseDeployOutput(stdout + stderr);
				resolve({
					versionId,
					targets: url ? [url] : undefined,
					workerName: params.workerName,
				});
				return;
			}

			if (!params.verbose) {
				const errorOutput = (stdout + stderr).trim();
				if (errorOutput) {
					console.error(errorOutput);
				}
			}
			reject(new Error(`cf deploy failed with exit code ${code}`));
		});
	});
}
