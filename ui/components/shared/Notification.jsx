import { Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useStore } from "../../store"

export function Notification() {
	const notif = useStore((s) => s.notif)
	if (!notif) return null
	const isSuccess = notif.type === "success"
	return (
		<div
			key={notif.id}
			className={cn(
				"fixed bottom-5 right-5 z-[300] flex animate-[slideUp_0.2s_ease] items-center gap-2 rounded-md border border-[var(--bd-base)] bg-[var(--bg-overlay)] px-4 py-2.5 text-[12.5px] font-medium shadow-[var(--shadow-md)]",
				isSuccess
					? "border-l-[3px] border-l-[var(--ok)] text-[var(--ok)]"
					: "border-l-[3px] border-l-[var(--err)] text-[var(--err)]",
			)}
		>
			{isSuccess ? <Check size={13} /> : <X size={13} />}
			{notif.msg}
		</div>
	)
}
