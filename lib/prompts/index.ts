// Tool specs
import { DISCARD_TOOL_SPEC } from "./discard-tool-spec"
import { DISCARD_MSG_SPEC } from "./discard-msg-spec"
import { DISTILL_TOOL_SPEC } from "./distill-tool-spec"
import { DISTILL_MSG_SPEC } from "./distill-msg-spec"
import { RESTORE_TOOL_SPEC } from "./restore-tool-spec"
import { RESTORE_MSG_SPEC } from "./restore-msg-spec"

// System prompts
import { SYSTEM_PROMPT_BOTH } from "./system/both"
import { SYSTEM_PROMPT_DISCARD } from "./system/discard"
import { SYSTEM_PROMPT_DISTILL } from "./system/distill"

const PROMPTS: Record<string, string> = {
    "discard-tool-spec": DISCARD_TOOL_SPEC,
    "discard-msg-spec": DISCARD_MSG_SPEC,
    "distill-tool-spec": DISTILL_TOOL_SPEC,
    "distill-msg-spec": DISTILL_MSG_SPEC,
    "restore-tool-spec": RESTORE_TOOL_SPEC,
    "restore-msg-spec": RESTORE_MSG_SPEC,
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
