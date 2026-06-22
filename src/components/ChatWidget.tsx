import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function ChatWidget() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: conv } = useQuery({
    queryKey: ["chat-conv", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("chat_conversations")
        .select("id, unread_user")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
    refetchInterval: open ? false : 15000,
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["chat-msgs", conv?.id],
    enabled: !!conv?.id && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("id, sender_role, content, created_at")
        .eq("conversation_id", conv!.id)
        .order("created_at", { ascending: true });
      return data || [];
    },
  });

  // Auto-open when warranty claim is submitted
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("open-chat-widget", handler);
    return () => window.removeEventListener("open-chat-widget", handler);
  }, []);

  // Realtime subscribe
  useEffect(() => {
    if (!conv?.id) return;
    const ch = supabase
      .channel(`chat-${conv.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${conv.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["chat-msgs", conv.id] });
          qc.invalidateQueries({ queryKey: ["chat-conv", user?.id] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [conv?.id, qc, user?.id]);

  // Mark read & autoscroll
  useEffect(() => {
    if (open && conv?.id) {
      supabase.rpc("mark_chat_read", { _conversation_id: conv.id, _as_admin: false }).then(() => {
        qc.invalidateQueries({ queryKey: ["chat-conv", user?.id] });
      });
    }
  }, [open, conv?.id, messages.length, qc, user?.id]);

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);

  const send = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    const { data, error } = await supabase.rpc("send_chat_message", { _content: content });
    setSending(false);
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row?.success) {
      toast.error(row?.message || error?.message || "Gagal kirim");
      return;
    }
    setText("");
    qc.invalidateQueries({ queryKey: ["chat-conv", user?.id] });
    qc.invalidateQueries({ queryKey: ["chat-msgs", row.conversation_id] });
  };

  if (!user) return null;

  const unread = conv?.unread_user ?? 0;

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-lg md:bottom-6"
          aria-label="Chat"
        >
          <MessageCircle className="h-5 w-5" />
          {unread > 0 && (
            <Badge className="absolute -right-1 -top-1 h-5 min-w-[1.25rem] rounded-full p-0 text-[10px]">
              {unread}
            </Badge>
          )}
        </button>
      )}
      {open && (
        <div className="fixed bottom-20 right-4 z-40 flex h-[28rem] w-[20rem] flex-col rounded-2xl border bg-card shadow-2xl md:bottom-6 md:w-96">
          <div className="flex items-center justify-between rounded-t-2xl bg-gradient-to-r from-primary to-accent p-3 text-primary-foreground">
            <div>
              <p className="text-sm font-semibold">Chat dengan Admin</p>
              <p className="text-xs opacity-80">Biasanya dibalas dalam beberapa menit</p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Tutup">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3">
            {messages.length === 0 ? (
              <p className="mt-8 text-center text-sm text-muted-foreground">
                Mulai percakapan dengan kami 👋
              </p>
            ) : (
              messages.map((m: any) => (
                <div
                  key={m.id}
                  className={cn("flex", m.sender_role === "user" ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                      m.sender_role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    )}
                  >
                    {m.content}
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="flex items-center gap-2 border-t p-2">
            <Input
              placeholder="Tulis pesan..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              maxLength={2000}
            />
            <Button size="icon" onClick={send} disabled={sending || !text.trim()}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}