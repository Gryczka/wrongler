/**
 * Account selection and management
 */

import { spawn } from "node:child_process";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export interface Account {
	name: string;
	id: string;
}

/**
 * Parses wrangler whoami output to extract accounts
 */
function parseWhoamiOutput(output: string): Account[] {
	const accounts: Account[] = [];
	const lines = output.split("\n");

	for (const line of lines) {
		// Parse table format: │ Account Name │ Account ID │
		// Skip header, separator, and border lines
		if (line.includes("│") && !line.includes("Account Name") && !line.includes("─")) {
			// Extract content between │ separators
			const parts = line.split("│").map(part => part.trim()).filter(part => part);

			// Should have exactly 2 parts: name and id
			if (parts.length === 2) {
				const name = parts[0];
				const id = parts[1];

				// Validate ID format (should be 32 hex characters)
				if (/^[0-9a-f]{32}$/i.test(id)) {
					accounts.push({ name, id });
				}
			}
		}

		// Also support old format: `name`: `id` (for backwards compatibility)
		if (line.includes("`")) {
			const match = line.match(/`([^`]+)`:\s*`([^`]+)`/);
			if (match) {
				accounts.push({
					name: match[1],
					id: match[2],
				});
			}
		}
	}

	return accounts;
}

/**
 * Checks if the user is logged in to Cloudflare
 */
export async function isLoggedIn(): Promise<boolean> {
	return new Promise((resolve) => {
		let wranglerPath: string;
		try {
			wranglerPath = require.resolve("wrangler/bin/wrangler.js");
		} catch {
			resolve(false);
			return;
		}

		// Run wrangler whoami to check login status
		const wrangler = spawn("node", [wranglerPath, "whoami"], {
			stdio: "pipe",
			shell: false,
		});

		let stdout = "";
		let stderr = "";

		if (wrangler.stdout && wrangler.stderr) {
			wrangler.stdout.on("data", (data) => {
				stdout += data.toString();
			});

			wrangler.stderr.on("data", (data) => {
				stderr += data.toString();
			});
		}

		wrangler.on("error", () => {
			resolve(false);
		});

		wrangler.on("exit", (code) => {
			const combinedOutput = stdout + stderr;

			// Check if output indicates user is not logged in
			const notLoggedIn = combinedOutput.includes("Not logged in") ||
								combinedOutput.includes("not logged in") ||
								combinedOutput.includes("login required");

			// User is logged in if command succeeded and doesn't say "not logged in"
			resolve(code === 0 && !notLoggedIn);
		});
	});
}

/**
 * Lists available Cloudflare accounts
 */
export async function listAccounts(): Promise<Account[]> {
	return new Promise((resolve, reject) => {
		let wranglerPath: string;
		try {
			wranglerPath = require.resolve("wrangler/bin/wrangler.js");
		} catch {
			reject(new Error("wrangler is not installed"));
			return;
		}

		// Run wrangler whoami to get account list
		const wrangler = spawn("node", [wranglerPath, "whoami"], {
			stdio: "pipe",
			shell: false,
		});

		let stdout = "";
		let stderr = "";

		if (wrangler.stdout && wrangler.stderr) {
			wrangler.stdout.on("data", (data) => {
				stdout += data.toString();
			});

			wrangler.stderr.on("data", (data) => {
				stderr += data.toString();
			});
		}

		wrangler.on("error", (error) => {
			reject(error);
		});

		wrangler.on("exit", (code) => {
			const combinedOutput = stdout + stderr;

			// Parse accounts from output (works regardless of exit code)
			const accounts = parseWhoamiOutput(combinedOutput);

			if (accounts.length > 0) {
				resolve(accounts);
				return;
			}

			// If no accounts found and command failed, check if it's a login issue
			if (code !== 0) {
				const notLoggedIn = combinedOutput.includes("Not logged in") ||
									combinedOutput.includes("not logged in") ||
									combinedOutput.includes("login required");

				if (notLoggedIn) {
					// Return a specific error for not being logged in
					reject(new Error("NOT_LOGGED_IN"));
				} else {
					// Other error
					reject(new Error("Failed to list accounts. Please check your Cloudflare credentials."));
				}
				return;
			}

			// Command succeeded but no accounts found
			resolve([]);
		});
	});
}

