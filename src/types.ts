/**
 * Type definitions for wrongler
 * These are simplified versions of wrangler's internal types
 */

export interface Config {
	name?: string;
	main?: string;
	account_id?: string;
	configPath?: string;
	rules?: Array<{
		type: string;
		globs: string[];
		fallthrough?: boolean;
	}>;
	compatibility_date?: string;
	compatibility_flags?: string[];
	vars?: Record<string, string>;
	define?: Record<string, string>;
	[key: string]: unknown;
}

export interface Entry {
	file: string;
	directory?: string;
	format?: "modules" | "service-worker";
	moduleRoot?: string;
}

export interface AssetsOptions {
	directory: string;
	binding?: string;
	[key: string]: unknown;
}

export interface LegacyAssetPaths {
	baseDirectory: string;
	assetDirectory?: string;
	includePatterns?: string[];
	excludePatterns?: string[];
}

export interface DeploymentResult {
	versionId?: string;
	targets?: string[];
	workerName?: string;
	[key: string]: unknown;
}
