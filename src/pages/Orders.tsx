import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Package, Clock, CheckCircle, XCircle, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { formatRupiah, CATEGORY_EMOJI } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

const PAY_STATUS: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending:  { label: "Menunggu",   color: "bg-yellow-100 text-yellow-800", icon: Clock },
  paid:     { label: "Dibayar",    color: "bg-green-100 text-green-800",   icon: CheckCircle },
  failed:   { label: "Ditolak",    color: "bg-red-100 text-red-800",       icon: XCircle },
  expired:  { label: "Kedaluwarsa",color: "bg-muted text-muted-foreground",icon: XCircle },
};

const ORD_STATUS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  processing: { label: "Diproses",  variant: "secondary" },
  completed:  { label: "Selesai",   variant: "default" },
  cancelled:  { label: "Dibatalkan",variant: "destructive" },
};

export default function Orders() {
  const { user } = useAuth();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["my-orders", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_orders");
      if (error) throw error;
      return data || [];
    },
  });

  if (!user) {
    return (
      <div className="container mx-auto flex flex-col items-center px-4 py-20">
        <span className="mb-4 text-5xl">🔒</span>
        <h1 className="mb-2 text-2xl font-bold">Login Dulu</h1>
        <Link to="/auth"><Button>Login</Button></Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Pesanan Saya</h1>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center py-20">
          <span className="mb-4 text-5xl">📦</span>
          <p className="mb-2 text-lg font-semibold">Belum ada pesanan</p>
          <p className="mb-6 text-sm text-muted-foreground">Yuk mulai belanja produk digital!</p>
          <Link to="/products"><Button>Lihat Produk</Button></Link>
        </div>
      ) : (
        <div className="space-y-3">
          {(orders as any[]).map((order) => {
            const pay = PAY_STATUS[order.payment_status] ?? PAY_STATUS.pending;
            const ord = ORD_STATUS[order.order_status] ?? ORD_STATUS.processing;
            const PayIcon = pay.icon;
            return (
              <Link
                key={order.id}
                to={`/order/${order.order_number}`}
                className="flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-sm transition-colors hover:bg-muted/50"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted text-2xl">
                  {CATEGORY_EMOJI[order.product_category] || "📦"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{order.product_name || "Produk"}</p>
                  <p className="text-xs text-muted-foreground">#{order.order_number}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${pay.color}`}>
                      <PayIcon className="h-3 w-3" /> {pay.label}
                    </span>
                    <Badge variant={ord.variant} className="text-[10px] px-2 py-0.5">{ord.label}</Badge>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-bold text-primary">{formatRupiah(order.total_price)}</p>
                  {order.discount_amount > 0 && (
                    <p className="text-[10px] text-green-600">Hemat {formatRupiah(order.discount_amount)}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(order.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
