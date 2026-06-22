import { Link } from "react-router-dom";
import { Star, ShoppingCart, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCartStore } from "@/store/cart";
import { formatRupiah, getStockBadge, CATEGORY_EMOJI } from "@/lib/constants";
import { useCategoryLogos } from "@/hooks/use-category-logos";
import { useCountdown } from "@/hooks/use-countdown";
import { toast } from "sonner";
import { WishlistButton } from "@/components/WishlistButton";

interface ProductCardProps {
  id: string;
  name: string;
  slug: string;
  category: string;
  price: number;
  stock: number;
  rating: number;
  image_url: string | null;
  sale_price?: number | null;
  sale_ends_at?: string | null;
}

export function ProductCard({ id, name, category, price, stock, rating, image_url, sale_price, sale_ends_at }: ProductCardProps) {
  const addItem = useCartStore((s) => s.addItem);
  const stockBadge = getStockBadge(stock);
  const logos = useCategoryLogos();
  const categoryLogo = logos[category];
  const countdown = useCountdown(sale_ends_at);
  const activeFlash = !!sale_price && countdown.isActive;
  const displayPrice = activeFlash ? sale_price! : price;

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (stock === 0) return;
    addItem({ id, name, price: displayPrice, image_url, category, stock });
    toast.success(`${name} ditambahkan ke keranjang`);
  };

  return (
    <Link to={`/products/${id}`}>
      <Card className="group overflow-hidden border-0 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
        <div className="relative flex h-40 items-center justify-center bg-gradient-to-br from-muted to-secondary">
          {image_url ? (
            <img src={image_url} alt={name} className="h-full w-full object-cover" />
          ) : categoryLogo ? (
            <img src={categoryLogo} alt={category} className="h-20 w-20 object-contain" />
          ) : (
            <span className="text-6xl">{CATEGORY_EMOJI[category] || '📦'}</span>
          )}
          <div className="absolute right-3 top-3 flex flex-col items-end gap-1">
            {activeFlash && (
              <Badge className="gap-1 bg-red-500 text-white hover:bg-red-500/90 border-transparent">
                <Zap className="h-3 w-3" /> FLASH
              </Badge>
            )}
            <Badge
              variant={stockBadge.variant}
              className={`${stockBadge.pulse ? 'animate-pulse' : ''} ${stockBadge.badgeClass}`}
            >
              {stockBadge.label}
            </Badge>
          </div>
          <div className="absolute left-3 top-3">
            <WishlistButton productId={id} />
          </div>
        </div>
        <CardContent className="p-4">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {category}
          </p>
          <h3 className="mb-2 line-clamp-2 text-sm font-semibold leading-tight group-hover:text-primary">
            {name}
          </h3>
          <div className="mb-3 flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
            <span className="text-xs font-medium">{rating}</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-lg font-bold text-primary">{formatRupiah(displayPrice)}</span>
              {activeFlash && (
                <span className="ml-1.5 text-xs text-muted-foreground line-through">{formatRupiah(price)}</span>
              )}
              {activeFlash && countdown.formatted && (
                <p className="text-[10px] font-mono text-red-500">{countdown.formatted}</p>
              )}
            </div>
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8 rounded-lg"
              onClick={handleAddToCart}
              disabled={stock === 0}
            >
              <ShoppingCart className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
