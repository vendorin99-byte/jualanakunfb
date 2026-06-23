import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Megaphone, Loader2, Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export default function AdminBroadcast() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");

  const send = useMutation({
    mutationFn: async () => {
      if (!title.trim() || !body.trim()) throw new Error("Judul dan isi wajib diisi");
      const { data, error } = await supabase.rpc("admin_broadcast_notification", {
        _title: title.trim(),
        _body: body.trim(),
        _link: link.trim() || null,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.success) throw new Error(row?.message || "Gagal");
      return row;
    },
    onSuccess: (row: any) => {
      toast.success(row.message || "Broadcast terkirim!");
      setTitle(""); setBody(""); setLink("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Broadcast Notifikasi</h1>
        <p className="text-sm text-muted-foreground">
          Kirim notifikasi ke semua user — muncul di bell icon di navbar.
        </p>
      </div>

      <Card className="border-0 shadow-md">
        <CardContent className="space-y-4 p-6">
          <div className="space-y-1.5">
            <Label>Judul</Label>
            <Input
              placeholder="Contoh: Flash Sale dimulai! 🔥"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Isi Pesan</Label>
            <Textarea
              placeholder="Contoh: Dapatkan diskon 20% untuk semua produk hari ini saja!"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={300}
              rows={3}
            />
            <p className="text-right text-xs text-muted-foreground">{body.length}/300</p>
          </div>
          <div className="space-y-1.5">
            <Label>Link (opsional)</Label>
            <Input
              placeholder="/products atau /orders-lookup"
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              URL tujuan saat user klik notifikasi. Contoh: /products?category=gaming
            </p>
          </div>

          {/* Preview */}
          {title && (
            <div className="rounded-xl border bg-muted/30 p-4">
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Preview</p>
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Bell className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{title || "Judul notifikasi"}</p>
                  {body && <p className="text-xs text-muted-foreground">{body}</p>}
                </div>
              </div>
            </div>
          )}

          <Button
            onClick={() => send.mutate()}
            disabled={send.isPending || !title.trim() || !body.trim()}
            className="w-full gap-2"
          >
            {send.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Megaphone className="h-4 w-4" />
            }
            Kirim ke Semua User
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
