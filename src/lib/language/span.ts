export interface Span {
	startLineNumber: number
	startColumn: number
	endLineNumber: number
	endColumn: number
}

export function createSpan(
	startLineNumber: number,
	startColumn: number,
	endLineNumber: number,
	endColumn: number
): Span {
	return { startLineNumber, startColumn, endLineNumber, endColumn }
}
