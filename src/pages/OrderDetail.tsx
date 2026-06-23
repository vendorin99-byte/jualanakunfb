import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, useEffect } from "react";
import { ArrowLeft, Package, Clock, CheckCircle, XCircle, Copy, Check, Download, Lock, KeyRound, Upload, Loader2, FileImage, Star, Ban } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatRupiah, CATEGORY_EMOJI } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { WarrantyClaimDialog } from "@/components/WarrantyClaimDialog";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { ReviewForm } from "@/components/ReviewForm";
import { ShieldCheck } from "lucide-react";

function FieldRow({ label, icon, value, keyId, copy, copiedIdx, mono }: {
  label: string; icon: string; value: string; keyId: string;
  copy: (t: string, k: string) => void; copiedIdx: string | null; mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex w-24 items-center gap-1 text-xs text-muted-foreground">
        <span>{icon}</span> {label}
      </span>
      <code className={`flex-1 truncate rounded bg-background px-2 py-1.5 text-xs ${mono ? "font-mono" : ""}`}>{value}</code>
      <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => copy(value, keyId)}>
        {copiedIdx === keyId ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

function ProofInfoBox({ tone, message, proofPath, uploadedAt }: {
  tone: "pending" | "success";
  message: string;
  proofPath: string;
  uploadedAt: string | null;
}) {
  const fileName = proofPath.split("/").pop() || proofPath;
  const dateText = uploadedAt
    ? new Date(uploadedAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })
    : "-";
  const toneClass = tone === "pending"
    ? "bg-yellow-50 text-yellow-900 border-yellow-200"
    : "bg-green-50 text-green-900 border-green-200";
  return (
    <div className={`space-y-2 rounded-xl border p-4 text-sm ${toneClass}`}>
      <p>{message}</p>
      <div className="flex items-center gap-2 rounded-lg bg-background/70 p-2 text-xs">
        <FileImage className="h-4 w-4 shrink-0" />
        <code className="flex-1 truncate font-mono">{fileName}</code>
      </div>
      <p className="text-xs opacity-80">📅 Diunggah: {dateText}</p>
    </div>
  );
}

const STATUS_MAP = {
  pending: { label: "Menunggu Verifikasi", icon: Clock, color: "bg-yellow-100 text-yellow-800" },
  paid: { label: "Pembayaran Disetujui", icon: CheckCircle, color: "bg-green-100 text-green-800" },
  failed: { label: "Pembayaran Ditolak", icon: XCircle, color: "bg-red-100 text-red-800" },
  expired: { label: "Kedaluwarsa", icon: XCircle, color: "bg-muted text-muted-foreground" },
};

const ORDER_STATUS_MAP = {
  processing: { label: "Diproses", color: "bg-blue-100 text-blue-800" },
  completed: { label: "Selesai", color: "bg-green-100 text-green-800" },
  cancelled: { label: "Dibatalkan", color: "bg-red-100 text-red-800" },
};

export default function OrderDetail() {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const [copiedIdx, setCopiedIdx] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState<"idle" | "uploading" | "saving" | "success" | "error">("idle");

  const uploadProof = async (file: File) => {
    if (!user || !order) return;
    // Validasi sisi klien
    const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
    if (!ALLOWED.includes(file.type)) {
      toast.error("Format harus JPG, PNG, WEBP, atau PDF");
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error("Ukuran maksimal 5 MB");
      return;
    }
    // Rate limit sederhana (per browser, per order): 1 upload / 30 detik
    const rateKey = `proof-upload:${order.id}`;
    const last = Number(localStorage.getItem(rateKey) || 0);
    if (Date.now() - last < 30_000) {
      const wait = Math.ceil((30_000 - (Date.now() - last)) / 1000);
      toast.error(`Tunggu ${wait} detik sebelum kirim ulang.`);
      return;
    }
    setUploading(true);
    setUploadStage("uploading");
    setUploadProgress(0);
    // Progress simulasi (Supabase JS SDK belum expose progress event resmi)
    const progressTimer = setInterval(() => {
      setUploadProgress((p) => (p < 85 ? p + Math.random() * 12 : p));
    }, 250);
    try {
      // Path WAJIB diawali user_id agar RLS storage lulus
      const ext = file.name.split(".").pop() || "bin";
      const safeExt = ext.toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${user.id}/${order.id}/${Date.now()}.${safeExt}`;
      const { error: upErr } = await supabase.storage
        .from("payment-proofs")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      clearInterval(progressTimer);
      setUploadProgress(92);
      setUploadStage("saving");

      // Update order
      const { error: updErr } = await supabase
        .from("orders")
        .update({ payment_proof_url: path, payment_proof_uploaded_at: new Date().toISOString() })
        .eq("id", order.id);
      if (updErr) {
        // Rollback file kalau update gagal
        await supabase.storage.from("payment-proofs").remove([path]);
        throw updErr;
      }

      setUploadProgress(100);
      setUploadStage("success");
      localStorage.setItem(rateKey, String(Date.now()));
      toast.success("Bukti terkirim! Menunggu verifikasi admin.");
      setTimeout(() => {
        setPreviewFile(null);
        setUploadStage("idle");
        setUploadProgress(0);
        queryClient.invalidateQueries({ queryKey: ["order", orderNumber] });
      }, 800);
    } catch (err: any) {
      clearInterval(progressTimer);
      setUploadStage("error");
      setUploadProgress(0);
      toast.error("Gagal upload: " + (err.message || "unknown"));
    } finally {
      setUploading(false);
    }
  };

  const { data: order, isLoading } = useQuery({
    queryKey: ["order", orderNumber],
    queryFn: async () => {
      // Pakai SECURITY DEFINER function: PII di-mask kalau bukan owner/admin
      const { data: rows, error } = await supabase.rpc("get_order_by_number", { _order_number: orderNumber! });
      if (error) throw error;
      const o = Array.isArray(rows) ? rows[0] : rows;
      if (!o) return null;
      // Ambil produk + grade + paket via SECURITY DEFINER RPC supaya tetap muncul
      // walau produk sudah dinonaktifkan (RLS public hanya menampilkan status='active').
      const { data: infoRows } = await supabase.rpc("get_order_product_info", {
        _order_number: orderNumber!,
      });
      const info = Array.isArray(infoRows) ? infoRows[0] : infoRows;
      // Ambil tanggal upload bukti (tidak di-return oleh RPC)
      const { data: extra } = await supabase
        .from("orders")
        .select("payment_proof_uploaded_at")
        .eq("id", o.id)
        .maybeSingle();
      return {
        ...o,
        products: info
          ? {
              id: info.product_id,
              name: info.product_name,
              category: info.product_category,
              image_url: info.product_image_url,
              slug: info.product_slug,
              status: info.product_status,
            }
          : null,
        account_grades: info?.grade_label ? { grade: info.grade_label } : null,
        packages: info?.package_name ? { name: info.package_name, quantity: info.package_quantity } : null,
        payment_proof_uploaded_at: extra?.payment_proof_uploaded_at ?? null,
      };
    },
    enabled: !!orderNumber,
  });

  const { data: credentials } = useQuery({
    queryKey: ["order-credentials", order?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_credentials")
        .select("id, credentials_encrypted, email, password, twofa_secret, recovery_email, cookies, notes, created_at, updated_at, grade_id")
        .eq("sold_to_order", order!.id)
        .order("updated_at", { ascending: true });
      if (error) throw error;
      const gradeIds = Array.from(new Set((data || []).map((c: any) => c.grade_id).filter(Boolean)));
      let gradeMap: Record<string, string> = {};
      if (gradeIds.length > 0) {
        const { data: grades } = await supabase
          .from("account_grades")
          .select("id, grade")
          .in("id", gradeIds);
        gradeMap = Object.fromEntries((grades || []).map((g: any) => [g.id, g.grade]));
      }
      return (data || []).map((c: any) => ({ ...c, grade_label: c.grade_id ? gradeMap[c.grade_id] : null }));
    },
    enabled: !!order && order.payment_status === "paid",
  });

  const handleCancel = async () => {
    if (!order) return;
    setCancelling(true);
    const { data, error } = await supabase.rpc("user_cancel_order", { _order_id: order.id });
    setCancelling(false);
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row?.success) { toast.error(row?.message || error?.message || "Gagal membatalkan"); return; }
    toast.success("Order berhasil dibatalkan");
    setCancelOpen(false);
    queryClient.invalidateQueries({ queryKey: ["order", orderNumber] });
    queryClient.invalidateQueries({ queryKey: ["my-orders"] });
  };

  // Auto-prompt review sekali setelah order selesai
  useEffect(() => {
    if (!order || order.order_status !== "completed" || !user) return;
    const key = `review-prompted-${order.id}`;
    if (localStorage.getItem(key)) return;
    const timer = setTimeout(() => {
      setReviewOpen(true);
      localStorage.setItem(key, "1");
    }, 1500);
    return () => clearTimeout(timer);
  }, [order?.id, order?.order_status, user]);

  // Ambil field terstruktur jika ada, fallback parse dari credentials_encrypted
  const getFields = (c: any) => {
    if (c.email || c.password) {
      return {
        email: c.email || "",
        password: c.password || "",
        twofa: c.twofa_secret || "",
        recovery: c.recovery_email || "",
        cookies: c.cookies || "",
        notes: c.notes || "",
      };
    }
    // Fallback: data lama format "email:password"
    const raw = c.credentials_encrypted || "";
    const idx = raw.indexOf(":");
    if (idx < 0) return { email: raw, password: "", twofa: "", recovery: "", cookies: "", notes: "" };
    return { email: raw.slice(0, idx).trim(), password: raw.slice(idx + 1).trim(), twofa: "", recovery: "", cookies: "", notes: "" };
  };

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(key);
    toast.success("Disalin");
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  const downloadAll = () => {
    if (!credentials || !order) return;
    const lines = credentials.map((c, i) => {
      const f = getFields(c);
      const parts = [
        `# Akun ${i + 1}`,
        f.email && `Email    : ${f.email}`,
        f.password && `Password : ${f.password}`,
        f.twofa && `2FA Key  : ${f.twofa}`,
        f.recovery && `Recovery : ${f.recovery}`,
        f.cookies && `Cookies  : ${f.cookies}`,
        f.notes && `Notes    : ${f.notes}`,
      ].filter(Boolean);
      return parts.join("\n");
    }).join("\n\n");
    const content = `# Order ${order.order_number}\n# Total akun: ${credentials.length}\n# Tanggal: ${new Date().toLocaleString("id-ID")}\n\n${lines}\n`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${order.order_number}-akun.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("File diunduh");
  };

  const downloadOne = (c: any, idx: number) => {
    if (!order) return;
    const f = getFields(c);
    const content = [
      f.email && `Email    : ${f.email}`,
      f.password && `Password : ${f.password}`,
      f.twofa && `2FA Key  : ${f.twofa}`,
      f.recovery && `Recovery : ${f.recovery}`,
      f.cookies && `Cookies  : ${f.cookies}`,
      f.notes && `Notes    : ${f.notes}`,
    ].filter(Boolean).join("\n") || c.credentials_encrypted || "";
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${order.order_number}-akun-${idx + 1}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="mb-4 h-8 w-48" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="container mx-auto flex flex-col items-center px-4 py-20">
        <span className="mb-4 text-5xl">❌</span>
        <h1 className="mb-2 text-2xl font-bold">Pesanan Tidak Ditemukan</h1>
        <p className="mb-6 text-muted-foreground">Pastikan nomor pesanan sudah benar</p>
        <Link to="/products"><Button>Kembali ke Produk</Button></Link>
      </div>
    );
  }

  const payStatus = STATUS_MAP[order.payment_status];
  const ordStatus = ORDER_STATUS_MAP[order.order_status];
  const product = order.products as any;
  const grade = (order as any).account_grades;
  const pkg = (order as any).packages;

  return (
    <div className="container mx-auto px-4 py-8">
      <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Kembali ke Beranda
      </Link>
      <h1 className="mb-8 text-2xl font-bold">Detail Pesanan</h1>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-0 shadow-lg">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              <code className="text-lg font-bold">{order.order_number}</code>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${payStatus.color}`}>
                <payStatus.icon className="h-3 w-3" />
                {payStatus.label}
              </span>
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${ordStatus.color}`}>
                {ordStatus.label}
              </span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Nama</span><span>{order.customer_name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{order.customer_email}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">WhatsApp</span><span>{order.customer_phone}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Jumlah</span><span>{order.quantity}</span></div>
              <div className="flex justify-between border-t pt-2">
                <span className="font-bold">Total</span>
                <span className="text-lg font-bold text-primary">{formatRupiah(order.total_price)}</span>
              </div>
            </div>

            {order.payment_status === "pending" && order.payment_proof_url && (
              <ProofInfoBox
                tone="pending"
                message="⏳ Bukti transfer kamu sedang diverifikasi admin. Cek email berkala untuk update status."
                proofPath={order.payment_proof_url}
                uploadedAt={order.payment_proof_uploaded_at}
              />
            )}
            {order.payment_status === "paid" && order.payment_proof_url && (
              <ProofInfoBox
                tone="success"
                message="✅ Bukti pembayaran sudah disetujui admin."
                proofPath={order.payment_proof_url}
                uploadedAt={order.payment_proof_uploaded_at}
              />
            )}
            {order.payment_status === "pending" && !order.payment_proof_url && user && (
              <div className="space-y-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4 text-sm">
                <div>
                  <p className="font-semibold text-foreground">📤 Upload Bukti Pembayaran</p>
                  <p className="text-xs text-muted-foreground">Format: JPG, PNG, WEBP, PDF — maksimal 5 MB.</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setPreviewFile(f);
                    e.target.value = "";
                  }}
                />
                {previewFile ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 rounded-lg border bg-background p-2 text-xs">
                      <FileImage className="h-4 w-4 text-primary" />
                      <span className="flex-1 truncate">{previewFile.name}</span>
                      <span className="text-muted-foreground">{(previewFile.size / 1024).toFixed(0)} KB</span>
                    </div>
                    {uploadStage !== "idle" && (
                      <div className="space-y-1">
                        <Progress value={uploadProgress} className="h-2" />
                        <p className="text-xs text-muted-foreground">
                          {uploadStage === "uploading" && `Mengunggah file... ${Math.round(uploadProgress)}%`}
                          {uploadStage === "saving" && "Menyimpan ke pesanan..."}
                          {uploadStage === "success" && "✅ Berhasil terkirim!"}
                          {uploadStage === "error" && "❌ Gagal mengirim, coba lagi."}
                        </p>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        disabled={uploading}
                        onClick={() => setPreviewFile(null)}
                      >
                        Batal
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 gap-2"
                        disabled={uploading}
                        onClick={() => uploadProof(previewFile)}
                      >
                        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                        {uploading ? "Mengirim..." : "Kirim Bukti"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4" /> Pilih File Bukti
                  </Button>
                )}
              </div>
            )}
            {order.payment_status === "failed" && order.payment_proof_url === null && (
              <div className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">
                Upload ulang bukti tidak tersedia. Silakan buat order baru jika ingin coba lagi.
              </div>
            )}
            {order.payment_status === "failed" && (
              <div className="rounded-xl bg-red-50 p-4 text-sm text-red-900">
                ❌ Pembayaran ditolak.
                {order.admin_notes && <p className="mt-1 italic">Catatan admin: {order.admin_notes}</p>}
              </div>
            )}

            {order.payment_status === "pending" && order.order_status !== "cancelled" && user && (
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 border-destructive text-destructive hover:bg-destructive/10"
                onClick={() => setCancelOpen(true)}
              >
                <Ban className="h-4 w-4" /> Batalkan Pesanan
              </Button>
            )}
          </CardContent>
        </Card>

        {product && (
          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <h3 className="mb-4 font-bold">Produk</h3>
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-muted text-3xl">
                  {CATEGORY_EMOJI[product.category] || '📦'}
                </div>
                <div>
                  <p className="font-semibold">{product.name}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge variant="outline" className="uppercase">{product.category}</Badge>
                    {grade && <Badge>Grade {grade.grade}</Badge>}
                  </div>
                </div>
              </div>
              {pkg && (
                <p className="mt-3 text-sm text-muted-foreground">
                  Paket: <span className="font-medium text-foreground">{pkg.name}</span> ({pkg.quantity} akun)
                </p>
              )}
              {order.payment_status === "paid" && order.order_status !== "completed" && (
                <div className="mt-6 rounded-xl bg-success/10 p-4">
                  <p className="mb-1 text-sm font-medium text-success">✅ Pembayaran disetujui!</p>
                  <p className="text-xs text-muted-foreground">
                    Kredensial sedang disiapkan. Refresh halaman ini sebentar lagi.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {order.payment_status === "paid" && credentials && credentials.length > 0 && (
          <Card className="border-0 shadow-lg md:col-span-2">
            <CardContent className="p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-primary" />
                  <h3 className="font-bold">
                    Akun Terkirim ({credentials.length}
                    {order.quantity > credentials.length ? ` / ${order.quantity}` : ""})
                  </h3>
                </div>
                <Button size="sm" variant="outline" className="gap-2 rounded-lg" onClick={downloadAll}>
                  <Download className="h-4 w-4" /> Download .txt
                </Button>
              </div>
              {order.quantity > credentials.length && (
                <div className="mb-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-xs text-yellow-900">
                  ⏳ {credentials.length} dari {order.quantity} akun sudah dikirim. Sisanya akan otomatis dikirim ulang ke pesanan ini begitu stok tersedia kembali.
                </div>
              )}
              <div className="mb-3 rounded-lg border border-accent/30 bg-accent/10 p-3 text-xs text-foreground/80">
                ⚠️ Simpan kredensial ini dengan aman. Untuk keamanan, segera ganti password setelah login pertama.
              </div>
              <div className="space-y-3">
                {credentials.map((c, idx) => {
                  const f = getFields(c);
                  const deliveredAt = c.updated_at || c.created_at;
                  return (
                    <div key={c.id} className="rounded-xl border bg-muted/30 p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className="rounded-md">Akun #{idx + 1}</Badge>
                          {c.grade_label && <Badge variant="outline">Grade {c.grade_label}</Badge>}
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            Dikirim {new Date(deliveredAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1 text-xs"
                          onClick={() => downloadOne(c, idx)}
                        >
                          <Download className="h-3 w-3" /> .txt
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {f.email && (
                          <FieldRow label="Email" icon="📧" value={f.email} keyId={`e${idx}`} copy={copy} copiedIdx={copiedIdx} />
                        )}
                        {f.password && (
                          <FieldRow label="Password" icon="🔑" value={f.password} keyId={`p${idx}`} copy={copy} copiedIdx={copiedIdx} />
                        )}
                        {f.twofa && (
                          <FieldRow label="2FA" icon="🔐" value={f.twofa} keyId={`t${idx}`} copy={copy} copiedIdx={copiedIdx} mono />
                        )}
                        {f.recovery && (
                          <FieldRow label="Recovery" icon="🛟" value={f.recovery} keyId={`r${idx}`} copy={copy} copiedIdx={copiedIdx} />
                        )}
                        {f.cookies && (
                          <FieldRow label="Cookies" icon="🍪" value={f.cookies} keyId={`c${idx}`} copy={copy} copiedIdx={copiedIdx} />
                        )}
                        {f.notes && (
                          <p className="rounded-md bg-background/60 p-2 text-xs italic text-muted-foreground">📝 {f.notes}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {order.payment_status === "paid" && (
          <Card className="border-0 bg-gradient-to-br from-primary/5 to-accent/5 shadow-lg md:col-span-2">
            <CardContent className="space-y-3 p-6">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <h3 className="font-bold">Garansi & Bantuan</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Ada masalah dengan akun? Ajukan klaim garansi via WhatsApp — admin akan menerima detail order kamu secara otomatis.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <WarrantyClaimDialog order={order as any} />
                <WhatsAppButton
                  label="Tanya Admin"
                  variant="outline"
                  message={`Halo Admin, saya ingin bertanya tentang order ${order.order_number}`}
                  className="w-full"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {order.order_status === "completed" && product?.id && user && (
          <div className="md:col-span-2">
            <ReviewForm productId={product.id} orderId={order.id} />
          </div>
        )}
      </div>

      {/* Cancel order dialog */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Batalkan pesanan ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Order <strong>{order?.order_number}</strong> akan dibatalkan. Tindakan ini tidak bisa dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Tidak</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Ya, Batalkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Auto review prompt dialog */}
      {product?.id && (
        <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                Bagaimana pengalamanmu?
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Pesananmu sudah selesai! Yuk berikan ulasan untuk membantu pembeli lain.
            </p>
            <ReviewForm
              productId={product.id}
              orderId={order.id}
              onSuccess={() => setReviewOpen(false)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
