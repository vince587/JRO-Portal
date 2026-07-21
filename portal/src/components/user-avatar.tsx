import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface UserAvatarProps {
  name?: string | null;
  photoUrl?: string | null;
  /** Tailwind size classes, e.g. "h-7 w-7". */
  className?: string;
  fallbackClassName?: string;
}

/**
 * Shows a user's profile as an avatar (initials or photo). On hover a tooltip
 * reveals the full name, so the grid stays compact while identities are clear.
 */
export function UserAvatar({ name, photoUrl, className = "h-7 w-7", fallbackClassName = "bg-primary/10 text-primary text-[10px] font-semibold" }: UserAvatarProps) {
  const displayName = name || "Unknown user";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Avatar className={`${className} border border-border`}>
          <AvatarImage src={photoUrl || undefined} alt={displayName} className="object-cover" />
          <AvatarFallback className={fallbackClassName}>{getInitials(name)}</AvatarFallback>
        </Avatar>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs font-medium">{displayName}</p>
      </TooltipContent>
    </Tooltip>
  );
}
