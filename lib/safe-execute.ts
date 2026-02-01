import type { Logger } from "./logger"

/**
 * Safely execute a function with error boundary.
 * If the function throws, logs the error and returns without crashing.
 *
 * @param fn - The function to execute
 * @param logger - Logger instance for error reporting
 * @param context - Description of what's being executed (for error messages)
 */
export function safeExecute(fn: () => void, logger: Logger, context: string): void {
    try {
        fn()
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const stack = error instanceof Error ? error.stack : undefined
        logger.warn(`Strategy error in ${context}: ${message}`, { stack })
    }
}

/**
 * Safely execute an async function with error boundary.
 * If the function throws, logs the error and returns without crashing.
 *
 * @param fn - The async function to execute
 * @param logger - Logger instance for error reporting
 * @param context - Description of what's being executed (for error messages)
 */
export async function safeExecuteAsync<T>(
    fn: () => Promise<T>,
    logger: Logger,
    context: string,
): Promise<T | undefined> {
    try {
        return await fn()
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const stack = error instanceof Error ? error.stack : undefined
        logger.warn(`Strategy error in ${context}: ${message}`, { stack })
        return undefined
    }
}
