import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { formatRupiah } from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Wallet, Loader2, CreditCard, Copy, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const PRESETS = [50000, 100000, 250000, 500000, 1000000, 2000000];

const BANK_INFO = {
  bank: "BCA",
  account: "1234567890",
  name: "PT Jualan Akun Indonesia",
};

export default function TopUp() {
  const navigate = useNavigate();
  const { user, balance, loading: authLoading } = useAuth();
  const [amount, setAmount] = useState<number>(100000);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (!authLoading && !user) { navigate("/auth?redirect=/topup"); return null; }

  const copyAccount = () => {
    navigator.clipboard.writeText(BANK_INFO.account);
    toast.success("Nomor rekening disalin");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (amount < 10000) { toast.error("Minimal topup Rp 10.000"); return; }
    if (amount > 50_000_000) { toast.error("Maksimal topup Rp 50.000.000"); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("submit_topup_request", {
        _amount: amount,
        _payment_method: "bank_transfer",
      });
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      if (!result?.success) throw new Error(result?.message || "Gagal mengirim permintaan");
      setDone(true);
    } catch (err: any) {
      toast.error("Gagal: " + err.message);
    } finally { setLoading(false); }
  };

  if (done) {
    return (
      <div className="container mx-auto flex max-w-md flex-col items-center px-4 py-20">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h1 className="mb-2 text-2xl font-bold">Permintaan Terkirim!</h1>
        <p className="mb-6 text-center text-muted-foreground">
          Segera transfer <strong>{formatRupiah(amount)}</strong> ke rekening di bawah. Admin akan mengonfirmasi dan menambahkan saldo dalam 1×24 jam.
        </p>
        <Card className="mb-6 w-full border-0 shadow-lg">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Bank</span><span className="font-bold">{BANK_INFO.bank}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">No. Rekening</span>
              <span className="flex items-center gap-2 font-mono font-bold">
                {BANK_INFO.account}
                <button onClick={copyAccount} className="text-primary hover:opacity-70"><Copy className="h-4 w-4" /></button>
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Atas Nama</span><span className="font-semibold">{BANK_INFO.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Jumlah Transfer</span><span className="text-lg font-bold text-primary">{formatRupiah(amount)}</span>
            </div>
          </CardContent>
        </Card>
        <p className="mb-6 text-center text-sm text-muted-foreground">
          Hubungi admin via <strong>Live Chat</strong> setelah transfer untuk mempercepat konfirmasi.
        </p>
        <div className="flex gap-3">
          <Link to="/wallet"><Button variant="outline">Riwayat Saldo</Button></Link>
          <Link to="/"><Button>Ke Beranda</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-xl px-4 py-6 pb-24">
      <Link to="/profile" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Kembali
      </Link>

      <Card className="mb-6 border-0 bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-xl">
        <CardContent className="p-6">
          <p className="flex items-center gap-2 text-sm opacity-80"><Wallet className="h-4 w-4" /> Saldo saat ini</p>
          <p className="mt-2 text-3xl font-extrabold">{formatRupiah(balance)}</p>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-lg">
        <CardContent className="p-6">
          <h1 className="mb-1 flex items-center gap-2 text-xl font-bold"><CreditCard className="h-5 w-5" /> Top Up Saldo</h1>
          <p className="mb-5 text-sm text-muted-foreground">Transfer ke rekening kami, admin akan konfirmasi dan tambah saldo.</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <Label className="mb-2 block">Pilih nominal</Label>
              <div className="grid grid-cols-3 gap-2">
                {PRESETS.map((v) => (
                  <button
                    type="button"
                    key={v}
                    onClick={() => setAmount(v)}
                    className={`rounded-xl border p-3 text-sm font-semibold transition-colors ${
                      amount === v ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"
                    }`}
                  >
                    {formatRupiah(v)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="amt">Atau masukkan nominal</Label>
              <Input id="amt" type="number" min={10000} max={50000000} step={1000} value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} />
              <p className="mt-1 text-xs text-muted-foreground">Min Rp 10.000 — Max Rp 50.000.000</p>
            </div>

            <Card className="border border-dashed border-muted-foreground/30 bg-muted/40">
              <CardContent className="space-y-2 p-4 text-sm">
                <p className="font-semibold">Info Rekening Transfer</p>
                <div className="flex justify-between"><span className="text-muted-foreground">Bank</span><span className="font-bold">{BANK_INFO.bank}</span></div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">No. Rek</span>
                  <span className="flex items-center gap-2 font-mono font-bold">
                    {BANK_INFO.account}
                    <button type="button" onClick={copyAccount} className="text-primary hover:opacity-70"><Copy className="h-3.5 w-3.5" /></button>
                  </span>
                </div>
                <div className="flex justify-between"><span className="text-muted-foreground">Atas Nama</span><span className="font-semibold">{BANK_INFO.name}</span></div>
              </CardContent>
            </Card>

            <Button type="submit" disabled={loading || amount < 10000} className="w-full gap-2 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90" size="lg">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Mengirim...</> : <>Konfirmasi Top Up {formatRupiah(amount)}</>}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
