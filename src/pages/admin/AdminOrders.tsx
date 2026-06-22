import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatRupiah } from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Eye, Check, X, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

export default function AdminOrders() {
  const queryClient = useQueryClient();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewIsPdf, setPreviewIsPdf] = useState(false);
  const [reviewing, setReviewing] = useState<any | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [tab, setTab] = useState<"pending" | "paid" | "rejected" | "all">("pending");
  const [fulfilling, setFulfilling] = useState<any | null>(null);
  const [fulfillNotes, setFulfillNotes] = useState("");
  const [pickedCreds, setPickedCreds] = useState<string[]>([]);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["admin-orders-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, products(name, category), account_grades(grade), packages(name, quantity)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: "payment_status" | "order_status"; value: string }) => {
      const payload: any = { [field]: value };
      const { error } = await supabase.from("orders").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Status diupdate!"); queryClient.invalidateQueries({ queryKey: ["admin-orders-list"] }); },
    onError: (err: any) => toast.error(err.message),
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, approve, notes }: { id: string; approve: boolean; notes: string }) => {
      const { error } = await supabase.from("orders").update({
        payment_status: approve ? "paid" : "failed",
        order_status: approve ? "completed" : "cancelled",
        admin_notes: notes || null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      toast.success(vars.approve ? "Pembayaran disetujui!" : "Pembayaran ditolak");
      queryClient.invalidateQueries({ queryKey: ["admin-orders-list"] });
      setReviewing(null);
      setAdminNotes("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const { data: availableCreds } = useQuery({
    queryKey: ["admin-available-creds", fulfilling?.product_id, fulfilling?.grade_id],
    enabled: !!fulfilling?.product_id,
    queryFn: async () => {
      let q = supabase
        .from("account_credentials")
        .select("id, email, grade_id, account_grades(grade)")
        .eq("product_id", fulfilling.product_id)
        .eq("is_sold", false)
        .order("created_at", { ascending: true });
      if (fulfilling.grade_id) q = q.eq("grade_id", fulfilling.grade_id);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const fulfillMutation = useMutation({
    mutationFn: async ({ orderId, credentialIds, notes }: { orderId: string; credentialIds: string[] | null; notes: string }) => {
      const { data, error } = await supabase.rpc("admin_fulfill_order", {
        _order_id: orderId,
        _credential_ids: credentialIds && credentialIds.length > 0 ? credentialIds : null,
        _notes: notes || null,
      });
      if (error) throw error;
      const r = Array.isArray(data) ? data[0] : data;
      if (!r?.success) throw new Error(r?.message || "Gagal");
      return r;
    },
    onSuccess: async (r: any, { orderId, notes }) => {
      toast.success(`Berhasil assign ${r.assigned_count} akun (${r.total_assigned}/${r.needed})`);
      queryClient.invalidateQueries({ queryKey: ["admin-orders-list"] });

      // Kirim email kredensial ke buyer
      if (fulfilling && r.assigned_count > 0) {
        try {
          const { data: creds } = await supabase
            .from("account_credentials")
            .select("email, password, twofa_secret, recovery_email, notes, grade_id")
            .eq("sold_to_order", orderId);

          const gradeIds = [...new Set((creds || []).map((c: any) => c.grade_id).filter(Boolean))];
          let gradeMap: Record<string, string> = {};
          if (gradeIds.length > 0) {
            const { data: grades } = await supabase.from("account_grades").select("id, grade").in("id", gradeIds);
            gradeMap = Object.fromEntries((grades || []).map((g: any) => [g.id, g.grade]));
          }

          const credList = (creds || []).map((c: any) => ({
            email: c.email || "",
            password: c.password || "",
            twofa: c.twofa_secret || "",
            recovery: c.recovery_email || "",
            notes: c.notes || "",
            grade_label: c.grade_id ? gradeMap[c.grade_id] : null,
          }));

          await supabase.functions.invoke("send-email", {
            body: {
              to: fulfilling.customer_email,
              subject: `Akun pesananmu sudah siap — ${fulfilling.order_number}`,
              template: "order-credentials",
              data: {
                customerName: fulfilling.customer_name,
                orderNumber: fulfilling.order_number,
                credentials: credList,
                adminNotes: notes || fulfilling.admin_notes || "",
              },
            },
          });
        } catch (e) {
          console.error("Gagal kirim email kredensial:", e);
        }
      }

      setFulfilling(null);
      setFulfillNotes("");
      setPickedCreds([]);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const viewProof = async (path: string) => {
    const { data, error } = await supabase.storage.from("payment-proofs").createSignedUrl(path, 60 * 10);
    if (error) { toast.error("Gagal buka bukti: " + error.message); return; }
    setPreviewIsPdf(path.toLowerCase().endsWith(".pdf"));
    setPreviewUrl(data.signedUrl);
  };

  const payColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    paid: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
    expired: "bg-muted text-muted-foreground",
  };

  const filtered = (orders || []).filter((o: any) => {
    if (tab === "all") return true;
    if (tab === "pending") return o.payment_status === "pending";
    if (tab === "paid") return o.payment_status === "paid";
    if (tab === "rejected") return o.payment_status === "failed" || o.payment_status === "expired";
    return true;
  });

  const counts = {
    pending: (orders || []).filter((o: any) => o.payment_status === "pending").length,
    paid: (orders || []).filter((o: any) => o.payment_status === "paid").length,
    rejected: (orders || []).filter((o: any) => o.payment_status === "failed" || o.payment_status === "expired").length,
    all: (orders || []).length,
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Orders</h1>
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="mb-4">
        <TabsList>
          <TabsTrigger value="pending">Menunggu Verifikasi ({counts.pending})</TabsTrigger>
          <TabsTrigger value="paid">Sudah Lunas ({counts.paid})</TabsTrigger>
          <TabsTrigger value="rejected">Ditolak/Expired ({counts.rejected})</TabsTrigger>
          <TabsTrigger value="all">Semua ({counts.all})</TabsTrigger>
        </TabsList>
      </Tabs>
      {isLoading ? (
        <p className="text-muted-foreground">Memuat...</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground">Tidak ada order di kategori ini.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((order: any) => (
            <Card key={order.id} className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="text-sm font-bold">{order.order_number}</code>
                      <Badge className={payColors[order.payment_status]}>{order.payment_status}</Badge>
                      {order.account_grades && <Badge variant="outline">Grade {order.account_grades.grade}</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">{order.customer_name} — {order.customer_email} — {order.customer_phone}</p>
                    <p className="text-sm">{order.products?.name} {order.packages && `• ${order.packages.name} (${order.packages.quantity} akun)`}</p>
                    <p className="font-semibold text-primary">{formatRupiah(order.total_price)}</p>
                    {order.admin_notes && <p className="mt-1 text-xs italic text-muted-foreground">📝 {order.admin_notes}</p>}
                  </div>
                  <div className="flex flex-col gap-2">
                    {order.payment_proof_url && (
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => viewProof(order.payment_proof_url)}>
                        <Eye className="h-3 w-3" /> Lihat Bukti
                      </Button>
                    )}
                    {order.payment_status === "pending" && order.payment_proof_url && (
                      <Button size="sm" className="gap-1" onClick={() => { setReviewing(order); setAdminNotes(""); }}>
                        Review
                      </Button>
                    )}
                    {order.payment_status === "paid" && order.order_status !== "completed" && order.order_status !== "cancelled" && (
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => { setFulfilling(order); setFulfillNotes(""); setPickedCreds([]); }}>
                        <Send className="h-3 w-3" /> Kirim Manual
                      </Button>
                    )}
                    <Select value={order.payment_status} onValueChange={(v) => updateStatus.mutate({ id: order.id, field: "payment_status", value: v })}>
                      <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                        <SelectItem value="expired">Expired</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={order.order_status} onValueChange={(v) => updateStatus.mutate({ id: order.id, field: "order_status", value: v })}>
                      <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="processing">Processing</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Preview bukti transfer */}
      <Dialog open={!!previewUrl} onOpenChange={(v) => !v && setPreviewUrl(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Bukti Transfer</DialogTitle></DialogHeader>
          {previewUrl && (
            <div className="space-y-3">
              {previewIsPdf ? (
                <iframe src={previewUrl} title="Bukti transfer PDF" className="h-[70vh] w-full rounded-lg border" />
              ) : (
                <img src={previewUrl} alt="Bukti transfer" className="max-h-[70vh] w-full rounded-lg object-contain" />
              )}
              <Button asChild variant="outline" size="sm" className="w-full">
                <a href={previewUrl} target="_blank" rel="noopener noreferrer">Buka di tab baru</a>
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Manual fulfill modal */}
      <Dialog open={!!fulfilling} onOpenChange={(v) => !v && setFulfilling(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Kirim Akun Manual</DialogTitle></DialogHeader>
          {fulfilling && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted p-3 text-sm">
                <p><strong>{fulfilling.order_number}</strong> — {fulfilling.products?.name}</p>
                <p className="text-muted-foreground">{fulfilling.customer_name} • butuh {fulfilling.quantity} akun</p>
              </div>
              <div>
                <Label className="mb-2 block">Pilih akun (kosongkan = otomatis ambil dari stok)</Label>
                <div className="max-h-56 overflow-y-auto rounded-md border">
                  {!availableCreds || availableCreds.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">Tidak ada stok tersedia. Akan dikirim manual via catatan saja.</p>
                  ) : (
                    availableCreds.map((c: any) => {
                      const checked = pickedCreds.includes(c.id);
                      return (
                        <label key={c.id} className="flex cursor-pointer items-center gap-2 border-b px-3 py-2 text-sm hover:bg-muted/50 last:border-b-0">
                          <input type="checkbox" checked={checked} onChange={(e) => {
                            setPickedCreds((prev) => e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id));
                          }} />
                          <span className="flex-1 truncate">{c.email || c.id.slice(0, 8)}</span>
                          {c.account_grades?.grade && <Badge variant="outline" className="text-xs">G{c.account_grades.grade}</Badge>}
                        </label>
                      );
                    })
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Tersedia: {availableCreds?.length || 0} akun {fulfilling.grade_id ? "(grade sesuai)" : ""}</p>
              </div>
              <div>
                <Label>Catatan untuk pembeli (opsional)</Label>
                <Textarea value={fulfillNotes} onChange={(e) => setFulfillNotes(e.target.value)} placeholder="Mis: Detail akun: email@x.com / pass / 2FA: ..." rows={4} />
              </div>
              <Button className="w-full gap-2" disabled={fulfillMutation.isPending} onClick={() => fulfillMutation.mutate({ orderId: fulfilling.id, credentialIds: pickedCreds, notes: fulfillNotes })}>
                {fulfillMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4" /> Kirim & Simpan Catatan</>}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Review modal */}
      <Dialog open={!!reviewing} onOpenChange={(v) => !v && setReviewing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Review Pembayaran</DialogTitle></DialogHeader>
          {reviewing && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted p-3 text-sm">
                <p><strong>{reviewing.order_number}</strong></p>
                <p>{reviewing.customer_name} — {formatRupiah(reviewing.total_price)}</p>
              </div>
              <Button variant="outline" className="w-full gap-2" onClick={() => viewProof(reviewing.payment_proof_url)}>
                <Eye className="h-4 w-4" /> Lihat Bukti Transfer
              </Button>
              <div>
                <Label>Catatan admin (opsional)</Label>
                <Textarea value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} placeholder="Mis: Bukti tidak jelas, mohon upload ulang" rows={3} />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 gap-2 text-destructive" disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate({ id: reviewing.id, approve: false, notes: adminNotes })}>
                  {reviewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><X className="h-4 w-4" /> Tolak</>}
                </Button>
                <Button className="flex-1 gap-2 bg-green-600 hover:bg-green-700" disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate({ id: reviewing.id, approve: true, notes: adminNotes })}>
                  {reviewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4" /> Setujui</>}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
