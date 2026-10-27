/**
 * CLI mode selection: route commands to Wrangler (default) or Cloudflare's
 * newer `cf` CLI.
 *
 * Precedence:
 *   1. `--cf` / `--wrangler` flags (wrongler-only, stripped before passthrough)
 *   2. `WRONGLER_CLI=cf|wrangler` environment variable
 *   3. Auto-detect from the current directory: a `cloudflare.config.ts` with no
 *      Wrangler config means a cf project. Cloudflare's guidance is to use cf
 *      unless the project has a Wrangler config, so a Wrangler config wins.
 *   4. Default to Wrangler.
 */

import { existsSync } from "node:fs";
import path from "node:path";

export type CliMode = "wrangler" | "cf";

export type ModeSource = "flag" | "env" | "cf-config" | "wrangler-config" | "default";

export interface ModeResolution {
	mode: CliMode;
	source: ModeSource;
	/** Arguments with wrongler's mode flags removed */
	args: string[];
}

/** Project config file used by the cf CLI */
export const CF_CONFIG_FILES = ["cloudflare.config.ts"];

/** Project config files used by Wrangler */
export const WRANGLER_CONFIG_FILES = ["wrangler.toml", "wrangler.json", "wrangler.jsonc"];

/**
 * Top-level commands that are still Wrangler-only during the cf beta
 * (live logs and single-secret management). In cf mode these are routed
 * to Wrangler instead. Remove entries as cf gains equivalents.
 */
export const WRANGLER_ONLY_COMMANDS = new Set(["tail", "secret"]);

/** cf commands that build or run the project from cloudflare.config.ts */
export const CF_PROJECT_COMMANDS = new Set(["deploy", "dev", "build"]);

/** Environment variable that selects the CLI */
export const MODE_ENV_VAR = "WRONGLER_CLI";

export function hasCfConfig(dir: string): boolean {
	return CF_CONFIG_FILES.some((file) => existsSync(path.join(dir, file)));
}

export function hasWranglerConfig(dir: string): boolean {
	return WRANGLER_CONFIG_FILES.some((file) => existsSync(path.join(dir, file)));
}

/**
 * Decides whether this invocation should go to Wrangler or cf.
 */
export function resolveMode(
	args: string[],
	env: NodeJS.ProcessEnv = process.env,
	cwd: string = process.cwd()
): ModeResolution {
	let flagMode: CliMode | undefined;
	const remaining: string[] = [];

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		// Everything after `--` belongs to the underlying CLI
		if (arg === "--") {
			remaining.push(...args.slice(i));
			break;
		}
		if (arg === "--cf") {
			flagMode = "cf";
			continue;
		}
		if (arg === "--wrangler") {
			flagMode = "wrangler";
			continue;
		}
		remaining.push(arg);
	}

	if (flagMode) {
		return { mode: flagMode, source: "flag", args: remaining };
	}

	const envValue = env[MODE_ENV_VAR]?.trim().toLowerCase();
	if (envValue === "cf" || envValue === "wrangler") {
		return { mode: envValue, source: "env", args: remaining };
	}

	if (hasWranglerConfig(cwd)) {
		return { mode: "wrangler", source: "wrangler-config", args: remaining };
	}

	if (hasCfConfig(cwd)) {
		return { mode: "cf", source: "cf-config", args: remaining };
	}

	return { mode: "wrangler", source: "default", args: remaining };
}

/**
 * Global flags (cf and Wrangler) that take a separate value, so the value
 * isn't mistaken for the command in e.g. `--profile work deploy`.
 */
const VALUE_FLAGS = new Set([
	"--profile",
	"--zone",
	"-z",
	"--mode",
	"-m",
	"--persist-to",
	"--env",
	"-e",
	"--config",
	"-c",
	"--cwd",
]);

/**
 * Returns the first positional argument (the command), skipping flags and
 * the values of known value-taking global flags.
 */
export function getCommand(args: string[]): string | undefined {
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--") return undefined;
		if (VALUE_FLAGS.has(arg)) {
			i++;
			continue;
		}
		if (!arg.startsWith("-")) return arg;
	}
	return undefined;
}

/**
 * Rewrites Wrangler-style `--env <name>` / `-e <name>` / `--env=<name>` into
 * cf's equivalent `--mode <name>`. Only meant for cf project commands
 * (deploy, dev, build), where `--mode` selects the config variant.
 */
export function mapEnvToMode(args: string[]): { args: string[]; mapped?: string } {
	const out: string[] = [];
	let mapped: string | undefined;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--") {
			out.push(...args.slice(i));
			break;
		}
		if ((arg === "--env" || arg === "-e") && i + 1 < args.length) {
			mapped = args[i + 1];
			out.push("--mode", mapped);
			i++;
			continue;
		}
		if (arg.startsWith("--env=")) {
			mapped = arg.slice("--env=".length);
			out.push(`--mode=${mapped}`);
			continue;
		}
		out.push(arg);
	}

	return { args: out, mapped };
}
