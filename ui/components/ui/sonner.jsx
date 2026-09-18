import { Toaster as Sonner } from "sonner"

function Toaster(props) {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "group toast bg-[var(--bg-overlay)] text-foreground border border-border shadow-lg rounded-md text-[12.5px]",
          description: "text-muted-foreground",
          actionButton: "bg-primary text-primary-foreground",
          cancelButton: "bg-secondary text-muted-foreground",
          success: "!text-[var(--ok)]",
          error: "!text-[var(--err)]",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
