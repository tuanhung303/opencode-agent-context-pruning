// Tool specs
import CONTEXT_SPEC from "./context-spec"

// System prompts
import { SYSTEM_PROMPT_CONTEXT } from "./system/context"

const PROMPTS: Record<string, string> = {
    "context-spec": CONTEXT_SPEC,
    "system/system-prompt-context": SYSTEM_PROMPT_CONTEXT,
}

export function loadPrompt(name: string, vars?: Record<string, string>): string {
    let content = PROMPTS[name]
    if (!content) {
        throw new Error(`Prompt not found: ${name}`)
    }
    if (vars) {
        for (const [key, value] of Object.entries(vars)) {
            content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value)
        }
    }
    return content
}
