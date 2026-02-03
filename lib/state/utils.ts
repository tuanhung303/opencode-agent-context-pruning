import type { OpenCodeClient } from "../client"

interface SessionData {
    parentID?: string
}

export async function isSubAgentSession(
    client: OpenCodeClient,
    sessionID: string,
): Promise<boolean> {
    try {
        const result = await client.session.get({ path: { id: sessionID } })
        const data = result.data as SessionData | undefined
        return !!data?.parentID
    } catch {
        return false
    }
}
