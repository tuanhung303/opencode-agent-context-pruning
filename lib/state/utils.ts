import type { OpenCodeClient } from "../client"

export async function isSubAgentSession(
    client: OpenCodeClient,
    sessionID: string,
): Promise<boolean> {
    try {
        const result = await client.session.get({ path: { id: sessionID } })
        return !!result.data?.parentID
    } catch {
        return false
    }
}
