import { Link } from "react-router-dom";
import { Star, ShoppingCart } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCartStore } from "@/store/cart";
import { formatRupiah, getStockBadge, CATEGORY_EMOJI } from "@/lib/constants";
import { useCategoryLogos } from "@/hooks/use-category-logos";
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
}

export function ProductCard({ id, name, category, price, stock, rating, image_url }: ProductCardProps) {
  const addItem = useCartStore((s) => s.addItem);
  const stockBadge = getStockBadge(stock);
  const logos = useCategoryLogos();
  const categoryLogo = logos[category];

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (stock === 0) return;
    addItem({ id, name, price, image_url, category, stock });
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
          <div className="absolute right-3 top-3">
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
            <span className="text-lg font-bold text-primary">{formatRupiah(price)}</span>
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
