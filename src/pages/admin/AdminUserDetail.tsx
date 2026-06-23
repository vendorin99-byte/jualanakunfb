import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, CheckCircle2, XCircle, Mail, Shield, Clock, User as UserIcon, Wallet, Loader2 } from "lucide-react";
import { toast } from "sonner";

type UserDetail = {
  id: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
  email_confirmed_at: string | null;
  phone_confirmed_at: string | null;
  last_sign_in_at: string | null;
  confirmation_sent_at: string | null;
  recovery_sent_at: string | null;
  email_change_sent_at: string | null;
  new_email: string | null;
  banned_until: string | null;
  is_anonymous: boolean;
  provider: string | null;
  providers: string[];
  app_metadata: Record<string, any>;
  user_metadata: Record<string, any>;
  identities: Array<{ provider: string; created_at: string; updated_at: string; last_sign_in_at: string; email: string | null }>;
  profile: any;
  orders: Array<{ id: string; order_number: string; total_price: number; payment_status: string; order_status: string; created_at: string }>;
  roles: string[];
  wallet: { balance: number; currency: string } | null;
};

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

function formatIDR(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

export default function AdminUserDetail() {
  const { id } = useParams<{ id: string }>();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [topupAmount, setTopupAmount] = useState(100000);
  const [topupLoading, setTopupLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke("admin-get-user", {
        body: null,
        method: "GET",
        headers: {},
      } as any);
      // functions.invoke doesn't easily pass query params; fall back to manual fetch
      let result = data;
      if (error || !data) {
        const { data: { session } } = await supabase.auth.getSession();
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-get-user?id=${id}`;
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        });
        if (!res.ok) {
          toast.error("Gagal memuat detail user");
          setLoading(false);
          return;
        }
        result = await res.json();
      }
      setUser(result);
      setLoading(false);
    };
    if (id) load();
  }, [id]);

  const handleAdminTopup = async () => {
    if (!user || topupAmount < 1000) return;
    setTopupLoading(true);
    try {
      const { data, error } = await supabase.rpc("admin_topup_user", {
        _user_id: user.id,
        _amount: topupAmount,
        _notes: "Admin manual top up",
      });
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      if (!result?.success) throw new Error(result?.message || "Gagal");
      toast.success(`Saldo +${formatIDR(topupAmount)} berhasil ditambahkan`);
      setUser((u) => u ? { ...u, wallet: { balance: result.new_balance, currency: "IDR" } } : u);
      setTopupAmount(100000);
    } catch (err: any) {
      toast.error("Gagal top up: " + err.message);
    } finally { setTopupLoading(false); }
  };

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;
  }

  if (!user) {
    return <div className="text-muted-foreground">User tidak ditemukan.</div>;
  }

  const verified = !!user.email_confirmed_at;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm"><Link to="/admin/users"><ArrowLeft className="h-4 w-4" /> Kembali</Link></Button>
      </div>

      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{user.user_metadata?.full_name || user.profile?.full_name || user.email}</h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {verified ? (
            <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" /> Email Verified</Badge>
          ) : (
            <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Belum Verifikasi</Badge>
          )}
          {user.roles.map((r) => (
            <Badge key={r} variant="secondary" className="gap-1"><Shield className="h-3 w-3" /> {r}</Badge>
          ))}
          {user.banned_until && <Badge variant="destructive">Banned</Badge>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base"><UserIcon className="mr-2 inline h-4 w-4" />Info Akun</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="User ID" value={<code className="text-xs">{user.id}</code>} />
            <Row label="Email" value={user.email || "—"} />
            <Row label="Telepon" value={user.phone || user.profile?.phone || "—"} />
            <Row label="Nama Lengkap" value={user.user_metadata?.full_name || user.profile?.full_name || "—"} />
            <Row label="Provider Utama" value={<span className="capitalize">{user.provider || "—"}</span>} />
            <Row label="Anonymous" value={user.is_anonymous ? "Ya" : "Tidak"} />
            <Row label="Saldo Wallet" value={user.wallet ? formatIDR(user.wallet.balance) : "—"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base"><Clock className="mr-2 inline h-4 w-4" />Riwayat Verifikasi & Aktivitas</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Daftar" value={fmt(user.created_at)} />
            <Row label="Update Terakhir" value={fmt(user.updated_at)} />
            <Row label="Email Terverifikasi" value={verified ? fmt(user.email_confirmed_at) : <span className="text-destructive">Belum</span>} />
            <Row label="Telepon Terverifikasi" value={user.phone_confirmed_at ? fmt(user.phone_confirmed_at) : "—"} />
            <Row label="Kirim Konfirmasi Terakhir" value={fmt(user.confirmation_sent_at)} />
            <Row label="Kirim Recovery Terakhir" value={fmt(user.recovery_sent_at)} />
            <Row label="Kirim Email Change Terakhir" value={fmt(user.email_change_sent_at)} />
            <Row label="Email Baru (Pending)" value={user.new_email || "—"} />
            <Row label="Login Terakhir" value={fmt(user.last_sign_in_at)} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base"><Mail className="mr-2 inline h-4 w-4" />Identities / Provider Terhubung</CardTitle></CardHeader>
        <CardContent>
          {user.identities.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tidak ada identity.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Terhubung</TableHead>
                  <TableHead>Login Terakhir</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {user.identities.map((i, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="capitalize">{i.provider}</TableCell>
                    <TableCell className="text-xs">{i.email || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmt(i.created_at)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmt(i.last_sign_in_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">User Metadata</CardTitle></CardHeader>
          <CardContent>
            <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(user.user_metadata, null, 2)}</pre>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">App Metadata</CardTitle></CardHeader>
          <CardContent>
            <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(user.app_metadata, null, 2)}</pre>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base"><Wallet className="mr-2 inline h-4 w-4" />Top Up Saldo (Admin)</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="mb-1 block text-xs">Nominal (Rp)</Label>
            <Input
              type="number"
              min={1000}
              max={50000000}
              step={1000}
              value={topupAmount}
              onChange={(e) => setTopupAmount(Number(e.target.value) || 0)}
              className="w-44"
            />
          </div>
          <Button onClick={handleAdminTopup} disabled={topupLoading || topupAmount < 1000} size="sm" className="gap-2">
            {topupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            Tambah Saldo
          </Button>
          <p className="text-xs text-muted-foreground">Saldo saat ini: <strong>{user.wallet ? formatIDR(user.wallet.balance) : "—"}</strong></p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Riwayat Order ({user.orders.length})</CardTitle></CardHeader>
        <CardContent>
          {user.orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada order.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Pembayaran</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tanggal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {user.orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs">{o.order_number}</TableCell>
                    <TableCell>{formatIDR(o.total_price)}</TableCell>
                    <TableCell><Badge variant={o.payment_status === "paid" ? "default" : "secondary"}>{o.payment_status}</Badge></TableCell>
                    <TableCell><Badge variant="outline">{o.order_status}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmt(o.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/50 py-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}