<script lang="ts">
	import Button from "$lib/components/Button.svelte"
	import Editor from "$lib/components/Editor.svelte"
	import { compile } from "$lib/language/compile"
	import type { Contraption } from "$lib/language/contraption"
	import samples from "$lib/language/samples"
	import { OctagonMinus, PanelRightClose, Play } from "@lucide/svelte"
	import { onDestroy } from "svelte"

	// prettier-ignore
	let content = $state(samples.fib)
	let source = $state("")
	let running = $state(false)
	let contraption: Contraption | undefined = $state()
	let timeout: number | null = null
	let output = $state("")
	let outputBox: HTMLElement | undefined = $state()
	let showOutput = $state(false)
	let editor: Editor | undefined = $state()

	let tickPulser: HTMLElement | undefined = $state()
	let tickSpeed = $state(10)

	function tick() {
		if (!contraption) return
		contraption = contraption.tick()
		output = contraption.getOutput()
		tickPulser?.classList.add("pulse")
		timeout = setTimeout(() => {
			tickPulser?.classList.remove("pulse")
			if (!contraption) return
			contraption = contraption.moveMarbles()
			output = contraption.getOutput()
			if (contraption.getMarbles().length === 0) stop()
			timeout = setTimeout(tick, tickSpeed)
		}, tickSpeed)
	}

	function start() {
		source = content

		const res = compile(source)
		if (res.errors.length > 0) {
			editor?.setSelection(res.errors[0].span)
			return
		}

		running = true
		contraption = res.contraption
		content = contraption.render()

		showOutput = true
		setTimeout(tick, 1000)
	}

	function stop() {
		content = source
		running = false
		contraption = undefined
		editor?.compileModel()
		if (timeout !== null) clearTimeout(timeout)
	}

	function setSample(sample: string) {
		content = sample
		editor?.compileModel()
	}

	onDestroy(() => {
		if (timeout) clearTimeout(timeout)
	})

	$effect.pre(() => {
		if (outputBox && output) {
			const scrollTop = outputBox.scrollTop
			const isScrolledToBottom = outputBox.scrollHeight - outputBox.clientHeight <= scrollTop + 1
			setTimeout(() => {
				if (outputBox === undefined) return
				if (isScrolledToBottom) {
					outputBox.scrollTop = outputBox.scrollHeight - outputBox.clientHeight
				} else {
					outputBox.scrollTop = scrollTop
				}
			}, 10)
		}
	})
</script>

<main
	class="grid h-screen w-screen max-w-full grid-rows-[3rem_1fr] bg-zinc-900 text-zinc-300"
	style="--tick-speed: {tickSpeed}ms"
>
	<div class="flex items-center gap-1 border-b border-zinc-800 p-1">
		{#if !running}
			<Button icon={Play} variant="green" onclick={start}>Start</Button>
		{:else}
			<Button icon={Play} variant="green" onclick={start} active disabled />
			<Button icon={OctagonMinus} variant="red" onclick={stop} active>Stop</Button>
			<div class="relative mr-4 ml-2">
				<div
					bind:this={tickPulser}
					class="tick-pulser absolute top-[-6px] inline-flex h-3 w-3 rounded-full bg-emerald-800"
				></div>
				<div class="absolute top-[-6px] inline-flex h-3 w-3 rounded-full bg-emerald-400"></div>
			</div>
		{/if}
		<label class="ml-auto">
			Simulation Speed:
			<select bind:value={tickSpeed} class="cursor-pointer rounded bg-zinc-950 px-2 py-1">
				<option value={10}>Super Fast</option>
				<option value={100}>Fast</option>
				<option value={500}>Slow</option>
				<option value={2500}>Snail's Pace</option>
			</select>
		</label>
		<label class="mr-2 ml-4">
			Sample:
			<select
				onchange={(e) => setSample(e.currentTarget.value)}
				class="cursor-pointer rounded bg-zinc-950 px-2 py-1 disabled:text-zinc-600"
				disabled={running}
			>
				{#each Object.entries(samples) as [key, sample] (key)}
					<option value={sample}>{key}</option>
				{/each}
			</select>
		</label>
	</div>
	<div class="grid h-full w-screen overflow-hidden {showOutput ? 'grid-cols-2' : 'grid-cols-1'}">
		<Editor
			bind:this={editor}
			bind:value={content}
			readOnly={running}
			marbles={contraption?.getMarbles() ?? []}
			activeRanges={contraption?.getActiveRanges() ?? []}
		/>
		{#if showOutput}
			<div
				bind:this={outputBox}
				class="relative h-full shrink-0 overflow-y-scroll bg-zinc-950 p-2 pb-8 text-[18px] text-zinc-400"
			>
				<h2 class="text-xl font-bold">Output</h2>
				<pre class="font-mono">{output}</pre>
				<Button
					onclick={() => {
						showOutput = false
						editor?.layout()
					}}
					icon={PanelRightClose}
					class="absolute top-2 right-2"
				/>
			</div>
		{/if}
	</div>
</main>

<style>
	:global(.tick-pulser) {
		transform: scale(100%);
		transition: transform var(--tick-speed);
	}

	:global(.tick-pulser.pulse) {
		transform: scale(175%);
	}
</style>
