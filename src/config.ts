/**
 * Config file parser for wrangler.json / wrangler.jsonc / wrangler.toml
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import * as TOML from "toml";
import { parse as parseJsonc, printParseErrorCode, type ParseError } from "jsonc-parser";
import type { Config } from "./types";

/**
 * Config file names, in the same order of precedence Wrangler uses
 */
const CONFIG_FILE_NAMES = ["wrangler.json", "wrangler.jsonc", "wrangler.toml"];

/**
 * Finds the Wrangler config file in the project
 */
export function findConfigPath(startDir?: string): string | null {
	const searchDir = startDir || process.cwd();
	const possiblePaths = [
		...CONFIG_FILE_NAMES.map((name) => path.join(searchDir, name)),
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
 * Parses file contents as TOML or JSON(C), based on the file extension.
 * JSON files go through the JSONC parser too, since Wrangler allows
 * comments and trailing commas in both.
 */
function parseContent(configPath: string, content: string): Record<string, unknown> {
	const ext = path.extname(configPath).toLowerCase();

	if (ext === ".json" || ext === ".jsonc") {
		const errors: ParseError[] = [];
		const parsed = parseJsonc(content, errors, { allowTrailingComma: true });
		if (errors.length > 0) {
			const first = errors[0];
			throw new Error(`${printParseErrorCode(first.error)} at offset ${first.offset}`);
		}
		if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
			throw new Error("expected a JSON object at the top level");
		}
		return parsed as Record<string, unknown>;
	}

	return TOML.parse(content) as Record<string, unknown>;
}

/**
 * Parses a Wrangler config file (wrangler.toml, wrangler.json or wrangler.jsonc)
 */
export function parseConfig(configPath: string): Config {
	try {
		const content = readFileSync(configPath, "utf-8");
		const parsed = parseContent(configPath, content);

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
