import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

function Dialog(props) {
	return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger(props) {
	return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal(props) {
	return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose(props) {
	return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({ className, ...props }) {
	return (
		<DialogPrimitive.Overlay
			data-slot="dialog-overlay"
			className={cn(
				"fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px]",
				"data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
				className,
			)}
			{...props}
		/>
	)
}

function DialogContent({
	className,
	children,
	showCloseButton = true,
	size = "default",
	...props
}) {
	const sizeClass = {
		sm: "max-w-sm",
		default: "max-w-lg",
		lg: "max-w-2xl",
		xl: "max-w-4xl",
		full: "max-w-[min(1100px,92vw)]",
	}[size]

	return (
		<DialogPortal>
			<DialogOverlay />
			<DialogPrimitive.Content
				data-slot="dialog-content"
				className={cn(
					"fixed top-1/2 left-1/2 z-50 grid w-[92vw] -translate-x-1/2 -translate-y-1/2 gap-0 rounded-lg border border-border bg-popover text-popover-foreground shadow-[var(--shadow-overlay)]",
					"data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
					"max-h-[86vh] flex flex-col overflow-hidden",
					sizeClass,
					className,
				)}
				{...props}
			>
				{children}
				{showCloseButton && (
					<DialogPrimitive.Close className="absolute top-3 right-3 rounded-sm p-1 text-muted-foreground opacity-80 transition-opacity hover:opacity-100 hover:bg-secondary focus:outline-none disabled:pointer-events-none">
						<X className="size-4" />
						<span className="sr-only">Close</span>
					</DialogPrimitive.Close>
				)}
			</DialogPrimitive.Content>
		</DialogPortal>
	)
}

function DialogHeader({ className, ...props }) {
	return (
		<div
			data-slot="dialog-header"
			className={cn(
				"flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3",
				className,
			)}
			{...props}
		/>
	)
}

function DialogFooter({ className, ...props }) {
	return (
		<div
			data-slot="dialog-footer"
			className={cn(
				"flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3",
				className,
			)}
			{...props}
		/>
	)
}

function DialogTitle({ className, ...props }) {
	return (
		<DialogPrimitive.Title
			data-slot="dialog-title"
			className={cn("text-[13px] font-semibold text-foreground", className)}
			{...props}
		/>
	)
}

function DialogDescription({ className, ...props }) {
	return (
		<DialogPrimitive.Description
			data-slot="dialog-description"
			className={cn("text-[12px] text-muted-foreground", className)}
			{...props}
		/>
	)
}

export {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogOverlay,
	DialogPortal,
	DialogTitle,
	DialogTrigger,
}
