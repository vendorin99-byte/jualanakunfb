import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const { user, email_data } = payload;

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const email = user?.email;
    const fullName = user?.user_metadata?.full_name || email;
    const tokenHash = email_data?.token_hash;
    const redirectTo = email_data?.redirect_to || "https://jualanakunfb.my.id/verify-email";
    const emailType = email_data?.email_action_type;

    let subject = "";
    let htmlBody = "";
    const verifyLink = `https://jualanakunfb.my.id/auth/confirm?token_hash=${tokenHash}&type=${emailType}&next=${encodeURIComponent(redirectTo)}`;

    if (emailType === "signup" || emailType === "email_change_new") {
      subject = "Verifikasi Email - Jualanakun";
      htmlBody = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8">
        <style>body{font-family:Arial,sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px}h1{color:#2c3e50}.btn{display:inline-block;background:#2c3e50;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;margin:20px 0}.link{word-break:break-all;background:#f5f5f5;padding:10px;border-radius:5px;font-size:12px;color:#555}</style>
        </head>
        <body>
          <h1>Selamat datang di Jualanakun!</h1>
          <p>Halo <strong>${fullName}</strong>,</p>
          <p>Terima kasih sudah mendaftar. Klik tombol di bawah untuk verifikasi email kamu:</p>
          <p><a href="${verifyLink}" class="btn">Verifikasi Email Sekarang</a></p>
          <p>Atau copy link ini ke browser:</p>
          <p class="link">${verifyLink}</p>
          <p style="color:#999;font-size:12px">Link berlaku 24 jam. Jika bukan kamu yang daftar, abaikan email ini.</p>
          <hr>
          <p style="font-size:12px;color:#999">© 2026 Jualanakun. Semua hak dilindungi.</p>
        </body>
        </html>
      `;
    } else if (emailType === "recovery") {
      subject = "Reset Password - Jualanakun";
      const resetLink = `https://jualanakunfb.my.id/auth/confirm?token_hash=${tokenHash}&type=recovery&next=${encodeURIComponent("https://jualanakunfb.my.id/reset-password")}`;
      htmlBody = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8">
        <style>body{font-family:Arial,sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px}h1{color:#2c3e50}.btn{display:inline-block;background:#e74c3c;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;margin:20px 0}.link{word-break:break-all;background:#f5f5f5;padding:10px;border-radius:5px;font-size:12px;color:#555}</style>
        </head>
        <body>
          <h1>Reset Password</h1>
          <p>Halo <strong>${fullName}</strong>,</p>
          <p>Kami menerima permintaan reset password untuk akun kamu. Klik tombol di bawah:</p>
          <p><a href="${resetLink}" class="btn">Reset Password</a></p>
          <p>Atau copy link ini ke browser:</p>
          <p class="link">${resetLink}</p>
          <p style="color:#999;font-size:12px">Link berlaku 1 jam. Jika bukan kamu yang request, abaikan email ini.</p>
          <hr>
          <p style="font-size:12px;color:#999">© 2026 Jualanakun. Semua hak dilindungi.</p>
        </body>
        </html>
      `;
    } else {
      // Unknown type, skip
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "Jualanakun <noreply@jualanakunfb.my.id>",
        to: email,
        subject,
        html: htmlBody,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("Resend error:", result);
      return new Response(JSON.stringify({ error: "Failed to send email", details: result }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ success: true, id: result.id }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    console.error("Hook error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
