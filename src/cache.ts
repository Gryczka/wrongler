/**
 * Cache management for wrongler settings
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";

interface CacheData {
	accountId?: string;
	[key: string]: unknown;
}

/**
 * Gets the path to wrongler's cache directory
 */
function getCacheDir(): string {
	const homeDir = os.homedir();
	return path.join(homeDir, ".wrongler");
}

/**
 * Gets the path to wrongler's cache file
 */
function getCachePath(): string {
	return path.join(getCacheDir(), "cache.json");
}

/**
 * Ensures the cache directory exists
 */
function ensureCacheDir(): void {
	const cacheDir = getCacheDir();
	if (!existsSync(cacheDir)) {
		mkdirSync(cacheDir, { recursive: true });
	}
}

/**
 * Reads the cache file
 */
function readCache(): CacheData {
	const cachePath = getCachePath();
	if (!existsSync(cachePath)) {
		return {};
	}

	try {
		const content = readFileSync(cachePath, "utf-8");
		return JSON.parse(content) as CacheData;
	} catch {
		return {};
	}
}

/**
 * Writes to the cache file
 */
function writeCache(data: CacheData): void {
	ensureCacheDir();
	const cachePath = getCachePath();
	writeFileSync(cachePath, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Gets the cached account ID
 */
export function getCachedAccountId(): string | undefined {
	const cache = readCache();
	return cache.accountId;
}

/**
 * Sets the cached account ID
 */
export function setCachedAccountId(accountId: string): void {
	const cache = readCache();
	cache.accountId = accountId;
	writeCache(cache);
}

/**
 * Clears the cache
 */
export function clearCache(): void {
	writeCache({});
}
