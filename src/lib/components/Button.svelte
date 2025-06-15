<script lang="ts">
	import { cn } from "$lib/utils"
	import type { Icon as IconType } from "@lucide/svelte"
	import type { Snippet } from "svelte"
	import type { MouseEventHandler } from "svelte/elements"

	interface Props {
		icon: typeof IconType
		variant?: "primary" | "green" | "red"
		active?: boolean
		class?: string
		disabled?: boolean
		onclick: MouseEventHandler<HTMLButtonElement>
		children?: Snippet
	}

	let { icon, variant = "primary", active = false, disabled, class: className, children, ...props }: Props = $props()

	const variants = {
		primary: {
			iconColor: "text-zinc-400",
			active: "bg-zinc-800 text-zinc-300 border-zinc-600 hover:bg-zinc-700"
		},
		green: {
			iconColor: "text-emerald-400",
			active: "bg-emerald-950 text-emerald-300 border-emerald-900 hover:bg-emerald-900"
		},
		red: {
			iconColor: "text-rose-400",
			active: "bg-rose-950 text-rose-300 border-rose-900 hover:bg-rose-900"
		}
	}

	let v = $derived(variants[variant])
	let btnClass = $derived(
		cn(
			"flex flex items-center justify-center gap-2 rounded border border-zinc-800 p-1 transition-colors",
			{ [v.active]: active, "bg-zinc-900 hover:bg-zinc-800": !active },
			{ "cursor-pointer": !disabled, "pointer-events-none": disabled },
			className
		)
	)
</script>

<button class={btnClass} {disabled} {...props}>
	{#if icon}
		{@const Icon = icon}
		<Icon class={v.iconColor} />
	{/if}
	{#if children}
		<span class="mr-1 max-md:hidden">
			{@render children()}
		</span>
	{/if}
</button>
