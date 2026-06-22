import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function NotificationBell() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id, type, title, body, order_number, is_read, created_at")
        .order("created_at", { ascending: false })
        .limit(10);
      return data || [];
    },
    refetchInterval: 30000,
  });

  const unread = (notifications as any[]).filter((n) => !n.is_read).length;

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("user-notifs")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["notifications", user.id] })
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, qc]);

  const markRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["notifications", user?.id] });
  };

  const markAllRead = async () => {
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", user!.id).eq("is_read", false);
    qc.invalidateQueries({ queryKey: ["notifications", user?.id] });
  };

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <Badge className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full p-0 text-xs">
              {unread > 9 ? "9+" : unread}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-0">
        <div className="flex items-center justify-between px-3 py-2.5">
          <p className="text-sm font-semibold">Notifikasi</p>
          {unread > 0 && (
            <button onClick={markAllRead} className="text-xs text-primary hover:underline">
              Semua dibaca
            </button>
          )}
        </div>
        <DropdownMenuSeparator className="m-0" />
        {(notifications as any[]).length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">Belum ada notifikasi</p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {(notifications as any[]).map((n) => (
              <Link
                key={n.id}
                to={n.order_number ? `/order/${n.order_number}` : "#"}
                onClick={() => !n.is_read && markRead(n.id)}
                className={`relative flex flex-col gap-0.5 border-b px-3 py-2.5 text-sm transition-colors hover:bg-muted ${!n.is_read ? "bg-primary/5" : ""}`}
              >
                {!n.is_read && (
                  <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-primary" />
                )}
                <span className="pr-4 font-medium leading-tight">{n.title}</span>
                {n.body && (
                  <span className="text-xs leading-tight text-muted-foreground">{n.body}</span>
                )}
                <span className="text-[10px] text-muted-foreground">
                  {new Date(n.created_at).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}
                </span>
              </Link>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
