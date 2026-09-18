import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
	"inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-[12.5px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
	{
		variants: {
			variant: {
				default:
					"bg-primary text-primary-foreground shadow-sm hover:bg-[var(--accent-hover)] active:bg-[var(--accent-press)]",
				destructive:
					"bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20",
				outline:
					"border border-border bg-transparent hover:bg-secondary hover:text-foreground text-muted-foreground",
				secondary: "bg-secondary text-foreground hover:bg-muted",
				ghost: "text-muted-foreground hover:bg-secondary hover:text-foreground",
				link: "text-primary underline-offset-4 hover:underline",
			},
			size: {
				default: "h-7 px-3 has-[>svg]:px-2.5",
				sm: "h-6 px-2 text-[12px] has-[>svg]:px-2",
				lg: "h-8 px-4",
				icon: "size-6.5 p-0",
			},
		},
		defaultVariants: {
			variant: "ghost",
			size: "default",
		},
	},
)

function Button({ className, variant, size, asChild = false, ...props }) {
	const Comp = asChild ? Slot : "button"
	return (
		<Comp
			data-slot="button"
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	)
}

export { Button, buttonVariants }
