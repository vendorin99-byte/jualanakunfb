import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Star, ShoppingCart, ArrowLeft, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCartStore } from "@/store/cart";
import { formatRupiah, getStockBadge, CATEGORY_EMOJI } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PromoBannerSlot } from "@/components/PromoBannerSlot";
import { WishlistButton } from "@/components/WishlistButton";
import { ReviewList } from "@/components/ReviewList";
import { toast } from "sonner";

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const addItem = useCartStore((s) => s.addItem);

  const { data: product, isLoading } = useQuery({
    queryKey: ["product", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="mb-4 h-8 w-32" />
        <div className="grid gap-8 md:grid-cols-2">
          <Skeleton className="h-80 rounded-2xl" />
          <div className="space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="container mx-auto flex flex-col items-center px-4 py-20">
        <span className="mb-4 text-5xl">❌</span>
        <h1 className="mb-2 text-2xl font-bold">Produk Tidak Ditemukan</h1>
        <Link to="/products"><Button variant="outline">Kembali ke Produk</Button></Link>
      </div>
    );
  }

  const stockBadge = getStockBadge(product.stock);
  const features = (product.features as string[]) || [];

  const handleAddToCart = () => {
    if (product.stock === 0) return;
    addItem({
      id: product.id,
      name: product.name,
      price: product.price,
      image_url: product.image_url,
      category: product.category,
      stock: product.stock,
    });
    toast.success(`${product.name} ditambahkan ke keranjang`);
  };

  const handleBuyNow = () => {
    handleAddToCart();
    window.location.href = "/checkout";
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Link to="/products" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Kembali ke Produk
      </Link>
      <PromoBannerSlot placement="product_detail" className="mb-6" />
      <div className="grid gap-8 md:grid-cols-2">
        <div className="flex items-center justify-center rounded-2xl bg-gradient-to-br from-muted to-secondary p-12">
          <span className="text-9xl">{CATEGORY_EMOJI[product.category] || '📦'}</span>
        </div>
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Badge variant="outline" className="uppercase">{product.category}</Badge>
            <Badge variant={stockBadge.variant} className={`${stockBadge.pulse ? 'animate-pulse' : ''} ${stockBadge.badgeClass}`}>
              Stok: {product.stock} — {stockBadge.label}
            </Badge>
          </div>
          <h1 className="mb-3 text-2xl font-bold md:text-3xl">{product.name}</h1>
          <div className="mb-4 flex items-center gap-1">
            <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
            <span className="font-medium">{product.rating}</span>
            <span className="text-muted-foreground">/ 5.0</span>
          </div>
          <p className="mb-6 text-3xl font-bold text-primary">{formatRupiah(product.price)}</p>
          <p className="mb-6 leading-relaxed text-muted-foreground">{product.description}</p>

          {features.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-3 font-semibold">Fitur:</h3>
              <ul className="space-y-2">
                {features.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-green-500" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              size="lg"
              className="flex-1 gap-2 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90"
              onClick={handleBuyNow}
              disabled={product.stock === 0}
            >
              Beli Sekarang
            </Button>
            <Button size="lg" variant="outline" className="gap-2 rounded-xl" onClick={handleAddToCart} disabled={product.stock === 0}>
              <ShoppingCart className="h-5 w-5" />
            </Button>
            <WishlistButton productId={product.id} className="h-11 w-11" />
          </div>
        </div>
      </div>

      <div className="mt-10">
        <h2 className="mb-4 text-xl font-bold">Ulasan Pelanggan</h2>
        <ReviewList productId={product.id} />
      </div>
    </div>
  );
}
