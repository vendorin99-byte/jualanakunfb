import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Mail, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

const loginSchema = z.object({
  email: z.string().trim().email("Email tidak valid").max(255),
  password: z.string().min(6, "Min 6 karakter").max(72),
});
const signupSchema = loginSchema.extend({
  full_name: z.string().trim().min(1, "Nama wajib diisi").max(100),
});

export default function Auth() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = params.get("redirect") || "/profile";
  const { session, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", full_name: "" });
  const [showLoginPass, setShowLoginPass] = useState(false);
  const [showSignupPass, setShowSignupPass] = useState(false);

  useEffect(() => {
    if (!authLoading && session) navigate(redirect, { replace: true });
  }, [session, authLoading, navigate, redirect]);

  useEffect(() => {
    const err = params.get("error");
    if (err) toast.error(err);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = loginSchema.safeParse({ email: form.email, password: form.password });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
      if (error) {
        const msg = error.message?.toLowerCase() || "";
        if (msg.includes("not confirmed") || msg.includes("confirm")) {
          toast.error("Email belum diverifikasi. Cek inbox kamu.");
          navigate(`/verify-email?email=${encodeURIComponent(parsed.data.email)}`);
          return;
        }
        throw error;
      }
      // Block admin accounts from using the user portal
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: data.user.id, _role: "admin" });
      if (isAdmin) {
        await supabase.auth.signOut();
        toast.error("Akun ini adalah akun admin. Gunakan halaman admin untuk login.");
        navigate("/admin/login", { replace: true });
        return;
      }
      toast.success("Selamat datang!");
      navigate(redirect, { replace: true });
    } catch (err: any) {
      toast.error(err.message?.includes("Invalid") ? "Email/password salah" : err.message);
    } finally { setLoading(false); }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = signupSchema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
          emailRedirectTo: `${window.location.origin}/verify-email`,
          data: { full_name: parsed.data.full_name },
        },
      });
      if (error) throw error;

      toast.success("Cek email untuk verifikasi akun");
      navigate(`/verify-email?email=${encodeURIComponent(parsed.data.email)}`, { replace: true });
    } catch (err: any) {
      toast.error(err.message);
    } finally { setLoading(false); }
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}${redirect}`,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err.message || "Gagal login dengan Google");
      setGoogleLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = z.string().email().safeParse(forgotEmail.trim());
    if (!parsed.success) { toast.error("Email tidak valid"); return; }
    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Link reset password sudah dikirim ke email kamu");
      setForgotOpen(false);
      setForgotEmail("");
    } catch (err: any) {
      toast.error(err.message);
    } finally { setForgotLoading(false); }
  };

  if (emailSent) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4">
        <Card className="w-full max-w-md border-0 shadow-xl">
          <CardContent className="p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-primary-foreground">
              <Mail className="h-7 w-7" />
            </div>
            <h1 className="mb-2 text-xl font-bold">Cek inbox kamu</h1>
            <p className="mb-6 text-sm text-muted-foreground">
              Kami sudah mengirim link verifikasi ke <span className="font-semibold text-foreground">{form.email}</span>. Klik link di email untuk mengaktifkan akun, lalu kembali ke sini untuk login.
            </p>
            <Button variant="outline" className="w-full" onClick={() => { setEmailSent(false); setTab("login"); }}>
              Kembali ke Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md border-0 shadow-xl">
        <CardContent className="p-8">
          <div className="mb-6 text-center">
            <Link to="/" className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-lg font-bold text-primary-foreground">B</Link>
            <h1 className="mt-3 text-xl font-bold">Selamat datang</h1>
            <p className="text-sm text-muted-foreground">Login atau buat akun untuk topup & belanja</p>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="signup">Daftar</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <Label htmlFor="lemail">Email</Label>
                  <Input id="lemail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                </div>
                <div>
                  <Label htmlFor="lpass">Password</Label>
                  <div className="relative">
                    <Input
                      id="lpass"
                      type={showLoginPass ? "text" : "password"}
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPass((v) => !v)}
                      aria-label={showLoginPass ? "Sembunyikan password" : "Tampilkan password"}
                      className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                    >
                      {showLoginPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button type="button" onClick={() => { setForgotEmail(form.email); setForgotOpen(true); }} className="text-xs font-medium text-primary hover:underline">
                    Lupa password?
                  </button>
                </div>
                <Button type="submit" disabled={loading} className="w-full gap-2 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90">
                  {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Masuk...</> : "Masuk"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <div>
                  <Label htmlFor="sname">Nama Lengkap</Label>
                  <Input id="sname" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
                </div>
                <div>
                  <Label htmlFor="semail">Email</Label>
                  <Input id="semail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                </div>
                <div>
                  <Label htmlFor="spass">Password (min 6)</Label>
                  <div className="relative">
                    <Input
                      id="spass"
                      type={showSignupPass ? "text" : "password"}
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      required
                      minLength={6}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignupPass((v) => !v)}
                      aria-label={showSignupPass ? "Sembunyikan password" : "Tampilkan password"}
                      className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                    >
                      {showSignupPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" disabled={loading} className="w-full gap-2 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90">
                  {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Mendaftar...</> : "Buat Akun"}
                </Button>
                <p className="text-center text-xs text-muted-foreground">Kamu akan menerima email verifikasi sebelum bisa login.</p>
              </form>
            </TabsContent>
          </Tabs>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">atau</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <Button type="button" variant="outline" disabled={googleLoading} onClick={handleGoogle} className="w-full gap-2 rounded-xl">
            {googleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z" />
              </svg>
            )}
            Lanjutkan dengan Google
          </Button>
        </CardContent>
      </Card>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>Masukkan email akunmu, kami kirim link untuk reset password.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleForgot} className="space-y-4">
            <div>
              <Label htmlFor="femail">Email</Label>
              <Input id="femail" type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} required />
            </div>
            <Button type="submit" disabled={forgotLoading} className="w-full gap-2 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90">
              {forgotLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> Mengirim...</> : "Kirim link reset"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
