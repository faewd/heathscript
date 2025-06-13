<script lang="ts">
	import { compile } from "$lib/language/compile"
	import type { Contraption } from "$lib/language/contraption"
	import type { Marble } from "$lib/language/marble"
	import type { Span } from "$lib/language/span"
	import loader from "@monaco-editor/loader"
	import type * as Monaco from "monaco-editor/esm/vs/editor/editor.api"
	import { onDestroy, onMount } from "svelte"

	let editor: Monaco.editor.IStandaloneCodeEditor
	let monaco: typeof Monaco
	let editorContainer: HTMLElement
	let hoverProvider: Monaco.IDisposable
	let marbleWidgets: Monaco.editor.IContentWidget[] = []
	let decorations: Monaco.editor.IEditorDecorationsCollection

	let contraption: Contraption | null = $state(null)
	let errors: { message: string; span: Span }[] = $state([])

	interface Props {
		value: string
		readOnly?: boolean
		marbles: Readonly<Marble[]>
		activeRanges: Readonly<Span[]>
	}

	let { value = $bindable(), readOnly = false, marbles, activeRanges }: Props = $props()

	export function compileModel() {
		const res = compile(value)
		contraption = res.contraption
		errors = res.errors
		updateErrorMarkers()
	}

	export function setSelection(span: Span) {
		const { startLineNumber, startColumn, endLineNumber, endColumn } = span
		editor?.setSelection(new monaco.Range(startLineNumber, startColumn, endLineNumber, endColumn))
	}

	function updateErrorMarkers() {
		const model = editor.getModel()
		if (model === null) return
		const markers = errors.map(({ message, span }) => ({
			message,
			severity: monaco.MarkerSeverity.Error,
			...span
		}))

		monaco.editor.setModelMarkers(model, "hsc", markers)
	}

	onMount(async () => {
		const monacoEditor = await import("monaco-editor")
		loader.config({ monaco: monacoEditor.default })

		monaco = await loader.init()

		monaco.languages.register({ id: "heathscript" })

		hoverProvider?.dispose()
		hoverProvider = monaco.languages.registerHoverProvider("heathscript", {
			provideHover(_model, pos) {
				if (contraption === null) return undefined
				const cell = contraption.getCellAtPosition(pos.lineNumber, pos.column)
				if (cell === null) return undefined
				const contents = [{ value: `${cell.constructor.name}` }]
				const marble = contraption.getMarbleAtPosition(pos.lineNumber, pos.column)
				if (marble !== null)
					contents.push({
						value: `---\n\n* *\n\n**Marble**\n\nposition: ${marble.x},${marble.y}\n\nvalue: ${marble.value} (0x${marble.value.toString(16).padStart(2, "0")})`
					})
				const { startLineNumber, startColumn, endLineNumber, endColumn } = cell.span
				return {
					contents,
					range: new monaco.Range(startLineNumber, startColumn, endLineNumber, endColumn)
				}
			}
		})

		monaco.editor.defineTheme("hs-dark", {
			base: "vs-dark",
			inherit: true,
			rules: [
				{ token: "cell.air", foreground: "27272a" },
				{ token: "cell.wall", foreground: "71717a" },
				{ token: "cell.operator", foreground: "ca8a04" },
				{ token: "cell.marble", foreground: "10b981" },
				{ token: "cell.conveyor", foreground: "3f3f46" },
				{ token: "cell.affector", foreground: "f472b6" }
			],
			colors: {
				"editor.foreground": "#a1a1aa",
				"editor.background": "#18181b"
			}
		})

		const cellTypes = ["marble", "air", "wall", "operator", "conveyor", "affector"]
		monaco.languages.registerDocumentSemanticTokensProvider("heathscript", {
			getLegend() {
				return {
					tokenTypes: ["cell"],
					tokenModifiers: cellTypes
				}
			},
			provideDocumentSemanticTokens(_model, _lastResultId, _token) {
				const data: number[] = []

				if (contraption) {
					let prevLine = 0
					let prevColumn = 0
					data.push(
						...contraption.getCellArray().flatMap(({ span, type, x, y }) => {
							const line = span.startLineNumber - 1
							const column = span.startColumn - 1
							const lineDelta = line - prevLine
							const columnDelta = prevLine === line ? column - prevColumn : column
							const cellType = contraption?.getMarble(x, y) ? "marble" : type
							prevLine = line
							prevColumn = column
							return [lineDelta, columnDelta, 2, 0, (1 << cellTypes.indexOf(cellType)) >>> 0]
						})
					)
				}

				return {
					data: new Uint32Array(data),
					resultId: undefined
				}
			},
			releaseDocumentSemanticTokens(_resultId) {}
		})

		editor = monaco.editor.create(editorContainer, {
			value,
			readOnly,
			language: "heathscript",
			theme: "hs-dark",
			tabCompletion: "off",
			tabSize: 2,
			insertSpaces: true,
			fontFamily: "var(--font-mono)",
			fontSize: 18,
			fontWeight: "500",
			padding: {
				top: 16
			},
			"semanticHighlighting.enabled": true
		})

		editor.onDidChangeModelContent((e) => {
			if (!e.isFlush) {
				value = editor?.getValue() ?? ""
				compileModel()
			}
		})

		compileModel()
	})

	$effect(() => {
		if (value && editor) {
			if (!editor.hasWidgetFocus() && (editor.getValue() ?? "" !== value)) {
				editor.setValue(value)
			}
		}
	})

	$effect(() => {
		if (readOnly != editor?.getOption(monaco.editor.EditorOption.readOnly) && editor) {
			editor.updateOptions({ readOnly })
			layout()
		}
	})

	export function layout() {
		requestAnimationFrame(() => {
			editor.layout()
		})
	}

	$effect(() => {
		marbleWidgets.forEach((w) => editor.removeContentWidget(w))
		marbleWidgets = []

		for (const marble of marbles) {
			const id =
				marble.x +
				"," +
				marble.y +
				Math.floor(Math.random() * 0xffffff)
					.toString(16)
					.padStart(6, "0")
			if (!editor) return
			const widget: Monaco.editor.IContentWidget = {
				getId() {
					return id
				},
				getPosition() {
					return {
						position: {
							lineNumber: marble.y + 1,
							column: marble.x * 2 + 1
						},
						preference: [0]
					}
				},
				getDomNode() {
					const el = document.createElement("div")
					el.classList.add(
						"bg-emerald-900",
						"text-zinc-200",
						"font-bold",
						"rounded-sm",
						"font-mono",
						"text-[18px]",
						"leading-[24px]"
					)
					if (marble.activatedThisTick) el.classList.add("active-marble")
					el.innerText = marble.value.toString(16).padStart(2, "0")
					return el
				}
			}
			marbleWidgets.push(widget)
			editor.addContentWidget(widget)
		}
	})

	$effect(() => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		activeRanges
		decorations?.clear()
		decorations = editor?.createDecorationsCollection(
			activeRanges.map((span) => {
				const { startLineNumber, startColumn, endLineNumber, endColumn } = span
				return {
					range: new monaco.Range(startLineNumber, startColumn, endLineNumber, endColumn),
					options: {
						inlineClassName: "active-cell"
					}
				}
			})
		)
	})

	onDestroy(() => {
		marbleWidgets.forEach((w) => editor?.removeContentWidget(w))
		hoverProvider?.dispose()
		monaco?.editor.getModels().forEach((model) => model.dispose())
		editor?.dispose()
	})
</script>

<div class="h-full w-full" bind:this={editorContainer}></div>

<style>
	:global(.active-cell) {
		background-color: transparent;
		animation-name: cellBlip;
		animation-duration: var(--tick-speed);
		animation-iteration-count: 1;
	}

	@keyframes cellBlip {
		from {
			background-color: var(--color-zinc-500);
		}
		to {
			background-color: transparent;
		}
	}
	:global(.active-marble) {
		animation-name: marbleBlip;
		animation-duration: var(--tick-speed);
		animation-iteration-count: 1;
	}

	@keyframes marbleBlip {
		from {
			background-color: var(--color-emerald-400);
			transform: scale(125%);
		}
		to {
			background-color: var(--color-emerald-900);
			transform: scale(100%);
		}
	}
</style>
