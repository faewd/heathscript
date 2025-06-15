import type { CompilerContext } from "./compile"
import type { Contraption } from "./contraption"
import type { Marble } from "./marble"
import type { Span } from "./span"

enum Direction {
	UP = "^",
	DOWN = "v",
	LEFT = "<",
	RIGHT = ">"
}

function move(x: number, y: number, dir: Direction) {
	switch (dir) {
		case Direction.UP:
			return [x, y - 1]
		case Direction.DOWN:
			return [x, y + 1]
		case Direction.LEFT:
			return [x - 1, y]
		case Direction.RIGHT:
			return [x + 1, y]
	}
}

function opposite(dir: Direction) {
	switch (dir) {
		case Direction.UP:
			return Direction.DOWN
		case Direction.DOWN:
			return Direction.UP
		case Direction.LEFT:
			return Direction.RIGHT
		case Direction.RIGHT:
			return Direction.LEFT
	}
}

export type Cell = BaseCell | DirectionalCell

type BaseCell = {
	kind: CellKind
	symbol: string
	x: number
	y: number
	span: Span
	activatedThisTick: boolean
}

type DirectionalCell = BaseCell & { direction: Direction }

export function createCell(symbol: string, x: number, y: number, span: Span, ctx: CompilerContext): Cell {
	const kind = cellKinds.get(symbol)
	if (kind === undefined) {
		ctx.errors.push({ span, message: `Unknown symbol ${symbol} at ${span.startLineNumber}:${span.startColumn}.` })
		return { kind: errorKind, symbol, x, y, span, activatedThisTick: false }
	}
	return createCellOfKind(kind, symbol, x, y, span)
}

function createCellOfKind(kind: CellKind, symbol: string, x: number, y: number, span: Span): Cell {
	const direction = kind.directional ? { direction: kind.getDirection(symbol) } : {}
	return { kind, symbol, x, y, span, activatedThisTick: false, ...direction }
}

export function createAir(x: number, y: number, span: Span) {
	return createCellOfKind(air, "··", x, y, span)
}

type CellKind = {
	name: string
	type: CellType
	symbols: string[]
	isSolid(cell: Cell, contraption: Contraption): boolean
	tick(cell: Cell, contraption: Contraption): void
	render?(cell: Cell, contraption: Contraption): string
} & (
	| {
			directional: false
			getDirection: undefined
	  }
	| {
			directional: true
			getDirection(symbol: string): Direction
	  }
)

const cellKinds = new Map<string, CellKind>()

export const cellTypes = ["error", "marble", "air", "wall", "operator", "conveyor", "affector", "teleporter"] as const
type CellType = (typeof cellTypes)[number]

function registerCellKind(
	name: string,
	type: CellType,
	symbol: string | string[],
	isSolid: boolean | CellKind["isSolid"],
	tick: CellKind["tick"],
	getDirection: CellKind["getDirection"] = undefined,
	render: CellKind["render"] = undefined
): CellKind {
	const symbols = Array.isArray(symbol) ? symbol : [symbol]
	const kind = {
		name,
		type,
		symbols,
		isSolid: typeof isSolid === "boolean" ? () => isSolid : isSolid,
		tick,
		getDirection,
		directional: getDirection !== undefined,
		render
	} as CellKind
	for (const symbol of symbols) {
		cellKinds.set(symbol, kind)
	}
	return kind
}

function registerAffector(
	name: string,
	symbol: string,
	effect: (marble: Marble, cell: Cell, contraption: Contraption) => boolean | void
): CellKind {
	return registerCellKind(name, "affector", symbol, false, (cell, contraption) => {
		const marble = contraption.getMarble(cell.x, cell.y)
		if (marble === null) return
		const activated = effect(marble, cell, contraption)
		marble.activatedThisTick = cell.activatedThisTick = activated !== false
	})
}

function registerDirectionalOperator(
	name: string,
	symbol: string,
	tick: (cell: DirectionalCell, contraption: Contraption) => void,
	render: CellKind["render"] = undefined
): CellKind {
	const symbols = getDirectionalSymbols(symbol)
	const dirMap = Object.fromEntries(symbols)
	return registerCellKind(
		name,
		"operator",
		symbols.map(([s, _]) => s),
		true,
		tick,
		(s) => dirMap[s],
		render
	)
}

function getDirectionalSymbols(s: string): [string, Direction][] {
	return Object.values(Direction).flatMap(
		(d) => [`${s}${d}`, `${d}${s}`].map((symbol) => [symbol, d]) as [string, Direction][]
	)
}

