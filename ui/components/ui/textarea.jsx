import { cn } from "@/lib/utils"

function Textarea({ className, ...props }) {
	return (
		<textarea
			data-slot="textarea"
			className={cn(
				"flex w-full min-h-16 rounded-md border border-input bg-[var(--bg-raised)] px-2.5 py-2 text-[12.5px] text-foreground shadow-xs transition-[color,box-shadow] outline-none font-mono",
				"placeholder:text-muted-foreground",
				"focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
				"disabled:cursor-not-allowed disabled:opacity-50",
				className,
			)}
			{...props}
		/>
	)
}

export { Textarea }
