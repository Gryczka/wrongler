/**
 * Debounce utility - delays execution of a function until after a specified time has passed
 * since the last invocation
 */

export function debounce<T extends (...args: unknown[]) => unknown>(
	func: T,
	waitMs: number
): (...args: Parameters<T>) => void {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;

	return function (this: unknown, ...args: Parameters<T>) {
		if (timeoutId !== null) {
			clearTimeout(timeoutId);
		}

		timeoutId = setTimeout(() => {
			func.apply(this, args);
		}, waitMs);
	};
}
