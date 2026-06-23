import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Key,
  LogOut,
  Layers,
  Tag,
  Upload,
  Users,
  ShieldCheck,
  ChevronDown,
  Grid2x2,
  Megaphone,
  Settings,
  Star,
  MessageCircle,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { AdminProtected } from "@/components/admin/AdminProtected";
import { toast } from "sonner";

const NAV_ITEMS = [
  { to: "/admin", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/admin/reports", icon: BarChart3, label: "Laporan" },
  { to: "/admin/categories", icon: Grid2x2, label: "Kategori" },
  { to: "/admin/products", icon: Package, label: "Produk" },
  { to: "/admin/promos", icon: Tag, label: "Promo" },
  { to: "/admin/banners", icon: Megaphone, label: "Banner" },
  { to: "/admin/orders", icon: ShoppingCart, label: "Orders" },
  { to: "/admin/credentials", icon: Key, label: "Sales History" },
  { to: "/admin/import", icon: Upload, label: "Import TXT" },
  { to: "/admin/users", icon: Users, label: "Users" },
  { to: "/admin/reviews", icon: Star, label: "Ulasan" },
  { to: "/admin/chat", icon: MessageCircle, label: "Live Chat" },
  { to: "/admin/broadcast", icon: Megaphone, label: "Broadcast" },
  { to: "/admin/settings", icon: Settings, label: "Pengaturan" },
];

function AdminShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAdminAuth();

  const email = user?.email ?? "";
  const displayName = email.split("@")[0] || "admin";
  const initial = displayName.charAt(0).toUpperCase();

  const handleLogout = async () => {
    await signOut();
    toast.success("Anda telah keluar");
    navigate("/admin/login", { replace: true });
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <Sidebar collapsible="offcanvas">
          <SidebarHeader>
            <div className="flex items-center gap-2 px-2 py-1">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent text-sm font-bold text-primary-foreground">
                B
              </div>
              <span className="font-bold">Admin Panel</span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {NAV_ITEMS.map((item) => {
                    const active = location.pathname === item.to;
                    return (
                      <SidebarMenuItem key={item.to}>
                        <SidebarMenuButton asChild isActive={active}>
                          <Link to={item.to}>
                            <item.icon className="h-4 w-4" />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-muted-foreground"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" /> Keluar
            </Button>
          </SidebarFooter>
        </Sidebar>
        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-card/95 px-3 backdrop-blur md:px-4">
            <SidebarTrigger className="h-9 w-9" />
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-primary to-accent text-xs font-bold text-primary-foreground md:hidden">
                B
              </div>
              <span className="text-sm font-semibold">Admin Panel</span>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Badge variant="secondary" className="hidden gap-1.5 sm:inline-flex">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
                Aktif
              </Badge>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 gap-2 rounded-full px-2 hover:bg-muted"
                  >
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-xs font-semibold text-primary-foreground">
                        {initial}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden text-sm font-medium md:inline">{displayName}</span>
                    <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground md:inline" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel className="space-y-1">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                      <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                      Sesi Admin Aktif
                    </div>
                    <div className="truncate text-sm font-medium normal-case">{email}</div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/")}>
                    Buka situs publik
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleLogout}
                    className="text-destructive focus:text-destructive"
                  >
                    <LogOut className="mr-2 h-4 w-4" /> Keluar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

export default function AdminLayout() {
  return (
    <AdminProtected>
      <AdminShell />
    </AdminProtected>
  );
}