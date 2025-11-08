import chalk from "chalk";

export interface DeployResult {
	success: boolean;
	versionId?: string;
	workerUrl?: string;
	targets?: Array<{ name: string; url?: string }>;
	error?: Error;
	duration: number;
}

export interface FileChange {
	path: string;
	type: "change" | "add" | "unlink";
}

export interface DeploymentStats {
	successful: number;
	failed: number;
	totalTime: number;
	lastDeployTime?: Date;
}

export class YoloOutputFormatter {
	private deploymentCount = 0;
	private verbose: boolean;

	constructor(verbose = false) {
		this.verbose = verbose;
	}

	formatInitialDeploy(): void {
		console.log(chalk.cyan("\n🚀 YOLO Mode activated - watching for changes..."));
		console.log(chalk.dim("   Press 'h' for help, 'q' to quit\n"));
	}

	formatFileChange(change: FileChange): void {
		const icon = change.type === "add" ? "+" : change.type === "unlink" ? "-" : "~";
		const color = change.type === "add" ? chalk.green : change.type === "unlink" ? chalk.red : chalk.yellow;
		console.log(color(`${icon} ${change.path}`));
	}

	formatDeployStart(change?: FileChange): void {
		this.deploymentCount++;
		const timestamp = new Date().toLocaleTimeString();

		if (!this.verbose) {
			if (change) {
				this.formatFileChange(change);
			}
			console.log(chalk.gray(`[${timestamp}] Deployment #${this.deploymentCount} starting...`));
		}
	}

	formatDeploySuccess(result: DeployResult): void {
		const timestamp = new Date().toLocaleTimeString();

		if (this.verbose) {
			// In verbose mode, the full deploy output is already shown
			// Just add a success marker with version ID
			console.log(
				chalk.green(`\n✓ Deployment #${this.deploymentCount} completed successfully in ${result.duration}ms`)
			);
			if (result.versionId) {
				console.log(chalk.dim(`  Version: ${result.versionId}`));
			}
		} else {
			// Condensed output with both URLs
			const mainUrl = result.workerUrl || result.targets?.[0]?.url || "N/A";

			console.log(
				chalk.green(`[${timestamp}] ✓ Deployment #${this.deploymentCount}`) +
				chalk.gray(` (${result.duration}ms)`)
			);

			// Show main worker URL
			console.log(chalk.dim(`  └─ Worker: ${mainUrl}`));

			// Show version-specific preview URL if versionId is available
			if (result.versionId) {
				// Extract worker name from URL to construct version URL
				const versionUrl = this.constructVersionUrl(mainUrl, result.versionId);
				if (versionUrl) {
					console.log(chalk.dim(`  └─ Preview: ${versionUrl}`));
				}
				console.log(chalk.dim(`  └─ Version: ${result.versionId}`));
			}
		}
		console.log(); // Empty line for readability
	}

	/**
	 * Constructs a version-specific preview URL from the main worker URL and version ID
	 */
	private constructVersionUrl(mainUrl: string, versionId: string): string | null {
		try {
			const url = new URL(mainUrl);
			const hostname = url.hostname;

			// Format: worker-name.account.workers.dev -> shortId-worker-name.account.workers.dev
			const parts = hostname.split('.');
			if (parts.length >= 3 && parts[parts.length - 2] === 'workers') {
				// Get first segment of version ID (before first dash)
				const shortId = versionId.split('-')[0];
				const workerName = parts[0];
				const accountOrDomain = parts.slice(1).join('.');
				return `https://${shortId}-${workerName}.${accountOrDomain}${url.pathname}`;
			}

			return null;
		} catch {
			return null;
		}
	}

	formatDeployError(error: Error): void {
		const timestamp = new Date().toLocaleTimeString();

		if (this.verbose) {
			console.log(chalk.red(`\n✗ Deployment #${this.deploymentCount} failed:`));
			console.error(error);
		} else {
			// Error details are already printed by deploy function
			// Just show a simple failure message
			console.log(
				chalk.red(`[${timestamp}] ✗ Deployment #${this.deploymentCount} failed`)
			);
		}
		console.log(); // Empty line for readability
	}

	formatWatchInfo(watchPaths: string[]): void {
		console.log(chalk.gray("Watching:"));
		for (const path of watchPaths) {
			console.log(chalk.gray(`  - ${path}`));
		}
		console.log();
	}

	formatExitMessage(stats?: DeploymentStats): void {
		console.log(chalk.cyan(`\n👋 YOLO Mode stopped after ${this.deploymentCount} deployments`));
		if (stats && (stats.successful > 0 || stats.failed > 0)) {
			this.formatStats(stats);
		}
		console.log();
	}

	formatStats(stats: DeploymentStats): void {
		const total = stats.successful + stats.failed;
		const successRate = total > 0 ? ((stats.successful / total) * 100).toFixed(1) : "0.0";
		const avgTime = total > 0 ? (stats.totalTime / total / 1000).toFixed(1) : "0.0";

		console.log(chalk.cyan("\n📊 Session Statistics:"));
		console.log(chalk.green(`   ✓ ${stats.successful} successful`) + chalk.red(`   ✗ ${stats.failed} failed`));
		console.log(chalk.gray(`   📈 Success rate: ${successRate}%`));
		console.log(chalk.gray(`   ⚡ Average time: ${avgTime}s`));

		if (stats.lastDeployTime) {
			const minutesAgo = Math.floor((Date.now() - stats.lastDeployTime.getTime()) / 1000 / 60);
			const timeStr = minutesAgo === 0 ? "just now" : minutesAgo === 1 ? "1 minute ago" : `${minutesAgo} minutes ago`;
			console.log(chalk.gray(`   🕐 Last deploy: ${timeStr}`));
		}
		console.log();
	}

	formatHelp(): void {
		console.log(chalk.cyan("\n⌨️  Keyboard Shortcuts:"));
		console.log(chalk.gray("   r       - Manual redeploy"));
		console.log(chalk.gray("   c       - Clear screen"));
		console.log(chalk.gray("   s       - Show statistics"));
		console.log(chalk.gray("   h or ?  - Show this help"));
		console.log(chalk.gray("   q       - Quit YOLO mode"));
		console.log(chalk.gray("   Ctrl+C  - Quit YOLO mode"));
		console.log();
	}
}