function registerBinaryOperator(name: string, symbol: string, operation: (a: number, b: number) => number): CellKind {
	return registerDirectionalOperator(name, symbol, (cell, contraption) => {
		const [xA, yA] = move(cell.x, cell.y, opposite(cell.direction))
		const marbleA = contraption.getMarble(xA, yA)
		if (marbleA === null) return
		const [xB, yB] = move(cell.x, cell.y, cell.direction)
		const marbleB = contraption.getMarble(xB, yB)
		if (marbleB === null) return
		marbleB.value = operation(marbleA.value, marbleB.value)
		cell.activatedThisTick = true
		marbleB.activatedThisTick = true
	})
}

const NOOP = () => {}

const errorKind = registerCellKind("Error", "error", "!!", true, NOOP)
const air = registerCellKind("Air", "air", ["  ", "..", "··"], false, NOOP, undefined, () => "··")
registerCellKind("Wall", "wall", "##", true, NOOP)

registerAffector("Increment", "++", (m) => {
	m.value += 1
})
registerAffector("Decrement", "--", (m) => {
	m.value -= 1
})

registerAffector("Output", "oo", (m, _, c) => c.printLine(String(m.value)))
registerAffector("Delete", "xx", (m, _, c) => c.remove(m))

registerBinaryOperator("Add", "+", (a, b) => a + b)
registerBinaryOperator("Subtract", "-", (a, b) => b - a)
registerBinaryOperator("Multiply", "*", (a, b) => a * b)
registerBinaryOperator("Divide", "/", (a, b) => Math.floor(b / a))
registerBinaryOperator("Modulo", "%", (a, b) => b % a)

registerDirectionalOperator("Clone", ":", (cell, contraption) => {
	const [sourceX, sourceY] = move(cell.x, cell.y, opposite(cell.direction))
	const marble = contraption.getMarble(sourceX, sourceY)
	if (marble === null) return
	const [targetX, targetY] = move(cell.x, cell.y, cell.direction)
	const target = contraption.getCell(targetX, targetY)
	if (target === null || target.kind.isSolid(target, contraption)) return
	contraption.spawn(marble.value, targetX, targetY)
	marble.activatedThisTick = true
	cell.activatedThisTick = true
})

registerDirectionalOperator("Observer Gate", "#", (cell, contraption) => {
	const [sourceX, sourceY] = move(cell.x, cell.y, opposite(cell.direction))
	const sourceMarble = contraption.getMarble(sourceX, sourceY)
	if (sourceMarble !== null) return;
	const [targetX, targetY] = move(cell.x, cell.y, cell.direction)
	const targetMarble = contraption.getMarble(targetX, targetY)
	if (targetMarble === null) return;
	targetMarble.movedThisTick = true
})

registerDirectionalOperator("Counter Gate", "~", (cell, contraption) => {
	const [sourceX, sourceY] = move(cell.x, cell.y, opposite(cell.direction))
	const sourceMarble = contraption.getMarble(sourceX, sourceY)
	const [targetX, targetY] = move(cell.x, cell.y, cell.direction)
	const targetMarble = contraption.getMarble(targetX, targetY)
	if (targetMarble) {
		if (!sourceMarble) targetMarble.movedThisTick = true
		else {
			sourceMarble.value -= 1
			sourceMarble.activatedThisTick = true;
		}
	} 
})

registerCellKind(
	"Sieve",
	"wall",
	'""',
	(cell, contraption) => {
		const marble = contraption.getMarble(cell.x, cell.y - 1)
		return marble === null || marble.value !== 0
	},
	NOOP
)

for (const dir of Object.values(Direction)) {
	registerCellKind(
		"Conveyor",
		"conveyor",
		dir.repeat(2),
		false,
		(cell: DirectionalCell, contraption) => {
			const marble = contraption.getMarble(cell.x, cell.y)
			if (marble === null) return
			const [x, y] = move(cell.x, cell.y, cell.direction)
			contraption.move(marble, x, y)
			cell.activatedThisTick = true
		},
		() => dir
	)
}

const base36Digits = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
for (const char of base36Digits) {
	const label = char + ":"

	registerCellKind("Label", "teleporter", label, false, NOOP)

	registerCellKind("Teleporter", "teleporter", "@" + char, false, (cell, contraption) => {
		const marble = contraption.getMarble(cell.x, cell.y)
		if (marble === null) return
		const target = contraption.getCellArray().find(c => c.symbol === label)
		if (target === undefined) return
		contraption.move(marble, target.x, target.y)
	})
}
