import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatRupiah } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Trash2, Loader2, ChevronDown, ChevronUp, Layers, Upload, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Product = Database["public"]["Tables"]["products"]["Row"];
type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];
type GradeForm = { product_id: string; grade: string; description: string; base_price: number; stock: number; is_active: boolean };
type PkgForm = { grade_id: string; name: string; quantity: number; price: number; is_active: boolean };

const EMPTY_PRODUCT: Partial<ProductInsert> & { sale_price?: number | null; sale_ends_at?: string | null } = {
  name: "", slug: "", category: "facebook", price: 0, description: "", features: [], stock: 0, status: "active",
  sale_price: null, sale_ends_at: null,
};

// ─── Inline grade + package panel for one product ───────────────────────────

function GradePanel({ productId }: { productId: string }) {
  const qc = useQueryClient();

  const [gOpen, setGOpen] = useState(false);
  const [gEditId, setGEditId] = useState<string | null>(null);
  const [gForm, setGForm] = useState<GradeForm>({ product_id: productId, grade: "", description: "", base_price: 0, stock: 0, is_active: true });
  const [gDelId, setGDelId] = useState<string | null>(null);

  const [pOpen, setPOpen] = useState(false);
  const [pEditId, setPEditId] = useState<string | null>(null);
  const [pForm, setPForm] = useState<PkgForm>({ grade_id: "", name: "", quantity: 1, price: 0, is_active: true });
  const [pDelId, setPDelId] = useState<string | null>(null);

  const { data: grades, isLoading: gLoading } = useQuery({
    queryKey: ["grades-for-product", productId],
    queryFn: async () => {
      const { data, error } = await supabase.from("account_grades").select("*").eq("product_id", productId).order("grade");
      if (error) throw error;
      return data;
    },
  });

  const { data: packages } = useQuery({
    queryKey: ["packages-for-product", productId],
    queryFn: async () => {
      const { data, error } = await supabase.from("packages").select("*, account_grades!inner(product_id)").eq("account_grades.product_id", productId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: credCounts } = useQuery({
    queryKey: ["cred-counts", productId],
    queryFn: async () => {
      const { data, error } = await supabase.from("account_credentials").select("grade_id, is_sold").eq("product_id", productId);
      if (error) throw error;
      const map: Record<string, { available: number; sold: number }> = {};
      (data || []).forEach((c: any) => {
        if (!c.grade_id) return;
        if (!map[c.grade_id]) map[c.grade_id] = { available: 0, sold: 0 };
        if (c.is_sold) map[c.grade_id].sold++;
        else map[c.grade_id].available++;
      });
      return map;
    },
  });

  const saveGrade = useMutation({
    mutationFn: async () => {
      const payload = { ...gForm, product_id: productId };
      if (gEditId) {
        const { error } = await supabase.from("account_grades").update(payload).eq("id", gEditId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("account_grades").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Grade tersimpan!");
      qc.invalidateQueries({ queryKey: ["grades-for-product", productId] });
      resetGrade();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const delGrade = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("account_grades").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Grade dihapus!");
      await qc.invalidateQueries({ queryKey: ["grades-for-product", productId] });
      qc.invalidateQueries({ queryKey: ["packages-for-product", productId] });
      // If no more grades remain, soft-delete the product
      const remaining = (grades || []).filter((g: any) => g.id !== gDelId);
      if (remaining.length === 0) {
        await supabase.from("products").update({ status: "inactive" }).eq("id", productId);
        qc.invalidateQueries({ queryKey: ["admin-products"] });
        toast.info("Produk dinonaktifkan karena tidak ada grade tersisa.");
      }
      setGDelId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const savePkg = useMutation({
    mutationFn: async () => {
      if (pEditId) {
        const { error } = await supabase.from("packages").update(pForm).eq("id", pEditId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("packages").insert(pForm);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Paket tersimpan!");
      qc.invalidateQueries({ queryKey: ["packages-for-product", productId] });
      resetPkg();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const delPkg = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("packages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Paket dihapus!");
      qc.invalidateQueries({ queryKey: ["packages-for-product", productId] });
      setPDelId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const resetGrade = () => {
    setGForm({ product_id: productId, grade: "", description: "", base_price: 0, stock: 0, is_active: true });
    setGEditId(null);
    setGOpen(false);
  };
  const resetPkg = () => {
    setPForm({ grade_id: "", name: "", quantity: 1, price: 0, is_active: true });
    setPEditId(null);
    setPOpen(false);
  };

  const pkgsForGrade = (gradeId: string) =>
    (packages || []).filter((p: any) => p.grade_id === gradeId);

  return (
    <div className="border-t bg-muted/30 px-4 pb-4 pt-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground"><Layers className="h-3.5 w-3.5" /> Grade & Paket</span>
        <Dialog open={gOpen} onOpenChange={(v) => { if (!v) resetGrade(); setGOpen(v); }}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"><Plus className="h-3 w-3" /> Tambah Grade</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>{gEditId ? "Edit Grade" : "Tambah Grade"}</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); saveGrade.mutate(); }} className="space-y-3">
              <div><Label>Grade (A/B/C/...)</Label><Input value={gForm.grade} onChange={(e) => setGForm({ ...gForm, grade: e.target.value.toUpperCase() })} required maxLength={5} /></div>
              <div><Label>Deskripsi</Label><Textarea value={gForm.description} onChange={(e) => setGForm({ ...gForm, description: e.target.value })} rows={2} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Harga dasar (Rp)</Label><Input type="number" value={gForm.base_price} onChange={(e) => setGForm({ ...gForm, base_price: Number(e.target.value) })} required /></div>
                <div><Label>Stok</Label><Input type="number" value={gForm.stock} onChange={(e) => setGForm({ ...gForm, stock: Number(e.target.value) })} required /></div>
              </div>
              <div className="flex items-center gap-2"><Switch checked={gForm.is_active} onCheckedChange={(v) => setGForm({ ...gForm, is_active: v })} /><Label>Aktif</Label></div>
              <Button type="submit" disabled={saveGrade.isPending} className="w-full">{saveGrade.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Simpan"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {gLoading ? (
        <p className="text-xs text-muted-foreground">Memuat grade...</p>
      ) : (grades || []).length === 0 ? (
        <p className="text-xs text-muted-foreground">Belum ada grade. Tambahkan grade untuk produk ini.</p>
      ) : (grades || []).map((g: any) => (
        <div key={g.id} className="rounded-lg border bg-background p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Badge>Grade {g.grade}</Badge>
                {!g.is_active && <Badge variant="secondary">Nonaktif</Badge>}
                <span className="text-xs text-muted-foreground">{formatRupiah(g.base_price)}</span>
              </div>
              {g.description && <p className="text-xs text-muted-foreground mt-0.5">{g.description}</p>}
              <p className="text-xs mt-0.5">
                <span className="text-green-600 font-medium">Tersedia: {credCounts?.[g.id]?.available ?? 0}</span>
                {" · "}
                <span className="text-muted-foreground">Terjual: {credCounts?.[g.id]?.sold ?? 0}</span>
              </p>
            </div>
            <div className="flex gap-1">
              <Button asChild size="sm" variant="default" className="h-7 gap-1 text-xs">
                <Link to={`/admin/import?product=${productId}&grade=${g.id}`}><Upload className="h-3 w-3" /> Import</Link>
              </Button>
              <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => {
                setGEditId(g.id);
                setGForm({ product_id: productId, grade: g.grade, description: g.description || "", base_price: g.base_price, stock: g.stock, is_active: g.is_active });
                setGOpen(true);
              }}><Pencil className="h-3 w-3" /></Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setGDelId(g.id)}><Trash2 className="h-3 w-3" /></Button>
            </div>
          </div>

          {/* Packages for this grade */}
          <div className="pl-3 border-l space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Paket</span>
              <Dialog open={pOpen && pForm.grade_id === g.id} onOpenChange={(v) => { if (!v) resetPkg(); else { setPForm((f) => ({ ...f, grade_id: g.id })); setPOpen(true); } }}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-6 gap-1 text-xs" onClick={() => { resetPkg(); setPForm({ grade_id: g.id, name: "", quantity: 1, price: 0, is_active: true }); setPOpen(true); }}>
                    <Plus className="h-3 w-3" /> Tambah Paket
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-sm">
                  <DialogHeader><DialogTitle>{pEditId ? "Edit Paket" : "Tambah Paket"}</DialogTitle></DialogHeader>
                  <form onSubmit={(e) => { e.preventDefault(); savePkg.mutate(); }} className="space-y-3">
                    <div><Label>Nama Paket</Label><Input value={pForm.name} onChange={(e) => setPForm({ ...pForm, name: e.target.value })} placeholder="Mis: Paket Starter" required /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Jumlah akun</Label><Input type="number" min={1} value={pForm.quantity} onChange={(e) => setPForm({ ...pForm, quantity: Number(e.target.value) })} required /></div>
                      <div><Label>Harga (Rp)</Label><Input type="number" min={1} value={pForm.price} onChange={(e) => setPForm({ ...pForm, price: Number(e.target.value) })} required /></div>
                    </div>
                    <div className="flex items-center gap-2"><Switch checked={pForm.is_active} onCheckedChange={(v) => setPForm({ ...pForm, is_active: v })} /><Label>Aktif</Label></div>
                    <Button type="submit" disabled={savePkg.isPending} className="w-full">{savePkg.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Simpan"}</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
            {pkgsForGrade(g.id).length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Tidak ada paket — beli satuan aktif.</p>
            ) : pkgsForGrade(g.id).map((p: any) => (
              <div key={p.id} className="flex items-center justify-between rounded bg-muted/50 px-2 py-1">
                <div>
                  <span className="text-xs font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">{p.quantity} akun · {formatRupiah(p.price)}</span>
                  {!p.is_active && <Badge variant="secondary" className="ml-1 text-xs">Nonaktif</Badge>}
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => {
                    setPEditId(p.id);
                    setPForm({ grade_id: g.id, name: p.name, quantity: p.quantity, price: p.price, is_active: p.is_active });
                    setPOpen(true);
                  }}><Pencil className="h-3 w-3" /></Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => setPDelId(p.id)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Grade delete confirm */}
      <AlertDialog open={!!gDelId} onOpenChange={(v) => !v && setGDelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Hapus grade ini?</AlertDialogTitle><AlertDialogDescription>Semua paket di bawah grade ini ikut terhapus. Jika ini grade terakhir, produk juga dinonaktifkan.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={() => gDelId && delGrade.mutate(gDelId)} className="bg-destructive text-destructive-foreground">Hapus</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Package delete confirm */}
      <AlertDialog open={!!pDelId} onOpenChange={(v) => !v && setPDelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Hapus paket ini?</AlertDialogTitle><AlertDialogDescription>Paket akan dihapus permanen.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={() => pDelId && delPkg.mutate(pDelId)} className="bg-destructive text-destructive-foreground">Hapus</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Main product admin page ─────────────────────────────────────────────────

export default function AdminProducts() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<ProductInsert>>(EMPTY_PRODUCT);
  const [featuresText, setFeaturesText] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const { data: categorySettings } = useQuery({
    queryKey: ["category-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("category_settings").select("slug, label, emoji, logo_url").eq("is_active", true).order("display_order");
      if (error) throw error;
      return data as { slug: string; label: string; emoji: string; logo_url: string | null }[];
    },
  });

  const { data: products, isLoading } = useQuery({
    queryKey: ["admin-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .neq("status", "inactive")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      let imageUrl = form.image_url ?? null;

      // Upload image if a new file was selected
      if (imageFile) {
        setUploadingImage(true);
        const ext = imageFile.name.split(".").pop();
        const path = `${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("product-images").upload(path, imageFile, { upsert: true });
        setUploadingImage(false);
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
        imageUrl = urlData.publicUrl;
      }

      const features = featuresText.split("\n").map((f) => f.trim()).filter(Boolean);
      const payload = { ...form, features, image_url: imageUrl, slug: form.slug || form.name!.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") };
      if (editId) {
        const { error } = await supabase.from("products").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert(payload as ProductInsert);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editId ? "Produk diupdate!" : "Produk ditambahkan!");
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      resetForm();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").update({ status: "inactive" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Produk dinonaktifkan!");
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      setDeleteId(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const resetForm = () => {
    setForm(EMPTY_PRODUCT);
    setFeaturesText("");
    setEditId(null);
    setOpen(false);
    setImageFile(null);
    setImagePreview(null);
  };

  const openEdit = (p: Product) => {
    const pa = p as any;
    setEditId(p.id);
    setForm({
      name: p.name, slug: p.slug, category: p.category, price: p.price,
      description: p.description || "", stock: p.stock, status: p.status,
      image_url: p.image_url ?? null,
      sale_price: pa.sale_price ?? null,
      sale_ends_at: pa.sale_ends_at ? new Date(pa.sale_ends_at).toISOString().slice(0, 16) : null,
    } as any);
    setFeaturesText(((p.features as string[]) || []).join("\n"));
    setImageFile(null);
    setImagePreview(p.image_url ?? null);
    setOpen(true);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setForm((f) => ({ ...f, image_url: null }));
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Produk</h1>
        <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); setOpen(v); }}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Tambah Produk</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editId ? "Edit Produk" : "Tambah Produk"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-4">
              <div><Label>Nama</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
              <div><Label>Slug</Label><Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="auto-generated jika kosong" /></div>

              {/* Image upload */}
              <div>
                <Label className="mb-2 block">Gambar Produk</Label>
                {imagePreview ? (
                  <div className="relative inline-block">
                    <img src={imagePreview} alt="preview" className="h-32 w-32 rounded-xl object-cover border" />
                    <button type="button" onClick={removeImage}
                      className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white shadow">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <label className="flex h-32 w-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/40 hover:bg-muted/70 transition-colors">
                    <ImagePlus className="mb-1 h-6 w-6 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Upload</span>
                    <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleImageChange} />
                  </label>
                )}
                <p className="mt-1 text-xs text-muted-foreground">Maks 5 MB · JPG, PNG, WebP</p>
              </div>

              <div>
                <Label>Kategori</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(categorySettings || []).map((c) => (
                      <SelectItem key={c.slug} value={c.slug}>
                        {c.logo_url ? <img src={c.logo_url} alt={c.label} className="inline h-4 w-4 object-contain mr-1" /> : c.emoji} {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Harga (Rupiah)</Label><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} required /></div>
              <div><Label>Stok</Label><Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} required /></div>
              <div><Label>Deskripsi</Label><Textarea value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div><Label>Fitur (satu per baris)</Label><Textarea value={featuresText} onChange={(e) => setFeaturesText(e.target.value)} rows={4} /></div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-lg border border-dashed border-red-200 bg-red-50/50 p-3 space-y-3">
                <p className="text-xs font-semibold text-red-600">⚡ Flash Sale (opsional)</p>
                <div>
                  <Label className="text-xs">Harga Flash Sale</Label>
                  <Input
                    type="number"
                    placeholder="Kosongkan jika tidak ada flash sale"
                    value={(form as any).sale_price ?? ""}
                    onChange={(e) => setForm({ ...form, sale_price: e.target.value ? Number(e.target.value) : null } as any)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Berakhir Pada</Label>
                  <Input
                    type="datetime-local"
                    value={(form as any).sale_ends_at ?? ""}
                    onChange={(e) => setForm({ ...form, sale_ends_at: e.target.value || null } as any)}
                  />
                </div>
              </div>
              <Button type="submit" disabled={saveMutation.isPending || uploadingImage} className="w-full">
                {(saveMutation.isPending || uploadingImage) ? <><Loader2 className="h-4 w-4 animate-spin" /> {uploadingImage ? "Mengupload gambar..." : "Menyimpan..."}</> : editId ? "Update" : "Simpan"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <p className="text-muted-foreground">Memuat...</p>
        ) : products?.map((p) => (
          <Card key={p.id} className="border-0 shadow-sm overflow-hidden">
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} className="h-10 w-10 rounded-lg object-cover shrink-0 border" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted shrink-0 text-lg">
                    {(p as any).emoji || "📦"}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.name}</p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant="outline" className="text-xs uppercase">{p.category}</Badge>
                    <span>{formatRupiah(p.price)}</span>
                    <span>Stok: {p.stock}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant={expandedId === p.id ? "secondary" : "outline"}
                  size="sm"
                  className="h-8 gap-1 text-xs"
                  onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                >
                  <Layers className="h-3 w-3" />
                  Grade
                  {expandedId === p.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}><Pencil className="h-3 w-3" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(p.id)}><Trash2 className="h-3 w-3" /></Button>
              </div>
            </CardContent>
            {expandedId === p.id && <GradePanel productId={p.id} />}
          </Card>
        ))}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nonaktifkan produk ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Produk akan dinonaktifkan dan tidak akan muncul di toko. Data order tetap aman.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Nonaktifkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
