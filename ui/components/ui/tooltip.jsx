import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { cn } from "@/lib/utils"

function TooltipProvider({ delayDuration = 300, ...props }) {
	return (
		<TooltipPrimitive.Provider
			data-slot="tooltip-provider"
			delayDuration={delayDuration}
			{...props}
		/>
	)
}

function Tooltip({ ...props }) {
	return (
		<TooltipProvider>
			<TooltipPrimitive.Root data-slot="tooltip" {...props} />
		</TooltipProvider>
	)
}

function TooltipTrigger(props) {
	return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({ className, sideOffset = 6, children, ...props }) {
	return (
		<TooltipPrimitive.Portal>
			<TooltipPrimitive.Content
				data-slot="tooltip-content"
				sideOffset={sideOffset}
				className={cn(
					"z-50 rounded-sm border border-border bg-[var(--bg-overlay)] px-2 py-1 text-[11px] font-medium text-foreground shadow-md",
					"data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
					className,
				)}
				{...props}
			>
				{children}
			</TooltipPrimitive.Content>
		</TooltipPrimitive.Portal>
	)
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
