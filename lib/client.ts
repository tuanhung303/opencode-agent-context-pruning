/**
 * Client interface for OpenCode SDK interactions
 *
 * This interface represents the subset of the OpenCode SDK client that this
 * plugin uses. It's intentionally minimal to avoid tight coupling to SDK internals.
 */

export interface OpenCodeClient {
    session: {
        /**
         * Fetch messages for a session
         */
        messages: (params: { path: { id: string } }) => Promise<{
            data?: unknown
        }>

        /**
         * Get session metadata
         */
        get: (params: { path: { id: string } }) => Promise<{
            data?: unknown
        }>

        /**
         * Send a prompt to the session
         */
        prompt: (params: { path: { id: string }; prompt: string }) => Promise<{
            data?: unknown
        }>
    }
}
