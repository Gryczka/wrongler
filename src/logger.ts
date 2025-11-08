/**
 * Simple logger utility for wrongler
 */

type LogLevel = "debug" | "log" | "info" | "warn" | "error";

class Logger {
	private _loggerLevel: LogLevel = "log";

	get loggerLevel(): LogLevel {
		return this._loggerLevel;
	}

	set loggerLevel(level: LogLevel) {
		this._loggerLevel = level;
	}

	private shouldLog(level: LogLevel): boolean {
		const levels: LogLevel[] = ["debug", "log", "info", "warn", "error"];
		const currentLevelIndex = levels.indexOf(this._loggerLevel);
		const messageLevelIndex = levels.indexOf(level);
		return messageLevelIndex >= currentLevelIndex;
	}

	debug(...args: unknown[]): void {
		if (this.shouldLog("debug")) {
			console.debug(...args);
		}
	}

	log(...args: unknown[]): void {
		if (this.shouldLog("log")) {
			console.log(...args);
		}
	}

	info(...args: unknown[]): void {
		if (this.shouldLog("info")) {
			console.info(...args);
		}
	}

	warn(...args: unknown[]): void {
		if (this.shouldLog("warn")) {
			console.warn(...args);
		}
	}

	error(...args: unknown[]): void {
		if (this.shouldLog("error")) {
			console.error(...args);
		}
	}
}

export const logger = new Logger();
