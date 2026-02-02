/**
 * Client interface for OpenCode SDK interactions
 */

export interface OpenCodeClient {
    session: {
        messages: (params: { path: { id: string } }) => Promise<{
            data?: unknown
        }>
    }
}
