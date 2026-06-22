import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, MailCheck, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

type Status = "pending" | "verifying" | "success" | "error";

export default function VerifyEmail() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialEmail = params.get("email") || "";
  const [status, setStatus] = useState<Status>("pending");
  const [errorMsg, setErrorMsg] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Detect verification result from auth state (Supabase parses the URL hash automatically)
  useEffect(() => {
    const hash = window.location.hash;
    const hasToken = hash.includes("access_token") || hash.includes("type=signup");
    const hasError = hash.includes("error");

    if (hasError) {
      const errParam = new URLSearchParams(hash.replace("#", ""));
      setStatus("error");
      setErrorMsg(errParam.get("error_description")?.replace(/\+/g, " ") || "Link verifikasi tidak valid atau sudah kadaluarsa.");
      return;
    }

    if (hasToken) setStatus("verifying");

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        setStatus("success");
        setTimeout(() => navigate("/profile", { replace: true }), 1500);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  // Countdown for resend
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = z.string().email().safeParse(email.trim());
    if (!parsed.success) { toast.error("Email tidak valid"); return; }
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: parsed.data,
        options: { emailRedirectTo: `${window.location.origin}/verify-email` },
      });
      if (error) throw error;
      toast.success("Email verifikasi sudah dikirim ulang");
      setCooldown(60);
    } catch (err: any) {
      toast.error(err.message || "Gagal kirim ulang email");
    } finally { setResending(false); }
  };

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md border-0 shadow-xl">
        <CardContent className="p-8 text-center">
          {status === "verifying" && (
            <>
              <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-primary" />
              <h1 className="mb-2 text-xl font-bold">Memverifikasi email...</h1>
              <p className="text-sm text-muted-foreground">Tunggu sebentar.</p>
            </>
          )}

          {status === "success" && (
            <>
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h1 className="mb-2 text-xl font-bold">Email terverifikasi!</h1>
              <p className="mb-4 text-sm text-muted-foreground">Akun kamu aktif. Mengalihkan ke profil...</p>
            </>
          )}

          {status === "error" && (
            <>
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                <XCircle className="h-8 w-8" />
              </div>
              <h1 className="mb-2 text-xl font-bold">Verifikasi gagal</h1>
              <p className="mb-6 text-sm text-muted-foreground">{errorMsg}</p>
              <form onSubmit={handleResend} className="space-y-3 text-left">
                <Label htmlFor="vemail">Kirim ulang email verifikasi</Label>
                <Input id="vemail" type="email" placeholder="email@contoh.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                <Button type="submit" disabled={resending || cooldown > 0} className="w-full gap-2 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90">
                  {resending ? <><Loader2 className="h-4 w-4 animate-spin" /> Mengirim...</> : cooldown > 0 ? `Tunggu ${cooldown}s` : "Kirim Ulang"}
                </Button>
              </form>
            </>
          )}

          {status === "pending" && (
            <>
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-primary-foreground">
                <MailCheck className="h-7 w-7" />
              </div>
              <h1 className="mb-2 text-xl font-bold">Cek email kamu</h1>
              <p className="mb-6 text-sm text-muted-foreground">
                Kami sudah mengirim link verifikasi {email && <>ke <span className="font-semibold text-foreground">{email}</span></>}. Klik link di email untuk mengaktifkan akun.
              </p>
              <form onSubmit={handleResend} className="space-y-3 text-left">
                <Label htmlFor="vemail2">Tidak terima emailnya?</Label>
                <Input id="vemail2" type="email" placeholder="email@contoh.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                <Button type="submit" disabled={resending || cooldown > 0} variant="outline" className="w-full gap-2 rounded-xl">
                  {resending ? <><Loader2 className="h-4 w-4 animate-spin" /> Mengirim...</> : cooldown > 0 ? `Tunggu ${cooldown}s untuk kirim ulang` : "Kirim Ulang Email"}
                </Button>
              </form>
              <p className="mt-6 text-xs text-muted-foreground">
                Sudah verifikasi? <Link to="/auth" className="font-semibold text-primary hover:underline">Login di sini</Link>
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}