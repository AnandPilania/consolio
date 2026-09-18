import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function AlertDialog(props) {
	return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
}
function AlertDialogTrigger(props) {
	return (
		<AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
	)
}
function AlertDialogPortal(props) {
	return (
		<AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
	)
}

function AlertDialogOverlay({ className, ...props }) {
	return (
		<AlertDialogPrimitive.Overlay
			data-slot="alert-dialog-overlay"
			className={cn(
				"fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px]",
				"data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
				className,
			)}
			{...props}
		/>
	)
}

function AlertDialogContent({ className, ...props }) {
	return (
		<AlertDialogPortal>
			<AlertDialogOverlay />
			<AlertDialogPrimitive.Content
				data-slot="alert-dialog-content"
				className={cn(
					"fixed top-1/2 left-1/2 z-50 grid w-[92vw] max-w-sm -translate-x-1/2 -translate-y-1/2 gap-3 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-[var(--shadow-overlay)]",
					"data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
					className,
				)}
				{...props}
			/>
		</AlertDialogPortal>
	)
}

function AlertDialogHeader({ className, ...props }) {
	return (
		<div
			data-slot="alert-dialog-header"
			className={cn("flex flex-col gap-1.5", className)}
			{...props}
		/>
	)
}

function AlertDialogFooter({ className, ...props }) {
	return (
		<div
			data-slot="alert-dialog-footer"
			className={cn("flex items-center justify-end gap-2", className)}
			{...props}
		/>
	)
}

function AlertDialogTitle({ className, ...props }) {
	return (
		<AlertDialogPrimitive.Title
			data-slot="alert-dialog-title"
			className={cn("text-[13px] font-semibold", className)}
			{...props}
		/>
	)
}

function AlertDialogDescription({ className, ...props }) {
	return (
		<AlertDialogPrimitive.Description
			data-slot="alert-dialog-description"
			className={cn("text-[12px] text-muted-foreground", className)}
			{...props}
		/>
	)
}

function AlertDialogAction({ className, ...props }) {
	return (
		<AlertDialogPrimitive.Action
			className={cn(buttonVariants({ variant: "default" }), className)}
			{...props}
		/>
	)
}

function AlertDialogCancel({ className, ...props }) {
	return (
		<AlertDialogPrimitive.Cancel
			className={cn(buttonVariants({ variant: "outline" }), className)}
			{...props}
		/>
	)
}

export {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogOverlay,
	AlertDialogPortal,
	AlertDialogTitle,
	AlertDialogTrigger,
}
