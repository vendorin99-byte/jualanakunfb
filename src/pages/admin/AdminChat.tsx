import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Loader2, MessageCircle, RefreshCw, Package, Phone, Mail, MapPin, ShoppingBag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatRupiah } from "@/lib/constants";

export default function AdminChat() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Warranty replacement dialog state
  const [warrantyOpen, setWarrantyOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [sendingWarranty, setSendingWarranty] = useState(false);

  const { data: convs = [] } = useQuery({
    queryKey: ["admin-chat-convs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("chat_conversations")
        .select("id, user_id, last_message_at, last_message_preview, unread_admin")
        .order("last_message_at", { ascending: false, nullsFirst: false });
      const ids = Array.from(new Set((data || []).map((c: any) => c.user_id)));
      let map: Record<string, string> = {};
      if (ids.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", ids);
        map = Object.fromEntries((profs || []).map((p: any) => [p.user_id, p.full_name]));
      }
      return (data || []).map((c: any) => ({ ...c, name: map[c.user_id] || "User" }));
    },
    refetchInterval: 10000,
  });

  const currentConv = convs.find((c: any) => c.id === selected);

  const { data: customerInfo } = useQuery({
    queryKey: ["admin-customer-info", currentConv?.user_id],
    enabled: !!currentConv?.user_id,
    queryFn: async () => {
      const [profileRes, orderRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name, phone, country, created_at")
          .eq("user_id", currentConv!.user_id)
          .maybeSingle(),
        supabase
          .from("orders")
          .select("customer_email, total_price")
          .eq("user_id", currentConv!.user_id)
          .in("payment_status", ["paid"]),
      ]);
      const profile = profileRes.data;
      const orders = orderRes.data || [];
      const email = orders[0]?.customer_email || null;
      const totalOrders = orders.length;
      const totalSpent = orders.reduce((s: number, o: any) => s + (o.total_price || 0), 0);
      return { profile, email, totalOrders, totalSpent };
    },
  });

  const { data: buyerOrders = [] } = useQuery({
    queryKey: ["admin-buyer-orders", currentConv?.user_id],
    enabled: warrantyOpen && !!currentConv?.user_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, order_number, product_id, grade_id, quantity, total_price, order_status, payment_status, products(name), account_grades(grade)")
        .eq("user_id", currentConv!.user_id)
        .in("payment_status", ["paid"])
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["admin-chat-msgs", selected],
    enabled: !!selected,
    queryFn: async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("id, sender_role, content, created_at")
        .eq("conversation_id", selected!)
        .order("created_at", { ascending: true });
      return data || [];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("admin-chat-all")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (p: any) => {
          qc.invalidateQueries({ queryKey: ["admin-chat-convs"] });
          if (p.new?.conversation_id === selected) {
            qc.invalidateQueries({ queryKey: ["admin-chat-msgs", selected] });
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [selected, qc]);

  useEffect(() => {
    if (!selected) return;
    supabase.rpc("mark_chat_read", { _conversation_id: selected, _as_admin: true }).then(() => {
      qc.invalidateQueries({ queryKey: ["admin-chat-convs"] });
    });
  }, [selected, messages.length, qc]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const send = async () => {
    if (!selected || !text.trim() || sending) return;
    setSending(true);
    const { data, error } = await supabase.rpc("admin_send_chat_message", {
      _conversation_id: selected,
      _content: text.trim(),
    });
    setSending(false);
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row?.success) {
      toast.error(row?.message || error?.message || "Gagal");
      return;
    }
    setText("");
    qc.invalidateQueries({ queryKey: ["admin-chat-msgs", selected] });
    qc.invalidateQueries({ queryKey: ["admin-chat-convs"] });
  };

  const sendWarrantyReplacement = async () => {
    if (!selectedOrderId || !selected) return;
    setSendingWarranty(true);
    try {
      const { data, error } = await supabase.rpc("admin_warranty_replace", {
        _order_id: selectedOrderId,
      });
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row?.success) {
        toast.error(row?.message || error?.message || "Gagal mengirim akun pengganti");
        setSendingWarranty(false);
        return;
      }

      // Send email with the replacement credential
      supabase.functions.invoke("send-email", {
        body: {
          to: row.customer_email,
          subject: `Akun Pengganti — Pesanan #${row.order_number}`,
          template: "order-credentials",
          data: {
            orderNumber: row.order_number,
            credentials: [{
              email: row.cred_email,
              password: row.cred_password,
              twofa: row.cred_twofa,
              recovery: row.cred_recovery,
              notes: row.cred_notes,
              grade_label: row.grade_label,
            }],
            adminNotes: "Ini adalah akun pengganti untuk klaim garansi kamu.",
          },
        },
      }).catch(() => {});

      // Send chat notification
      await supabase.rpc("admin_send_chat_message", {
        _conversation_id: selected,
        _content: `✅ Akun pengganti untuk pesanan #${row.order_number} sudah dikirim ke email kamu (${row.customer_email}). Silakan cek inbox/spam.`,
      });

      toast.success("Akun pengganti berhasil dikirim!");
      setWarrantyOpen(false);
      setSelectedOrderId(null);
      qc.invalidateQueries({ queryKey: ["admin-chat-msgs", selected] });
      qc.invalidateQueries({ queryKey: ["admin-chat-convs"] });
    } catch (e: any) {
      toast.error(e.message || "Terjadi kesalahan");
    }
    setSendingWarranty(false);
  };

  const openWarrantyDialog = () => {
    setSelectedOrderId(null);
    setWarrantyOpen(true);
  };

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Live Chat</h1>
      <div className="grid h-[calc(100vh-12rem)] grid-cols-1 gap-4 md:grid-cols-[20rem_1fr]">
        <div className="overflow-y-auto rounded-2xl border bg-card">
          {convs.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Belum ada percakapan</p>
          ) : (
            convs.map((c: any) => (
              <button
                key={c.id}
                onClick={() => setSelected(c.id)}
                className={cn(
                  "w-full border-b p-3 text-left transition-colors hover:bg-muted",
                  selected === c.id && "bg-muted"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{c.name}</span>
                  {c.unread_admin > 0 && (
                    <Badge className="h-5 min-w-[1.25rem] rounded-full p-0 text-[10px]">
                      {c.unread_admin}
                    </Badge>
                  )}
                </div>
                <p className="line-clamp-1 text-xs text-muted-foreground">
                  {c.last_message_preview || "(belum ada pesan)"}
                </p>
                {c.last_message_at && (
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {new Date(c.last_message_at).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}
                  </p>
                )}
              </button>
            ))
          )}
        </div>

        <div className="flex flex-col overflow-hidden rounded-2xl border bg-card">
          {!selected ? (
            <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
              <MessageCircle className="mb-2 h-10 w-10" />
              <p>Pilih percakapan</p>
            </div>
          ) : (
            <>
              <div className="border-b px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold leading-tight">{currentConv?.name || "User"}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {customerInfo?.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {customerInfo.email}
                        </span>
                      )}
                      {customerInfo?.profile?.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {customerInfo.profile.phone}
                        </span>
                      )}
                      {customerInfo?.profile?.country && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {customerInfo.profile.country}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <ShoppingBag className="h-3 w-3" />
                        {customerInfo?.totalOrders ?? 0} order
                        {customerInfo?.totalSpent ? ` · ${formatRupiah(customerInfo.totalSpent)}` : ""}
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 gap-1.5 text-xs"
                    onClick={openWarrantyDialog}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Kirim Akun Pengganti
                  </Button>
                </div>
              </div>
              <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-4">
                {messages.map((m: any) => (
                  <div
                    key={m.id}
                    className={cn("flex", m.sender_role === "admin" ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[70%] rounded-2xl px-3 py-2 text-sm",
                        m.sender_role === "admin"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      )}
                    >
                      {m.content}
                      <p className="mt-1 text-[10px] opacity-60">
                        {new Date(m.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 border-t p-3">
                <Input
                  placeholder="Balas pelanggan..."
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
                <Button onClick={send} disabled={sending || !text.trim()}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Warranty Replacement Dialog */}
      <Dialog open={warrantyOpen} onOpenChange={(v) => { setWarrantyOpen(v); if (!v) setSelectedOrderId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Kirim Akun Pengganti
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Pilih pesanan yang perlu akun pengganti. Sistem akan otomatis mengambil akun dari stok yang sesuai dengan produk &amp; grade pesanan.
            </p>

            {buyerOrders.length === 0 ? (
              <p className="rounded-lg bg-muted p-4 text-center text-sm text-muted-foreground">
                Tidak ada pesanan berbayar ditemukan untuk user ini.
              </p>
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {buyerOrders.map((order: any) => (
                  <button
                    key={order.id}
                    onClick={() => setSelectedOrderId(order.id)}
                    className={cn(
                      "w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted",
                      selectedOrderId === order.id && "border-primary bg-primary/5"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Package className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">
                            {order.products?.name || "Produk"}
                            {order.account_grades?.grade && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                — Grade {order.account_grades.grade}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">#{order.order_number}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{formatRupiah(order.total_price)}</p>
                        <Badge variant="outline" className="text-[10px]">
                          {order.order_status}
                        </Badge>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {selectedOrderId && (
              <p className="rounded-md bg-yellow-50 px-3 py-2 text-xs text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
                Akun pengganti akan diambil dari stok sesuai produk &amp; grade, kemudian dikirim ke email pembeli dan notifikasi di chat ini.
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setWarrantyOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={sendWarrantyReplacement}
              disabled={!selectedOrderId || sendingWarranty}
              className="gap-2"
            >
              {sendingWarranty ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Kirim Akun Pengganti
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
