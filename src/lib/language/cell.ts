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

function getSymbols(s: string): [string, Direction][] {
	return Object.values(Direction).flatMap(
		(d) => [`${s}${d}`, `${d}${s}`].map((symbol) => [symbol, d]) as [string, Direction][]
	)
}

export abstract class Cell {
	constructor(
		public readonly type: string,
		public readonly x: number,
		public readonly y: number,
		public readonly span: Span,
		protected activatedThisTick = false
	) {}

	public abstract render(): string
	public abstract tick(contraption: Contraption): void
	public abstract isSolid(contraption: Contraption): boolean

	public reset() {
		this.activatedThisTick = false
	}

	public activated() {
		return this.activatedThisTick
	}

	public static from(symbol: string, x: number, y: number, span: Span, ctx: CompilerContext): Cell {
		switch (symbol) {
			case "  ":
			case "..":
				return new Air(x, y, span)
			case "##":
				return new Wall(x, y, span)
			case "oo":
				return new Output(x, y, span)
			case "++":
				return new Increment(x, y, span)
			case "--":
				return new Decrement(x, y, span)
			case "xx":
				return new Delete(x, y, span)
			case '""':
				return new Sieve(x, y, span)
		}

		const first = symbol.charAt(0)
		if ((Object.values(Direction) as string[]).includes(first) && first === symbol.charAt(1)) {
			const dir = first as Direction
			return new Conveyor(x, y, span, dir)
		}

		const adder = getSymbols("+").find(([s, _]) => symbol === s)
		if (adder) return new Adder(x, y, span, adder[1])

		const cloner = getSymbols(":").find(([s, _]) => symbol === s)
		if (cloner) return new Cloner(x, y, span, cloner[1])

		ctx.errors.push({
			message: `Unknown symbol ${symbol} at ${span.startLineNumber}:${span.startColumn}`,
			span
		})
		return new ErrorCell(x, y, span)
	}
}

abstract class PassableCell extends Cell {
	public isSolid(): boolean {
		return false
	}
}

export class Air extends PassableCell {
	constructor(x: number, y: number, span: Span) {
		super("air", x, y, span)
	}

	public render(): string {
		return "··"
	}

	public tick(ignored: Contraption): void {}
}

class Conveyor extends PassableCell {
	constructor(
		x: number,
		y: number,
		span: Span,
		private readonly direction: Direction
	) {
		super("conveyor", x, y, span)
	}

	public render(): string {
		return this.direction.repeat(2)
	}

	public tick(contraption: Contraption): void {
		const marble = contraption.getMarble(this.x, this.y)
		if (marble === null) return
		const [x, y] = move(this.x, this.y, this.direction)
		contraption.move(marble, x, y)
		this.activatedThisTick = true
	}
}

abstract class PassableAffector extends PassableCell {
	constructor(x: number, y: number, span: Span) {
		super("affector", x, y, span)
	}

	public tick(contraption: Contraption): void {
		const marble = contraption.getMarble(this.x, this.y)
		if (marble === null) return
		this.activatedThisTick = marble.activatedThisTick = this.affect(marble, contraption)
	}

	protected abstract affect(marble: Marble, contraption: Contraption): boolean
}

class Output extends PassableAffector {
	public render(): string {
		return "oo"
	}

	public affect(marble: Marble, contraption: Contraption) {
		contraption.printLine(String(marble.value))
		return true
	}
}

class Increment extends PassableAffector {
	public render(): string {
		return "++"
	}

	public affect(marble: Marble, _contraption: Contraption) {
		marble.value += 1
		return true
	}
}

class Decrement extends PassableAffector {
	public render(): string {
		return "--"
	}

	public affect(marble: Marble, _contraption: Contraption) {
		marble.value -= 1
		return true
	}
}

class Delete extends PassableAffector {
	public render(): string {
		return "xx"
	}

	public affect(marble: Marble, contraption: Contraption) {
		contraption.remove(marble)
		return true
	}
}

abstract class SolidCell extends Cell {
	public abstract render(): string
	public abstract tick(contraption: Contraption): void

	public isSolid(): boolean {
		return true
	}
}

class Wall extends SolidCell {
	constructor(x: number, y: number, span: Span) {
		super("wall", x, y, span)
	}

	public render(): string {
		return "##"
	}

	public tick(ignored: Contraption): void {}
}

class ErrorCell extends SolidCell {
	constructor(x: number, y: number, span: Span) {
		super("error", x, y, span)
	}

	public render(): string {
		return "!!"
	}

	public tick(ignored: Contraption): void {}
}

abstract class DirectionalCell extends SolidCell {
	constructor(
		x: number,
		y: number,
		span: Span,
		protected readonly direction: Direction,
		private readonly symbol: string
	) {
		super("operator", x, y, span)
	}

	public render(): string {
		if (this.direction == Direction.LEFT) return this.direction + this.symbol
		return this.symbol + this.direction
	}
}

abstract class DirectionalBinaryOperator extends DirectionalCell {
	constructor(
		x: number,
		y: number,
		span: Span,
		direction: Direction,
		symbol: string,
		private readonly operator: (a: number, b: number) => number
	) {
		super(x, y, span, direction, symbol)
	}

	public tick(contraption: Contraption): void {
		const [xA, yA] = move(this.x, this.y, opposite(this.direction))
		const marbleA = contraption.getMarble(xA, yA)
		if (marbleA === null) return
		const [xB, yB] = move(this.x, this.y, this.direction)
		const marbleB = contraption.getMarble(xB, yB)
		if (marbleB === null) return
		marbleB.value = this.operator(marbleA.value, marbleB.value)
		this.activatedThisTick = true
		marbleB.activatedThisTick = true
	}
}

class Adder extends DirectionalBinaryOperator {
	constructor(x: number, y: number, span: Span, direction: Direction) {
		super(x, y, span, direction, "+", (a, b) => a + b)
	}
}

class Cloner extends DirectionalCell {
	constructor(x: number, y: number, span: Span, direction: Direction) {
		super(x, y, span, direction, ":")
	}

	public tick(contraption: Contraption): void {
		const [sourceX, sourceY] = move(this.x, this.y, opposite(this.direction))
		const marble = contraption.getMarble(sourceX, sourceY)
		if (marble === null) return
		const [targetX, targetY] = move(this.x, this.y, this.direction)
		const target = contraption.getCell(targetX, targetY)
		if (target === null || target.isSolid(contraption)) return
		contraption.spawn(marble.value, targetX, targetY)
		marble.activatedThisTick = true
		this.activatedThisTick = true
	}
}

class Sieve extends Cell {
	constructor(x: number, y: number, span: Span) {
		super("wall", x, y, span)
	}

	public render(): string {
		return '""'
	}

	public tick(_contraption: Contraption): void {}

	public isSolid(contraption: Contraption): boolean {
		const marble = contraption.getMarble(this.x, this.y - 1)
		return marble === null || marble.value !== 0
	}
}
