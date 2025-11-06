import path from "node:path";
import type { FSWatcher } from "chokidar";
import { watch } from "chokidar";
import { logger } from "../logger";
import { debounce } from "../utils/debounce";
import deploy from "./deploy";
import { YoloOutputFormatter } from "./output-formatter";
import type { Config } from "@cloudflare/workers-utils";
import type { AssetsOptions } from "../assets";
import type { Entry } from "../deployment-bundle/entry";
import type { LegacyAssetPaths } from "../sites";

type DeployParams = {
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
};

interface WatchOptions {
	verbose: boolean;
	debounceMs?: number;
}

/**
 * Starts YOLO mode - watches for file changes and automatically redeploys
 */
export async function startYoloMode(
	deployParams: DeployParams,
	options: WatchOptions
): Promise<void> {
	const formatter = new YoloOutputFormatter(options.verbose);
	const debounceMs = options.debounceMs ?? 50;

	// Determine which files to watch
	const watchPaths = getWatchPaths(deployParams);

	formatter.formatInitialDeploy();
	if (!options.verbose) {
		formatter.formatWatchInfo(watchPaths);
	}

	let watcher: FSWatcher | null = null;
	let isDeploying = false;
	let pendingDeploy = false;
	let abortController: AbortController | null = null;

	/**
	 * Performs a deployment
	 */
	const performDeploy = async (changedPath?: string) => {
		// If already deploying, mark that we need another deploy after this one
		if (isDeploying) {
			pendingDeploy = true;
			return;
		}

		isDeploying = true;
		pendingDeploy = false;

		const startTime = Date.now();

		try {
			// Create abort controller for this deployment
			abortController = new AbortController();

			formatter.formatDeployStart(
				changedPath
					? {
							path: path.relative(process.cwd(), changedPath),
							type: "change",
					  }
					: undefined
			);

			// Suppress normal deploy output in condensed mode
			const originalLogLevel = logger.loggerLevel;
			if (!options.verbose) {
				logger.loggerLevel = "error";
			}

			const result = await deploy(deployParams);

			if (!options.verbose) {
				logger.loggerLevel = originalLogLevel;
			}

			const duration = Date.now() - startTime;

			// Get the worker URL from targets if available
			const workerUrl = result.targets?.[0];

			formatter.formatDeploySuccess({
				success: true,
				versionId: result.versionId ?? undefined,
				workerUrl,
				targets: result.targets?.map((url) => ({ name: "worker", url })),
				duration,
			});
		} catch (error) {
			const duration = Date.now() - startTime;

			if (!options.verbose) {
				logger.loggerLevel = logger.loggerLevel;
			}

			formatter.formatDeployError(
				error instanceof Error ? error : new Error(String(error))
			);

			// Don't exit - stay in watch mode
		} finally {
			isDeploying = false;
			abortController = null;

			// If another change happened during deployment, trigger another deploy
			if (pendingDeploy) {
				void debouncedDeploy();
			}
		}
	};

	// Debounced deploy function
	const debouncedDeploy = debounce(() => {
		void performDeploy();
	}, debounceMs);

	// Set up file watcher
	watcher = watch(watchPaths, {
		ignored: [
			"**/node_modules/**",
			"**/.git/**",
			"**/.wrangler/**",
			"**/dist/**",
			"**/build/**",
			// Additional patterns to catch build artifacts
			(filePath: string) => {
				// Ignore any path containing .wrangler directory
				return filePath.includes("/.wrangler/") || filePath.includes("\\.wrangler\\");
			},
		],
		persistent: true,
		ignoreInitial: true,
		awaitWriteFinish: {
			stabilityThreshold: 100,
			pollInterval: 100,
		},
	});

	watcher.on("change", (filePath: string) => {
		// Double-check we're not processing .wrangler files
		if (filePath.includes(".wrangler")) {
			return;
		}

		// In verbose mode, don't show file changes during deployment
		// as it clutters the output
		if (!isDeploying || !options.verbose) {
			formatter.formatFileChange({
				path: path.relative(process.cwd(), filePath),
				type: "change",
			});
		}
		debouncedDeploy();
	});

	watcher.on("add", (filePath: string) => {
		// Double-check we're not processing .wrangler files
		if (filePath.includes(".wrangler")) {
			return;
		}

		formatter.formatFileChange({
			path: path.relative(process.cwd(), filePath),
			type: "add",
		});
		debouncedDeploy();
	});

	watcher.on("unlink", (filePath: string) => {
		// Double-check we're not processing .wrangler files
		if (filePath.includes(".wrangler")) {
			return;
		}

		formatter.formatFileChange({
			path: path.relative(process.cwd(), filePath),
			type: "unlink",
		});
		debouncedDeploy();
	});

	watcher.on("error", (error: Error) => {
		logger.error("File watcher error:", error);
	});

	// Handle graceful shutdown
	const cleanup = async () => {
		if (watcher) {
			await watcher.close();
			watcher = null;
		}
		formatter.formatExitMessage();
		process.exit(0);
	};

	process.on("SIGINT", () => {
		void cleanup();
	});

	process.on("SIGTERM", () => {
		void cleanup();
	});

	// Keep the process alive
	await new Promise(() => {
		// This promise never resolves - we stay in watch mode until interrupted
	});
}

/**
 * Determines which files/directories to watch based on deployment configuration
 */
function getWatchPaths(deployParams: DeployParams): string[] {
	const paths: string[] = [];

	// Watch the config file if it exists
	if (deployParams.config.configPath) {
		paths.push(deployParams.config.configPath);
	}

	// Watch the entry point file
	if (deployParams.entry.file) {
		paths.push(deployParams.entry.file);

		// Watch the directory containing the entry point to catch new files
		// that might be imported. The ignore patterns will filter out build artifacts.
		const entryDir = path.dirname(deployParams.entry.file);
		if (entryDir && entryDir !== ".") {
			paths.push(entryDir);
		}
	}

	// Watch assets directory if configured
	if (deployParams.assetsOptions?.directory) {
		const watchDir = deployParams.projectRoot || process.cwd();
		const assetsPath = path.resolve(
			watchDir,
			deployParams.assetsOptions.directory
		);
		paths.push(assetsPath);
	}

	// Watch Workers Sites bucket if configured
	if (deployParams.legacyAssetPaths) {
		const watchDir = deployParams.projectRoot || process.cwd();
		const sitePath = path.resolve(watchDir, deployParams.legacyAssetPaths.baseDirectory);
		paths.push(sitePath);
	}

	return paths;
}
