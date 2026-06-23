import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Wallet, ShoppingBag, Tag, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCartStore } from "@/store/cart";
import { useAuth } from "@/hooks/use-auth";
import { formatRupiah, CATEGORY_EMOJI } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PromoBannerSlot } from "@/components/PromoBannerSlot";
import { toast } from "sonner";

type Grade = { id: string; grade: string; description: string | null; base_price: number; product_id: string };
type Pkg = { id: string; name: string; quantity: number; price: number; grade_id: string };

export default function Checkout() {
  const navigate = useNavigate();
  const { items, clearCart } = useCartStore();
  const { user, balance, refreshBalance, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [selectedGrade, setSelectedGrade] = useState("");
  const [selectedPkg, setSelectedPkg] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [promoInput, setPromoInput] = useState("");
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [promoMsg, setPromoMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [checkingPromo, setCheckingPromo] = useState(false);

  const item = items[0];

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth?redirect=/checkout");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!item) return;
    supabase.from("account_grades").select("*").eq("product_id", item.id).eq("is_active", true).order("grade")
      .then(({ data }) => setGrades((data as any) || []));
  }, [item?.id]);

  useEffect(() => {
    if (!selectedGrade) { setPackages([]); setSelectedPkg(""); return; }
    supabase.from("packages").select("*").eq("grade_id", selectedGrade).eq("is_active", true).order("quantity")
      .then(({ data }) => { setPackages((data as any) || []); setSelectedPkg(""); });
  }, [selectedGrade]);

  if (!item) {
    return (
      <div className="container mx-auto flex flex-col items-center px-4 py-20">
        <span className="mb-4 text-5xl">🛒</span>
        <h1 className="mb-2 text-2xl font-bold">Keranjang Kosong</h1>
        <Link to="/products"><Button>Lihat Produk</Button></Link>
      </div>
    );
  }

  const pkg = packages.find((p) => p.id === selectedPkg);
  const grade = grades.find((g) => g.id === selectedGrade);
  const basePrice = pkg ? pkg.price : grade ? grade.base_price * item.quantity : item.price * item.quantity;
  const totalPrice = Math.max(0, basePrice - promoDiscount);
  const finalQty = pkg ? pkg.quantity : item.quantity;
  const insufficient = totalPrice > balance;

  const applyPromo = async () => {
    if (!promoInput.trim()) return;
    setCheckingPromo(true);
    setPromoMsg(null);
    const { data } = await supabase
      .from("promos")
      .select("id, discount_type, discount_value, min_purchase, max_uses, used_count, ends_at")
      .eq("is_active", true)
      .ilike("code", promoInput.trim())
      .maybeSingle();
    setCheckingPromo(false);
    if (!data) { setPromoMsg({ text: "Kode promo tidak valid", ok: false }); return; }
    if (data.max_uses != null && data.used_count >= data.max_uses) {
      setPromoMsg({ text: "Kuota promo sudah habis", ok: false }); return;
    }
    if (data.ends_at && new Date(data.ends_at) < new Date()) {
      setPromoMsg({ text: "Promo sudah kadaluwarsa", ok: false }); return;
    }
    if (basePrice < data.min_purchase) {
      setPromoMsg({ text: `Minimum pembelian ${formatRupiah(data.min_purchase)}`, ok: false }); return;
    }
    const disc = data.discount_type === "percent"
      ? Math.floor(basePrice * data.discount_value / 100)
      : Math.min(data.discount_value, basePrice);
    setPromoDiscount(disc);
    setPromoCode(promoInput.trim().toUpperCase());
    setPromoMsg({ text: `Hemat ${formatRupiah(disc)}!`, ok: true });
  };

  const removePromo = () => {
    setPromoCode(""); setPromoInput(""); setPromoDiscount(0); setPromoMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (grades.length > 0 && !selectedGrade) { toast.error("Pilih grade dulu"); return; }
    if (totalPrice <= 0) { toast.error("Total tidak valid"); return; }
    if (insufficient) { toast.error("Saldo tidak cukup. Top up dulu."); return; }

    setLoading(true);
    try {
      // Server-side purchase (server hitung harga & kurangi saldo dengan locking)
      const { data, error } = await supabase.rpc("purchase_with_wallet", {
        _product_id: item.id,
        _quantity: item.quantity,
        _grade_id: selectedGrade || null,
        _package_id: selectedPkg || null,
        _customer_name: null,
        _customer_phone: null,
        _promo_code: promoCode || null,
      });
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      if (!result?.success) throw new Error(result?.message || "Gagal memproses pembelian");

      await refreshBalance();
      toast.success("Pembelian berhasil!");
      navigate(`/order-success?orders=${result.order_number}`);
      clearCart();

      // Kirim email kredensial jika order sudah completed (stok tersedia) — fire and forget
      supabase
        .from("account_credentials")
        .select("email, password, twofa_secret, recovery_email, notes, account_grades(grade)")
        .eq("sold_to_order", result.order_id)
        .then(({ data: creds }) => {
          if (creds && creds.length > 0) {
            const gradeLabel = (creds[0] as any)?.account_grades?.grade
              ? `Grade ${(creds[0] as any).account_grades.grade}` : null;
            supabase.functions.invoke("send-email", {
              body: {
                to: user.email,
                subject: `Akun kamu siap! Order #${result.order_number}`,
                template: "order-credentials",
                data: {
                  orderNumber: result.order_number,
                  customerName: user.email?.split("@")[0],
                  credentials: creds.map((c: any) => ({
                    email: c.email,
                    password: c.password,
                    twofa: c.twofa_secret,
                    recovery: c.recovery_email,
                    notes: c.notes,
                    grade_label: c.account_grades?.grade ? `Grade ${c.account_grades.grade}` : gradeLabel,
                  })),
                },
              },
            }).catch(() => {});
          }
        })
        .catch(() => {});
    } catch (err: any) {
      toast.error("Gagal: " + err.message);
    } finally { setLoading(false); }
  };

  return (
    <div className="container mx-auto px-4 py-8 pb-24">
      <Link to="/cart" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Kembali
      </Link>
      <h1 className="mb-6 text-2xl font-bold">Checkout</h1>

      <PromoBannerSlot placement="cart_checkout" className="mb-6" />

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={handleSubmit} className="space-y-5">
          <Card className="border-0 bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-lg">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="flex items-center gap-2 text-sm opacity-80"><Wallet className="h-4 w-4" /> Saldo kamu</p>
                <p className="mt-1 text-2xl font-bold">{formatRupiah(balance)}</p>
              </div>
              <Link to="/topup"><Button variant="secondary" size="sm" className="rounded-xl">Top Up</Button></Link>
            </CardContent>
          </Card>

          {grades.length > 0 && (
            <Card className="border-0 shadow-lg">
              <CardContent className="space-y-4 p-6">
                <h3 className="font-bold">Pilih Grade & Paket</h3>
                <div>
                  <Select value={selectedGrade} onValueChange={setSelectedGrade}>
                    <SelectTrigger><SelectValue placeholder="Pilih grade..." /></SelectTrigger>
                    <SelectContent>
                      {grades.map((g) => (
                        <SelectItem key={g.id} value={g.id}>Grade {g.grade} {g.description ? `— ${g.description}` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedGrade && (
                  <div className="grid gap-2">
                    {packages.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Belum ada paket.</p>
                    ) : packages.map((p) => (
                      <button type="button" key={p.id} onClick={() => setSelectedPkg(p.id)}
                        className={`flex items-center justify-between rounded-xl border p-3 text-left transition-colors ${selectedPkg === p.id ? "border-primary bg-primary/5" : "hover:bg-muted"}`}>
                        <div>
                          <p className="font-semibold">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{p.quantity} akun</p>
                        </div>
                        <span className="font-bold text-primary">{formatRupiah(p.price)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Promo Code */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 space-y-2">
              <p className="text-sm font-medium flex items-center gap-1.5"><Tag className="h-4 w-4 text-primary" /> Kode Promo</p>
              {promoCode ? (
                <div className="flex items-center justify-between rounded-lg bg-green-50 px-3 py-2 text-sm dark:bg-green-900/20">
                  <span className="font-mono font-semibold text-green-700 dark:text-green-300">{promoCode}</span>
                  <button onClick={removePromo} className="text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    placeholder="Masukkan kode promo"
                    value={promoInput}
                    onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && applyPromo()}
                    className="font-mono uppercase"
                  />
                  <Button type="button" variant="outline" onClick={applyPromo} disabled={checkingPromo || !promoInput.trim()}>
                    {checkingPromo ? <Loader2 className="h-4 w-4 animate-spin" /> : "Pakai"}
                  </Button>
                </div>
              )}
              {promoMsg && (
                <p className={`text-xs ${promoMsg.ok ? "text-green-600" : "text-destructive"}`}>{promoMsg.text}</p>
              )}
            </CardContent>
          </Card>

          {insufficient && (
            <Card className="border-0 bg-destructive/10 shadow-sm">
              <CardContent className="p-4 text-sm">
                <p className="font-semibold text-destructive">Saldo tidak cukup</p>
                <p className="text-muted-foreground">Kurang {formatRupiah(totalPrice - balance)}. Silakan topup dulu.</p>
              </CardContent>
            </Card>
          )}

          <Button type="submit" disabled={loading || insufficient || totalPrice <= 0}
            className="w-full gap-2 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90" size="lg">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Memproses...</> : <><ShoppingBag className="h-4 w-4" /> Bayar dengan Saldo</>}
          </Button>
        </form>

        <Card className="h-fit border-0 shadow-lg">
          <CardContent className="p-6">
            <h3 className="mb-4 font-bold">Ringkasan</h3>
            <div className="flex items-center gap-3">
              <span className="text-2xl">{CATEGORY_EMOJI[item.category] || '📦'}</span>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium">{item.name}</p>
                {grade && <Badge variant="outline" className="mt-1 text-xs">Grade {grade.grade}</Badge>}
              </div>
            </div>
            {pkg && (
              <div className="mt-4 space-y-2 border-t pt-4 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Paket</span><span>{pkg.name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Jumlah akun</span><span>{pkg.quantity}</span></div>
              </div>
            )}
            {promoDiscount > 0 && (
              <div className="mt-4 space-y-1 border-t pt-4 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span><span>{formatRupiah(basePrice)}</span>
                </div>
                <div className="flex justify-between text-green-600">
                  <span>Diskon ({promoCode})</span><span>-{formatRupiah(promoDiscount)}</span>
                </div>
              </div>
            )}
            <div className={`${promoDiscount > 0 ? "mt-2" : "mt-4 border-t pt-4"} flex justify-between`}>
              <span className="font-bold">Total</span>
              <span className="text-xl font-bold text-primary">{formatRupiah(totalPrice)}</span>
            </div>
            <div className="mt-2 flex justify-between text-sm">
              <span className="text-muted-foreground">Saldo setelah bayar</span>
              <span className={insufficient ? "text-destructive font-semibold" : "text-success font-semibold"}>{formatRupiah(balance - totalPrice)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
