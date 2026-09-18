import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
	"inline-flex items-center justify-center rounded-sm border px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide w-fit whitespace-nowrap shrink-0",
	{
		variants: {
			variant: {
				default: "border-transparent bg-primary/15 text-primary",
				secondary: "border-transparent bg-secondary text-muted-foreground",
				destructive: "border-transparent bg-destructive/15 text-destructive",
				outline: "border-border text-foreground",
			},
		},
		defaultVariants: { variant: "default" },
	},
)

function Badge({ className, variant, asChild = false, ...props }) {
	const Comp = asChild ? Slot : "span"
	return (
		<Comp
			data-slot="badge"
			className={cn(badgeVariants({ variant }), className)}
			{...props}
		/>
	)
}

const METHOD_COLOR = {
	GET: "var(--m-GET)",
	POST: "var(--m-POST)",
	PUT: "var(--m-PUT)",
	PATCH: "var(--m-PATCH)",
	DELETE: "var(--m-DELETE)",
	HEAD: "var(--m-HEAD)",
	OPTIONS: "var(--m-OPTIONS)",
}

function MethodBadge({ method, small, className }) {
	const color = METHOD_COLOR[method] || "var(--tx-muted)"
	return (
		<span
			data-slot="method-badge"
			className={cn(
				"inline-flex items-center justify-center rounded-sm font-bold tracking-wide shrink-0",
				small
					? "text-[9.5px] px-1 py-px min-w-9"
					: "text-[10.5px] px-1.5 py-0.5 min-w-12",
				className,
			)}
			style={{
				color,
				background: `color-mix(in srgb, ${color} 14%, transparent)`,
			}}
		>
			{method}
		</span>
	)
}

export { Badge, badgeVariants, MethodBadge }
