#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

// Parse command line arguments
const args = process.argv.slice(2);

// Check if wrangler is installed
function checkWranglerInstalled(): boolean {
	try {
		// Try to resolve wrangler
		require.resolve('wrangler');
		return true;
	} catch {
		return false;
	}
}

// Main CLI logic
async function main() {
	// Check if wrangler is installed
	if (!checkWranglerInstalled()) {
		console.error('Error: wrangler is not installed.');
		console.error('');
		console.error('Wrongler requires wrangler to be installed as a peer dependency.');
		console.error('Install it with: npm install wrangler');
		console.error('');
		process.exit(1);
	}

	// Check if this is a deploy command with --yolo flag
	const isDeployCommand = args.includes('deploy');
	const hasYoloFlag = args.includes('--yolo');

	if (isDeployCommand && hasYoloFlag) {
		// Handle YOLO mode
		console.log('🎯 YOLO Mode detected! Starting watch mode...');
		console.log('');
		console.log('Note: YOLO mode implementation coming soon!');
		console.log('For now, wrongler passes through to wrangler.');
		console.log('');
		console.log('To use YOLO mode today, install from the fork:');
		console.log('npm install Gryczka/workers-sdk-wrangler-yolo#feat/yolo-mode');
		console.log('');

		// For now, remove --yolo and pass through to wrangler
		const filteredArgs = args.filter(arg => arg !== '--yolo');
		passThroughWrangler(filteredArgs);
	} else {
		// Pass through all other commands to wrangler
		passThroughWrangler(args);
	}
}

// Pass command through to wrangler
function passThroughWrangler(args: string[]) {
	// Find wrangler binary
	const wranglerPath = require.resolve('wrangler/bin/wrangler.js');

	// Spawn wrangler process
	const wrangler = spawn('node', [wranglerPath, ...args], {
		stdio: 'inherit',
		shell: false,
	});

	wrangler.on('error', (error) => {
		console.error('Error spawning wrangler:', error);
		process.exit(1);
	});

	wrangler.on('exit', (code) => {
		process.exit(code || 0);
	});
}

// Run main
main().catch((error) => {
	console.error('Fatal error:', error);
	process.exit(1);
});
