import path from "node:path";
import * as readline from "node:readline";
import type { FSWatcher } from "chokidar";
import { watch } from "chokidar";
import { logger } from "../logger";
import { debounce } from "../utils/debounce";
import deploy, { type DeployParams } from "./deploy";
import { YoloOutputFormatter, type DeploymentStats } from "./output-formatter";

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
	const stats: DeploymentStats = {
		successful: 0,
		failed: 0,
		totalTime: 0,
	};

	// Track if this is the first deployment
	let isFirstDeploy = true;

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
			formatter.formatDeployStart(
				changedPath
					? {
							path: path.relative(process.cwd(), changedPath),
							type: "change",
					  }
					: undefined
			);

			const result = await deploy(deployParams);

			const duration = Date.now() - startTime;

			// Get the worker URL from targets if available
			const workerUrl = result.targets?.[0];

			formatter.formatDeploySuccess({
				success: true,
				versionId: result.versionId ?? undefined,
				workerUrl,
				targets: result.targets?.map((url: string) => ({ name: "worker", url })),
				duration,
			});

			// Update stats
			stats.successful++;
			stats.totalTime += duration;
			stats.lastDeployTime = new Date();

			// Mark first deploy as complete
			if (isFirstDeploy) {
				isFirstDeploy = false;
			}
		} catch (error) {
			const duration = Date.now() - startTime;

			formatter.formatDeployError(
				error instanceof Error ? error : new Error(String(error))
			);

			// Update stats
			stats.failed++;
			stats.totalTime += duration;
			stats.lastDeployTime = new Date();

			// Don't exit - stay in watch mode
		} finally {
			isDeploying = false;

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

	// Function to setup keyboard shortcuts
	const setupKeyboardShortcuts = () => {
		if (process.stdin.isTTY) {
			readline.emitKeypressEvents(process.stdin);
			if (process.stdin.setRawMode) {
				process.stdin.setRawMode(true);
			}

			process.stdin.on("keypress", (_str, key) => {
				if (key.ctrl && key.name === "c") {
					// Let the SIGINT handler take care of cleanup
					process.kill(process.pid, "SIGINT");
					return;
				}

				switch (key.name) {
					case "r":
						console.log("\n⚡ Manual deployment triggered...\n");
						void performDeploy();
						break;

					case "c":
						console.clear();
						formatter.formatInitialDeploy();
						break;

					case "s":
						formatter.formatStats(stats);
						break;

					case "h":
					case "?":
						formatter.formatHelp();
						break;

					case "q":
						process.kill(process.pid, "SIGINT");
						break;
				}
			});
		}
	};

	// Perform initial deployment
	console.log("⚡ Running initial deployment...\n");
	await performDeploy();

	// Setup keyboard shortcuts AFTER initial deployment
	// This prevents stdin conflicts with wrangler's interactive prompts
	setupKeyboardShortcuts();

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

	watcher.on("error", (err: unknown) => {
		const error = err instanceof Error ? err : new Error(String(err));
		logger.error("File watcher error:", error);
	});

	// Handle graceful shutdown
	const cleanup = async () => {
		if (watcher) {
			await watcher.close();
			watcher = null;
		}
		formatter.formatExitMessage(stats);
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
