import * as LabelPrimitive from "@radix-ui/react-label"
import { cn } from "@/lib/utils"

function Label({ className, ...props }) {
	return (
		<LabelPrimitive.Root
			data-slot="label"
			className={cn(
				"flex items-center gap-1.5 text-[11.5px] font-medium text-muted-foreground uppercase tracking-wide select-none",
				"peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
				className,
			)}
			{...props}
		/>
	)
}

export { Label }
