import { Link } from "react-router-dom";
import { ShoppingCart, Menu, X, Wallet, User, LogOut, Receipt, Heart } from "lucide-react";
import { NotificationBell } from "./NotificationBell";
import { useState } from "react";
import { useCartStore } from "@/store/cart";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CartDrawer } from "./CartDrawer";
import { formatRupiah } from "@/lib/constants";

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const totalItems = useCartStore((s) => s.getTotalItems());
  const { user, balance, signOut } = useAuth();

  return (
    <nav className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-lg">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-lg font-bold text-primary-foreground">
            B
          </div>
          <span className="text-lg font-bold">BuyingAccount</span>
        </Link>

        <div className="hidden items-center gap-6 md:flex">
          <Link to="/" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Beranda</Link>
          <Link to="/products" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Produk</Link>
          <Link to="/orders-lookup" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">Cek Pesanan</Link>
        </div>

        <div className="flex items-center gap-2">
          {user && (
            <Link to="/topup" className="hidden items-center gap-2 rounded-xl bg-gradient-to-br from-primary/10 to-accent/10 px-3 py-1.5 text-sm font-semibold text-primary hover:from-primary/20 hover:to-accent/20 sm:flex">
              <Wallet className="h-4 w-4" /> {formatRupiah(balance)}
            </Link>
          )}

          <NotificationBell />

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <ShoppingCart className="h-5 w-5" />
                {totalItems > 0 && (
                  <Badge className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full p-0 text-xs">{totalItems}</Badge>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-md">
              <SheetHeader><SheetTitle>Keranjang Belanja</SheetTitle></SheetHeader>
              <CartDrawer />
            </SheetContent>
          </Sheet>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="hidden md:inline-flex"><User className="h-5 w-5" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
                <DropdownMenuLabel className="font-normal text-xs text-muted-foreground">Saldo: {formatRupiah(balance)}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link to="/profile" className="gap-2"><User className="h-4 w-4" /> Profil</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/wishlist" className="gap-2"><Heart className="h-4 w-4" /> Wishlist</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/wallet" className="gap-2"><Receipt className="h-4 w-4" /> Riwayat Saldo</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/topup" className="gap-2"><Wallet className="h-4 w-4" /> Top Up</Link></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} className="gap-2 text-destructive"><LogOut className="h-4 w-4" /> Keluar</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link to="/auth" className="hidden md:inline-flex">
              <Button variant="default" size="sm" className="rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90">Login</Button>
            </Link>
          )}

          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t bg-card px-4 py-3 md:hidden">
          <div className="flex flex-col gap-2">
            {user && (
              <Link to="/topup" onClick={() => setMobileOpen(false)} className="flex items-center justify-between rounded-xl bg-gradient-to-r from-primary/10 to-accent/10 px-3 py-2.5">
                <span className="flex items-center gap-2 text-sm font-semibold text-primary"><Wallet className="h-4 w-4" /> Saldo</span>
                <span className="font-bold text-primary">{formatRupiah(balance)}</span>
              </Link>
            )}
            <Link to="/" onClick={() => setMobileOpen(false)} className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted">Beranda</Link>
            <Link to="/products" onClick={() => setMobileOpen(false)} className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted">Produk</Link>
            <Link to="/orders-lookup" onClick={() => setMobileOpen(false)} className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted">Cek Pesanan</Link>
            {!user ? (
              <Link to="/auth" onClick={() => setMobileOpen(false)} className="rounded-lg bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground">Login / Daftar</Link>
            ) : (
              <>
                <Link to="/profile" onClick={() => setMobileOpen(false)} className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted">Profil</Link>
                <Link to="/wishlist" onClick={() => setMobileOpen(false)} className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted">Wishlist</Link>
                <button onClick={() => { signOut(); setMobileOpen(false); }} className="rounded-lg px-3 py-2 text-left text-sm font-medium text-destructive hover:bg-muted">Keluar</button>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
