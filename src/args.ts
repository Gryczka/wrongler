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

/**
 * Parses command line arguments
 */
export function parseArgs(args: string[]): ParsedArgs {
	const parsed: ParsedArgs = {
		remainingArgs: [],
	};

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
				// Unknown flag - add to remaining args
				parsed.remainingArgs.push(arg);
				break;
		}

		i++;
	}

	return parsed;
}
