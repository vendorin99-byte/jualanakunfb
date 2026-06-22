import { useState } from "react";
import { z } from "zod";
import { Loader2, ShieldCheck, Upload, FileImage, X, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ISSUE_TYPES = [
  "Akun tidak bisa login",
  "Password berubah",
  "Akun ter-banned / suspended",
  "2FA / verifikasi bermasalah",
  "Lainnya",
];

const schema = z.object({
  issue_type: z.enum(ISSUE_TYPES as [string, ...string[]]),
  description: z.string().trim().min(10, "Minimal 10 karakter").max(500, "Maksimal 500 karakter"),
});

interface Order {
  id: string;
  order_number: string;
  customer_email: string;
  created_at: string;
  products?: { name?: string } | null;
}

interface Props {
  order: Order;
}

export function WarrantyClaimDialog({ order }: Props) {
  const [open, setOpen] = useState(false);
  const [issueType, setIssueType] = useState<string>("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handlePickFile = (f: File | null) => {
    if (!f) { setFile(null); return; }
    const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
    if (!ALLOWED.includes(f.type)) { toast.error("Hanya JPG, PNG, atau WEBP"); return; }
    if (f.size > 5 * 1024 * 1024) { toast.error("Maksimal 5 MB"); return; }
    setFile(f);
  };

  const handleSubmit = async () => {
    const parsed = schema.safeParse({ issue_type: issueType, description });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0]?.message || "Form tidak valid");
      return;
    }

    setSubmitting(true);
    try {
      let proofUrl = "";
      if (file) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          toast.error("Silakan login untuk mengunggah bukti.");
          setSubmitting(false);
          return;
        }
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
        const path = `${user.id}/${order.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("warranty-proofs")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        const { data: signed } = await supabase.storage
          .from("warranty-proofs")
          .createSignedUrl(path, 60 * 60 * 24 * 7);
        proofUrl = signed?.signedUrl || "";
      }

      const productName = order.products?.name || "-";
      const tanggal = new Date(order.created_at).toLocaleDateString("id-ID", {
        day: "numeric", month: "long", year: "numeric",
      });

      const lines = [
        `🛡️ Klaim Garansi — No. Order: ${order.order_number}`,
        `Produk: ${productName}`,
        `Tanggal Order: ${tanggal}`,
        `Email: ${order.customer_email}`,
        ``,
        `Masalah: ${parsed.data.issue_type}`,
        `Deskripsi: ${parsed.data.description}`,
      ];
      if (proofUrl) {
        lines.push(``, `Bukti: ${proofUrl}`);
      }

      const { data, error } = await supabase.rpc("send_chat_message", {
        _content: lines.join("\n"),
      });
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row?.success) {
        throw new Error(row?.message || error?.message || "Gagal mengirim pesan");
      }

      toast.success("Klaim garansi terkirim ke live chat! Admin akan segera membalas.");
      setOpen(false);
      setIssueType(""); setDescription(""); setFile(null);

      // Buka chat widget
      window.dispatchEvent(new CustomEvent("open-chat-widget"));
    } catch (err: any) {
      toast.error("Gagal: " + (err.message || "unknown"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full gap-2 bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90">
          <ShieldCheck className="h-4 w-4" /> Ajukan Klaim Garansi
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Klaim Garansi</DialogTitle>
          <DialogDescription>
            Isi form berikut, klaim akan dikirim langsung ke live chat admin.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Jenis Masalah</Label>
            <Select value={issueType} onValueChange={setIssueType}>
              <SelectTrigger><SelectValue placeholder="Pilih jenis masalah" /></SelectTrigger>
              <SelectContent>
                {ISSUE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Deskripsi Masalah</Label>
            <Textarea
              placeholder="Jelaskan masalah yang kamu alami..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={4}
            />
            <p className="text-right text-xs text-muted-foreground">{description.length}/500</p>
          </div>

          <div className="space-y-1.5">
            <Label>Bukti (opsional)</Label>
            {file ? (
              <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-2 text-xs">
                <FileImage className="h-4 w-4 text-primary" />
                <span className="flex-1 truncate">{file.name}</span>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setFile(null)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed py-3 text-sm text-muted-foreground hover:bg-muted/30">
                <Upload className="h-4 w-4" />
                Upload screenshot (JPG/PNG, max 5MB)
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => handlePickFile(e.target.files?.[0] || null)}
                />
              </label>
            )}
          </div>

          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full gap-2 bg-gradient-to-r from-primary to-accent text-primary-foreground"
          >
            {submitting
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <MessageCircle className="h-4 w-4" />
            }
            Kirim ke Live Chat
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
