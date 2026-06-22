import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ProductCard } from "@/components/ProductCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PromoBanner } from "@/components/PromoBanner";
import { PromoBannerSlot } from "@/components/PromoBannerSlot";

type CategorySetting = { slug: string; label: string; emoji: string; logo_url: string | null };

export default function Products() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeCategory = searchParams.get("category") || "all";
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  const { data: dbCategories } = useQuery({
    queryKey: ["category-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("category_settings").select("slug, label, emoji, logo_url").eq("is_active", true).order("display_order");
      if (error) throw error;
      return data as CategorySetting[];
    },
  });

  const categories = [
    { slug: "all", label: "Semua", emoji: "🏪", logo_url: null },
    ...(dbCategories || []),
  ];

  const { data: products, isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("status", "active").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Realtime: patch the cache directly from payloads instead of refetching.
  // Only fall back to a full refetch for INSERTs (need full row incl. server defaults).
  useEffect(() => {
    type ProductRow = NonNullable<typeof products>[number];
    const RELEVANT_FIELDS: (keyof ProductRow)[] = [
      "stock", "status", "price", "name", "category", "image_url", "rating",
    ];

    let refetchPending = false;
    const scheduleRefetch = () => {
      if (refetchPending) return;
      refetchPending = true;
      setTimeout(() => {
        refetchPending = false;
        queryClient.invalidateQueries({ queryKey: ["products"] });
      }, 400);
    };

    const channel = supabase
      .channel("products-stock-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "products" },
        (payload: any) => {
          // New row → fetch once to ensure full shape consistency
          if (payload.new?.status === "active") scheduleRefetch();
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "products" },
        (payload: any) => {
          const id = payload.old?.id;
          if (!id) return;
          queryClient.setQueryData<ProductRow[]>(["products"], (prev) =>
            prev ? prev.filter((p) => p.id !== id) : prev
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "products" },
        (payload: any) => {
          const oldRow = (payload.old || {}) as Partial<ProductRow>;
          const newRow = (payload.new || {}) as Partial<ProductRow>;
          const id = newRow.id || oldRow.id;
          if (!id) return;

          const changed = RELEVANT_FIELDS.some(
            (k) => oldRow[k] !== newRow[k]
          );
          if (!changed) return;

          queryClient.setQueryData<ProductRow[]>(["products"], (prev) => {
            if (!prev) return prev;
            const exists = prev.some((p) => p.id === id);
            // Became inactive → remove
            if (newRow.status && newRow.status !== "active") {
              return exists ? prev.filter((p) => p.id !== id) : prev;
            }
            // Became active → fetch once for full row
            if (!exists && newRow.status === "active") {
              scheduleRefetch();
              return prev;
            }
            // Patch in place — preserves list ordering and avoids extra requests
            return prev.map((p) =>
              p.id === id ? { ...p, ...(newRow as ProductRow) } : p
            );
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Aggregate stock per category for ready badge
  const stockByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    let total = 0;
    (products || []).forEach((p) => {
      const s = Math.max(0, p.stock || 0);
      map[p.category] = (map[p.category] || 0) + s;
      total += s;
    });
    map["all"] = total;
    return map;
  }, [products]);

  const filtered = products?.filter((p) => {
    const matchCategory = activeCategory === "all" || p.category === activeCategory;
    const matchSearch = search === "" || p.name.toLowerCase().includes(search.toLowerCase());
    return matchCategory && matchSearch;
  });

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-2 text-3xl font-bold">Semua Produk</h1>
      <p className="mb-6 text-muted-foreground">Temukan akun digital terbaik untuk kebutuhanmu</p>

      <PromoBannerSlot placement="products_top" className="mb-6" />

      <PromoBanner />

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Cari produk..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
      </div>

      <div className="mb-8 flex flex-wrap gap-2">
        {categories.map((cat) => (
          <Button
            key={cat.slug}
            variant={activeCategory === cat.slug ? "default" : "outline"}
            size="sm"
            className="gap-1.5 rounded-full"
            onClick={() => {
              if (cat.slug === "all") {
                searchParams.delete("category");
              } else {
                searchParams.set("category", cat.slug);
              }
              setSearchParams(searchParams);
            }}
          >
            {cat.logo_url ? (
              <img src={cat.logo_url} alt={cat.label} className="h-4 w-4 object-contain" />
            ) : (
              <span>{cat.emoji}</span>
            )}
            {cat.label}
            <Badge
              variant="secondary"
              className={`ml-1 h-5 px-1.5 text-[10px] font-semibold ${
                (stockByCategory[cat.slug] || 0) === 0
                  ? "bg-muted text-muted-foreground"
                  : "bg-green-100 text-green-700"
              }`}
            >
              {stockByCategory[cat.slug] || 0}
            </Badge>
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-2xl" />
          ))}
        </div>
      ) : filtered && filtered.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((product) => (
            <ProductCard
              key={product.id}
              id={product.id}
              name={product.name}
              slug={product.slug}
              category={product.category}
              price={product.price}
              stock={product.stock}
              rating={Number(product.rating)}
              image_url={product.image_url}
              sale_price={(product as any).sale_price}
              sale_ends_at={(product as any).sale_ends_at}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20">
          <span className="mb-4 text-5xl">🔍</span>
          <p className="text-lg font-medium">Produk tidak ditemukan</p>
          <p className="text-muted-foreground">Coba ubah kata kunci atau kategori</p>
        </div>
      )}
    </div>
  );
}
