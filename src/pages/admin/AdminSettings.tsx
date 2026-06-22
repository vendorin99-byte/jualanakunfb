import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, MessageCircle, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppSettings } from "@/hooks/use-app-settings";
import { toast } from "sonner";

export default function AdminSettings() {
  const { data, isLoading } = useAppSettings();
  const qc = useQueryClient();
  const [whatsapp, setWhatsapp] = useState("");
  const [hours, setHours] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      setWhatsapp(data.whatsapp_admin_number || "");
      setHours(data.operational_hours || "");
      setAdminEmail(data.admin_notification_email || "");
    }
  }, [data]);

  const handleSave = async () => {
    if (whatsapp && !/^[0-9]{10,15}$/.test(whatsapp)) {
      toast.error("Format nomor: 10-15 digit, tanpa + atau spasi (contoh: 628123456789)");
      return;
    }
    if (adminEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
      toast.error("Format email notifikasi tidak valid");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("app_settings").upsert([
        { key: "whatsapp_admin_number", value: whatsapp, updated_at: new Date().toISOString() },
        { key: "operational_hours", value: hours, updated_at: new Date().toISOString() },
        { key: "admin_notification_email", value: adminEmail, updated_at: new Date().toISOString() },
      ]);
      if (error) throw error;
      toast.success("Pengaturan tersimpan");
      qc.invalidateQueries({ queryKey: ["app-settings"] });
    } catch (err: any) {
      toast.error("Gagal simpan: " + (err.message || "unknown"));
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pengaturan</h1>
        <p className="text-sm text-muted-foreground">Kontak dan informasi umum yang dipakai di seluruh situs.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-primary" /> WhatsApp Admin</CardTitle>
          <CardDescription>Nomor ini dipakai untuk tombol kontak dan klaim garansi di halaman order.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="wa">Nomor WhatsApp</Label>
            <Input
              id="wa"
              placeholder="628123456789"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value.replace(/[^0-9]/g, ""))}
              maxLength={15}
            />
            <p className="text-xs text-muted-foreground">Format internasional tanpa tanda + (contoh: 628123456789). Kosongkan untuk menyembunyikan tombol WA.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hours">Jam Operasional</Label>
            <Input
              id="hours"
              placeholder="Senin - Minggu, 09:00 - 22:00 WIB"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              maxLength={100}
            />
            <p className="text-xs text-muted-foreground">Ditampilkan di footer.</p>
          </div>

          <Button onClick={handleSave} disabled={saving} className="gap-2 bg-gradient-to-r from-primary to-accent text-primary-foreground">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Simpan
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5 text-primary" /> Notifikasi Email Admin</CardTitle>
          <CardDescription>Email ini akan menerima notifikasi saat ada order baru masuk dan bukti bayar diunggah.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="adminEmail">Email Notifikasi</Label>
            <Input
              id="adminEmail"
              type="email"
              placeholder="admin@jualanakunfb.my.id"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value.trim())}
            />
            <p className="text-xs text-muted-foreground">
              Notifikasi dikirim otomatis saat: order baru masuk &amp; customer upload bukti bayar. Kosongkan untuk menonaktifkan.
            </p>
          </div>

          <Button onClick={handleSave} disabled={saving} className="gap-2 bg-gradient-to-r from-primary to-accent text-primary-foreground">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Simpan
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}