// Tool specs
import { DISCARD_TOOL_SPEC } from "./discard-tool-spec"
import { DISTILL_TOOL_SPEC } from "./distill-tool-spec"
import { RESTORE_TOOL_SPEC } from "./restore-tool-spec"

// System prompts
import { SYSTEM_PROMPT_BOTH } from "./system/both"
import { SYSTEM_PROMPT_DISCARD } from "./system/discard"
import { SYSTEM_PROMPT_DISTILL } from "./system/distill"

const PROMPTS: Record<string, string> = {
    "discard-tool-spec": DISCARD_TOOL_SPEC,
    "distill-tool-spec": DISTILL_TOOL_SPEC,
    "restore-tool-spec": RESTORE_TOOL_SPEC,
    "system/system-prompt-both": SYSTEM_PROMPT_BOTH,
    "system/system-prompt-discard": SYSTEM_PROMPT_DISCARD,
    "system/system-prompt-distill": SYSTEM_PROMPT_DISTILL,
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
