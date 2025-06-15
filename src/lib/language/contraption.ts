import type { Cell } from "./cell"
import type { Marble } from "./marble"
import type { Span } from "./span"

type PendingMove = {
	marble: Marble
	targetX: number
	targetY: number
}

export class Contraption {
	constructor(
		public readonly width: number,
		public readonly height: number,
		private grid: Cell[][],
		private marbles: Marble[],
		private output: string = "",
		private pendingSpawns: Marble[] = [],
		private pendingMoves: PendingMove[] = [],
		private pendingDeletes: Marble[] = []
	) {}

	public getOutput(): string {
		return this.output
	}

	public printLine(line: string): void {
		this.output += line + "\n"
	}

	public getMarbles(): Readonly<Marble[]> {
		return this.marbles
	}

	public getMarble(x: number, y: number): Marble | null {
		return this.marbles.find((m) => m.x === x && m.y === y) ?? null
	}

	public getMarbleAtPosition(lineNumber: number, column: number): Marble | null {
		return this.getMarble(...this.positionToCoords(lineNumber, column))
	}

	public spawn(value: number, x: number, y: number) {
		this.pendingSpawns.push({
			value,
			x,
			y,
			movedThisTick: true,
			activatedThisTick: true
		})
	}

	public move(marble: Marble, targetX: number, targetY: number) {
		this.pendingMoves.push({ marble, targetX, targetY })
	}

	public remove(marble: Marble) {
		this.pendingDeletes.push(marble)
	}

	public getCell(x: number, y: number): Cell | null {
		return this.grid[y]?.[x] ?? null
	}

	public getCellAtPosition(lineNumber: number, column: number): Cell | null {
		return this.getCell(...this.positionToCoords(lineNumber, column))
	}

	public getCellArray(): Cell[] {
		return this.grid.flatMap((row) => row)
	}

	public getActiveRanges(): Span[] {
		return this.grid
			.flatMap((row) => row)
			.filter((cell) => cell.activatedThisTick)
			.map((cell) => cell.span)
	}

	private positionToCoords(lineNumber: number, column: number): Readonly<[number, number]> {
		return [Math.floor((column - 1) / 2), lineNumber - 1]
	}

	private resetMarbles(): void {
		for (const marble of this.marbles) {
			marble.movedThisTick = false
		}
	}

	private resetActivation(): void {
		this.marbles.forEach((m) => (m.activatedThisTick = false))

		for (let y = 0; y < this.height; y++) {
			for (let x = 0; x < this.width; x++) {
				const cell = this.grid[y][x]
				cell.activatedThisTick = false
			}
		}
	}

	tick(): Contraption {
		this.resetMarbles()
		this.resetActivation()

		for (let y = 0; y < this.height; y++) {
			for (let x = 0; x < this.width; x++) {
				const cell = this.grid[y][x]
				cell.kind.tick(cell, this)
			}
		}

		for (const marble of this.marbles) {
			marble.value = Math.max(0, marble.value % 256)
		}

		const marbles = [...this.marbles]
		const grid = [...this.grid.map((row) => [...row])]
		const pendingSpawns = [...this.pendingSpawns]
		const pendingMoves = [...this.pendingMoves]
		const pendingDeletes = [...this.pendingDeletes]
		return new Contraption(
			this.width,
			this.height,
			grid,
			marbles,
			this.output,
			pendingSpawns,
			pendingMoves,
			pendingDeletes
		)
	}

	public moveMarbles(): Contraption {
		this.resetActivation()

		for (const marble of this.pendingDeletes) {
			const idx = this.marbles.indexOf(marble)
			this.marbles.splice(idx, 1)
		}
		this.pendingDeletes = []

		const queue = [...this.pendingMoves]
		while (queue.length > 0) {
			const move = queue.shift()!

			// If another marble is blocking the way...
			// if the obstruction might move, push the blocked move to the back of the queue
			// otherwise, skip this move
			const obstacle = this.marbles.find((m) => m.x === move.targetX && m.y === move.targetY)
			if (obstacle !== undefined) {
				const obstacleMove = queue.find((mv) => mv.marble === obstacle)
				// If the marble might move, so try again later
				if (obstacleMove !== undefined) {
					queue.push(move)
				}
				continue
			}

			const targetCell = this.getCell(move.targetX, move.targetY)
			if (targetCell === null || targetCell.kind.isSolid(targetCell, this)) continue

			move.marble.x = move.targetX
			move.marble.y = move.targetY
			move.marble.movedThisTick = true
		}

		const gravityQueue = this.marbles.filter((m) => !m.movedThisTick)
		while (gravityQueue.length > 0) {
			const marble = gravityQueue.shift()!
			const marbleBelow = this.getMarble(marble.x, marble.y + 1)
			if (marbleBelow) {
				if (!marbleBelow.movedThisTick) gravityQueue.push(marble)
				else marble.movedThisTick = true
				continue
			}

			const cellBelow = this.getCell(marble.x, marble.y + 1)
			if (cellBelow == null || cellBelow.kind.isSolid(cellBelow, this)) {
				marble.movedThisTick = true
				continue
			}

			marble.y += 1
		}

		for (const marble of this.pendingSpawns) {
			if (this.getMarble(marble.x, marble.y)) continue
			this.marbles.push(marble)
		}
		this.pendingSpawns = []

		const marbles = [...this.marbles]
		const grid = [...this.grid.map((row) => [...row])]
		return new Contraption(this.width, this.height, grid, marbles, this.output)
	}

	render(showMarbles = false): string {
		const renderGrid = this.grid.map((row) => row.map((cell) => cell.kind.render?.(cell, this) ?? cell.symbol))
		if (showMarbles) {
			for (const marble of this.marbles) {
				renderGrid[marble.y][marble.x] = marble.value.toString(16).padStart(2, "0")
			}
		}
		return renderGrid.map((row) => row.join("")).join("\n")
	}
}
