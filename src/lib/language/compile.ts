import { type Cell, createAir, createCell } from "./cell"
import { Contraption } from "./contraption"
import { createSpan, type Span } from "./span"
import type { Marble } from "./marble"

export interface CompilerContext {
	errors: { message: string; span: Span }[]
}

export type CompilationResult = CompilerContext & {
	contraption: Contraption
}

export function compile(source: string): CompilationResult {
	const ctx: CompilerContext = { errors: [] }
	const marbles: Marble[] = []
	const grid = source.split("\n").map((line, y) => {
		const chunks = [...(line.trimEnd().match(/.{1,2}/g) ?? [])]
		if (chunks === null) return [] as Cell[]
		return chunks.map((chunk, x) => {
			const span = createSpan(y + 1, x * 2 + 1, y + 1, x * 2 + 3)

			if (/^[0-9a-f]{2}$/i.test(chunk)) {
				marbles.push({
					value: parseInt(chunk, 16),
					x,
					y,
					movedThisTick: false,
					activatedThisTick: false
				})
				return createAir(x, y, span)
			}

			return createCell(chunk, x, y, span, ctx)
		})
	})
	const width = Math.max(...grid.map((row) => row.length))
	const height = grid.length
	for (let y = 0; y < height; y++) {
		const row = grid[y]
		while (row.length < width) {
			const x = row.length
			const span = createSpan(y + 1, x * 2 + 1, y + 1, x * 2 + 3)
			row.push(createAir(x, y, span))
		}
	}

	return {
		...ctx,
		contraption: new Contraption(width, height, grid, marbles)
	}
}
