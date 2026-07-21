import { Icon } from "@/components/ui/icon"

import { cn } from "@/lib/utils"

function Spinner({ className }: { className?: string }) {
  return (
    <Icon name="loader-2" role="status" aria-label="Loading" className={cn("animate-spin", className)} size={16} />
  )
}

export { Spinner }