/**
 * Runs wrangler login to authenticate the user
 */
export async function runLogin(): Promise<boolean> {
	return new Promise((resolve, reject) => {
		let wranglerPath: string;
		try {
			wranglerPath = require.resolve("wrangler/bin/wrangler.js");
		} catch {
			reject(new Error("wrangler is not installed"));
			return;
		}

		console.log("\n🔑 Opening browser for Cloudflare authentication...\n");

		// Run wrangler login with inherited stdio so user can interact
		const wrangler = spawn("node", [wranglerPath, "login"], {
			stdio: "inherit",
			shell: false,
		});

		wrangler.on("error", (error) => {
			reject(error);
		});

		wrangler.on("exit", (code) => {
			if (code === 0) {
				console.log("\n✓ Login successful!\n");
				resolve(true);
			} else {
				resolve(false);
			}
		});
	});
}

/**
 * Ensures user is logged in, prompting for login if necessary
 */
export async function ensureLoggedIn(): Promise<boolean> {
	const loggedIn = await isLoggedIn();

	if (loggedIn) {
		return true;
	}

	// User is not logged in - prompt them
	console.log("\n⚠️  You are not logged in to Cloudflare.\n");

	const rl = readline.createInterface({ input, output });
	const answer = await rl.question("Would you like to login now? (y/n): ");
	rl.close();

	const shouldLogin = answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes";

	if (!shouldLogin) {
		console.log("\nLogin cancelled. Please login with: wrangler login\n");
		return false;
	}

	// Run login
	const loginSuccess = await runLogin();

	if (!loginSuccess) {
		console.log("\n❌ Login failed. Please try again with: wrangler login\n");
		return false;
	}

	// Verify login was successful
	const nowLoggedIn = await isLoggedIn();
	return nowLoggedIn;
}

/**
 * Fetches accounts and handles login if necessary
 */
export async function getAccountsWithLogin(): Promise<Account[]> {
	try {
		// Try to fetch accounts
		return await listAccounts();
	} catch (error) {
		// Check if it's a login error
		if (error instanceof Error && error.message === "NOT_LOGGED_IN") {
			// Prompt user to login
			const loginSuccess = await ensureLoggedIn();

			if (!loginSuccess) {
				throw new Error("Login required. Please run: wrangler login");
			}

			// Try fetching accounts again after login
			return await listAccounts();
		}

		// Re-throw other errors
		throw error;
	}
}

/**
 * Prompts user to select an account from a list
 */
export async function selectAccount(accounts: Account[]): Promise<string> {
	if (accounts.length === 0) {
		throw new Error("No accounts available");
	}

	if (accounts.length === 1) {
		// Only one account, use it automatically
		console.log(`\n✓ Using account: ${accounts[0].name} (${accounts[0].id})\n`);
		return accounts[0].id;
	}

	// Multiple accounts - prompt user to select
	console.log("\n📋 Multiple Cloudflare accounts available:");
	accounts.forEach((account, index) => {
		console.log(`  ${index + 1}. ${account.name} (${account.id})`);
	});

	const rl = readline.createInterface({ input, output });

	while (true) {
		const answer = await rl.question("\nSelect an account (enter number): ");
		const selection = parseInt(answer.trim(), 10);

		if (selection >= 1 && selection <= accounts.length) {
			const selectedAccount = accounts[selection - 1];
			rl.close();
			console.log(`\n✓ Selected: ${selectedAccount.name}\n`);
			return selectedAccount.id;
		}

		console.log(`Invalid selection. Please enter a number between 1 and ${accounts.length}.`);
	}
}
