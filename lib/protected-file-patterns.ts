function normalizePath(input: string): string {
    return input.replaceAll("\\\\", "/")
}

function escapeRegExpChar(ch: string): string {
    return /[\\.^$+{}()|\[\]]/.test(ch) ? `\\${ch}` : ch
}

/**
 * Basic glob matching with support for `**`, `*`, and `?`.
 *
 * Notes:
 * - Matching is performed against the full (normalized) string.
 * - `*` and `?` do not match `/`.
 * - `**` matches across `/`.
 */
export function matchesGlob(inputPath: string, pattern: string): boolean {
    if (!pattern) return false

    const input = normalizePath(inputPath)
    const pat = normalizePath(pattern)

    let regex = "^"

    for (let i = 0; i < pat.length; i++) {
        const ch = pat[i]

        if (ch === "*") {
            const next = pat[i + 1]
            if (next === "*") {
                const after = pat[i + 2]
                if (after === "/") {
                    // **/  (zero or more directories)
                    regex += "(?:.*/)?"
                    i += 2
                    continue
                }

                // **
                regex += ".*"
                i++
                continue
            }

            // *
            regex += "[^/]*"
            continue
        }

        if (ch === "?") {
            regex += "[^/]"
            continue
        }

        if (ch === "/") {
            regex += "/"
            continue
        }

        regex += escapeRegExpChar(ch ?? "")
    }

    regex += "$"

    return new RegExp(regex).test(input)
}

export function getFilePathFromParameters(parameters: unknown): string | undefined {
    if (typeof parameters !== "object" || parameters === null) {
        return undefined
    }

    const filePath = (parameters as Record<string, unknown>).filePath
    return typeof filePath === "string" && filePath.length > 0 ? filePath : undefined
}

export function isProtectedFilePath(filePath: string | undefined, patterns: string[]): boolean {
    if (!filePath) return false
    if (!patterns || patterns.length === 0) return false

    return patterns.some((pattern) => matchesGlob(filePath, pattern))
}
