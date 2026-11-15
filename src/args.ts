/**
 * Command line argument parser
 */

export interface ParsedArgs {
	command?: string;
	entryPoint?: string;
	name?: string;
	env?: string;
	compatibilityDate?: string;
	compatibilityFlags?: string[];
	minify?: boolean;
	noBundle?: boolean;
	dryRun?: boolean;
	verbose?: boolean;
	yolo?: boolean;
	config?: string;
	remainingArgs: string[];
}

/** Flags parseArgs reads a value for (so --flag=value can be split) */
const VALUE_FLAGS = new Set(["--name", "--env", "--compatibility-date", "--compatibility-flags", "--config"]);

/**
 * Other `wrangler deploy` flags that take a value. parseArgs doesn't need
 * them, but has to skip their values so `--var FOO:bar` isn't mistaken for
 * the entry point.
 */
const WRANGLER_VALUE_FLAGS = new Set([
	"--outdir", "--outfile", "--assets", "--site", "--site-include", "--site-exclude",
	"--var", "--define", "--alias", "--triggers", "--schedule", "--schedules",
	"--routes", "--route", "--domains", "--domain", "--jsx-factory", "--jsx-fragment",
	"--tsconfig", "--old-asset-ttl", "--dispatch-namespace", "--containers-rollout",
	"--tag", "--message", "--compatibility-flag", "--env-file", "--secrets-file", "--cwd",
]);

/** Flags that belong to wrongler and must never reach Wrangler */
const WRONGLER_ONLY_FLAGS = new Set(["--yolo", "--verbose", "-v"]);

/**
 * Turns the user's `wrongler deploy ... --yolo` argv into the argv for
 * `wrangler deploy` by dropping wrongler's own flags. Everything else
 * (--env, --config, --var, --keep-vars, --routes, ...) goes through untouched,
 * so Wrangler resolves config and environments exactly as it would without
 * YOLO mode. Each YOLO redeploy is just "your command, again".
 */
export function toWranglerDeployArgs(args: string[]): string[] {
	return args.filter((arg) => !WRONGLER_ONLY_FLAGS.has(arg));
}

/**
 * Parses command line arguments
 */
export function parseArgs(args: string[]): ParsedArgs {
	const parsed: ParsedArgs = {
		remainingArgs: [],
	};

	// Support --flag=value by splitting it into --flag value up front
	args = args.flatMap((arg) => {
		const eq = arg.indexOf("=");
		if (arg.startsWith("--") && eq > 2 && VALUE_FLAGS.has(arg.slice(0, eq))) {
			return [arg.slice(0, eq), arg.slice(eq + 1)];
		}
		return [arg];
	});

	let i = 0;
	while (i < args.length) {
		const arg = args[i];

		if (!arg.startsWith("-")) {
			// First non-flag argument is the command
			if (!parsed.command) {
				parsed.command = arg;
			} else if (!parsed.entryPoint && parsed.command === "deploy") {
				// Second non-flag argument for deploy command is the entry point
				parsed.entryPoint = arg;
			} else {
				parsed.remainingArgs.push(arg);
			}
			i++;
			continue;
		}

		switch (arg) {
			case "--yolo":
				parsed.yolo = true;
				break;

			case "--verbose":
			case "-v":
				parsed.verbose = true;
				break;

			case "--name":
				i++;
				if (i < args.length) {
					parsed.name = args[i];
				}
				break;

			case "--env":
			case "-e":
				i++;
				if (i < args.length) {
					parsed.env = args[i];
				}
				break;

			case "--compatibility-date":
				i++;
				if (i < args.length) {
					parsed.compatibilityDate = args[i];
				}
				break;

			case "--compatibility-flags":
				i++;
				if (i < args.length) {
					if (!parsed.compatibilityFlags) {
						parsed.compatibilityFlags = [];
					}
					parsed.compatibilityFlags.push(args[i]);
				}
				break;

			case "--minify":
				parsed.minify = true;
				break;

			case "--no-bundle":
				parsed.noBundle = true;
				break;

			case "--dry-run":
				parsed.dryRun = true;
				break;

			case "--config":
			case "-c":
				i++;
				if (i < args.length) {
					parsed.config = args[i];
				}
				break;

			default:
				// Other flag - add to remaining args, along with its value if it takes one
				parsed.remainingArgs.push(arg);
				if (WRANGLER_VALUE_FLAGS.has(arg) && i + 1 < args.length) {
					i++;
					parsed.remainingArgs.push(args[i]);
				}
				break;
		}

		i++;
	}

	return parsed;
}
