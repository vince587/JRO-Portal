import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Comment {
  id: string;
  taskId: string;
  content: string;
  author: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

function useTaskComments(taskId: string | undefined) {
  return useQuery<Comment[]>({
    queryKey: ["task-comments", taskId],
    queryFn: async () => {
      const res = await fetch(`/api/tasks/${taskId}/comments`);
      if (!res.ok) throw new Error("Failed to fetch comments");
      return res.json();
    },
    enabled: !!taskId,
    refetchInterval: 15_000,
  });
}

export function TaskComments({ taskId }: { taskId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAll, setShowAll] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [replyOpen, setReplyOpen] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const { data: comments, isLoading } = useTaskComments(taskId);

  const createMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Failed to post comment");
      return res.json();
    },
    onSuccess: () => {
      setNewComment("");
      queryClient.invalidateQueries({ queryKey: ["task-comments", taskId] });
    },
    onError: () => toast({ title: "Failed to post comment", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ commentId, content }: { commentId: string; content: string }) => {
      const res = await fetch(`/api/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Failed to update comment");
      return res.json();
    },
    onSuccess: () => {
      setReplyOpen(null);
      setReplyText("");
      queryClient.invalidateQueries({ queryKey: ["task-comments", taskId] });
      toast({ title: "Comment updated" });
    },
    onError: () => toast({ title: "Failed to update comment", variant: "destructive" }),
  });

  const handlePost = () => {
    if (!newComment.trim()) return;
    createMutation.mutate(newComment.trim());
  };

  const handleUpdate = (commentId: string, content: string) => {
    updateMutation.mutate({ commentId, content });
  };

  const visibleComments = showAll ? (comments ?? []) : (comments ?? []).slice(0, 3);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Icon name="message-circle" className="text-muted-foreground" size={16} />
          Comments ({(comments ?? []).length})
        </h4>
        {(comments ?? []).length > 3 && (
          <Button variant="ghost" size="sm" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Show less" : "Show all"}
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {isLoading ? (
          Array(2).fill(0).map((_, i) => (
            <div key={i} className="flex gap-3">
              <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 bg-muted rounded animate-pulse" />
                <div className="h-8 w-full bg-muted rounded animate-pulse" />
              </div>
            </div>
          ))
        ) : visibleComments.length === 0 ? (
          <p className="text-xs text-muted-foreground">No comments yet. Be the first to comment.</p>
        ) : (
          visibleComments.map((comment) => (
            <div key={comment.id} className="flex gap-3 p-3 rounded-lg bg-muted/20">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-xs font-semibold text-primary">
                  {comment.authorName?.charAt(0) ?? "?"}
                </span>
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{comment.authorName}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(comment.createdAt), "MMM d, h:mm a")}
                  </span>
                </div>
                {replyOpen === comment.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      placeholder="Edit comment..."
                      className="h-20 text-xs"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleUpdate(comment.id, replyText)}
                        disabled={updateMutation.isPending}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setReplyOpen(null); setReplyText(""); }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-foreground">{comment.content}</p>
                )}
                {replyOpen !== comment.id && (
                  <div className="flex gap-2 mt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setReplyOpen(comment.id); setReplyText(comment.content); }}
                    >
                      <Icon name="edit" className="mr-1" size={12} /> Edit
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex gap-2 pt-2">
        <Input
          value={newComment}
          onChange={e => setNewComment(e.target.value)}
          placeholder="Add a comment..."
          className="flex-1"
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handlePost();
            }
          }}
        />
        <Button onClick={handlePost} disabled={createMutation.isPending || !newComment.trim()}>
          <Icon name="send" className="mr-1" size={16} /> Post
        </Button>
      </div>
    </div>
  );
}
