/**
 * Configuration file parser for wrangler.toml
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import * as TOML from "toml";
import type { Config } from "./types";

/**
 * Finds the wrangler.toml config file in the project
 */
export function findConfigPath(startDir?: string): string | null {
	const searchDir = startDir || process.cwd();
	const possiblePaths = [
		path.join(searchDir, "wrangler.toml"),
		path.join(searchDir, "wrangler.jsonc"),
		path.join(searchDir, ".wrangler", "config.toml"),
	];

	for (const configPath of possiblePaths) {
		if (existsSync(configPath)) {
			return configPath;
		}
	}

	return null;
}

/**
 * Parses a wrangler.toml config file
 */
export function parseConfig(configPath: string): Config {
	try {
		const content = readFileSync(configPath, "utf-8");
		const parsed = TOML.parse(content) as Record<string, unknown>;

		return {
			name: parsed.name as string | undefined,
			main: parsed.main as string | undefined,
			account_id: parsed.account_id as string | undefined,
			configPath,
			rules: parsed.rules as Config["rules"],
			compatibility_date: parsed.compatibility_date as string | undefined,
			compatibility_flags: parsed.compatibility_flags as string[] | undefined,
			vars: parsed.vars as Record<string, string> | undefined,
			define: parsed.define as Record<string, string> | undefined,
			...parsed,
		};
	} catch (error) {
		throw new Error(
			`Failed to parse config file ${configPath}: ${error instanceof Error ? error.message : String(error)}`
		);
	}
}

/**
 * Loads the wrangler config from the current directory
 */
export function loadConfig(projectRoot?: string): Config | null {
	const configPath = findConfigPath(projectRoot);
	if (!configPath) {
		return null;
	}

	return parseConfig(configPath);
}
