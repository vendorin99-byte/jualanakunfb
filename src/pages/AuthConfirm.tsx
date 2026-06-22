import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export default function AuthConfirm() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  useEffect(() => {
    const tokenHash = params.get("token_hash");
    const type = params.get("type") as any;
    const next = params.get("next") || "/profile";

    if (!tokenHash || !type) {
      navigate("/verify-email", { replace: true });
      return;
    }

    supabase.auth.verifyOtp({ token_hash: tokenHash, type }).then(({ error }) => {
      if (error) {
        navigate(`/verify-email?error=${encodeURIComponent(error.message)}`, { replace: true });
      } else if (type === "recovery") {
        navigate("/reset-password", { replace: true });
      } else {
        const destination = next.startsWith("http")
          ? new URL(next).pathname
          : next;
        navigate(destination || "/profile", { replace: true });
      }
    });
  }, []);

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="text-center">
        <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Memverifikasi...</p>
      </div>
    </div>
  );
}
