import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

interface EmailRequest {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  template?: string;
  data?: Record<string, any>;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

async function verifySupabaseJWT(token: string): Promise<boolean> {
  const jwtSecret = Deno.env.get("SUPABASE_JWT_SECRET");
  if (!jwtSecret) return false;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;

    const pad = (s: string) => s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
    const payload = JSON.parse(atob(pad(parts[1])));

    // Check expiry
    if (payload.exp && payload.exp < Date.now() / 1000) return false;

    // Verify HMAC-SHA256 signature
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(jwtSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const sigBytes = Uint8Array.from(atob(pad(parts[2])), (c) => c.charCodeAt(0));
    const dataBytes = encoder.encode(`${parts[0]}.${parts[1]}`);
    return await crypto.subtle.verify("HMAC", keyMaterial, sigBytes, dataBytes);
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  // Require a valid Supabase-signed JWT (user session, anon key, or service role key).
  // This prevents the function from being called by arbitrary internet requests.
  const token =
    req.headers.get("Authorization")?.replace("Bearer ", "") ??
    req.headers.get("apikey");

  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: jsonHeaders,
    });
  }

  const valid = await verifySupabaseJWT(token);
  if (!valid) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: jsonHeaders,
    });
  }

  try {
    const body: EmailRequest = await req.json();
    const { to, subject, html, text, template, data } = body;

    if (!to || !subject) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, subject" }),
        { status: 400, headers: jsonHeaders }
      );
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY not configured" }),
        { status: 500, headers: jsonHeaders }
      );
    }

    let emailHtml = html;
    if (template && data) {
      emailHtml = renderTemplate(template, data);
    }

    if (!emailHtml && !text) {
      return new Response(
        JSON.stringify({ error: "Must provide html, text, or template" }),
        { status: 400, headers: jsonHeaders }
      );
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "Jualanakun <noreply@jualanakunfb.my.id>",
        to,
        subject,
        html: emailHtml,
        text: text || stripHtml(emailHtml || ""),
      }),
    });

    const resendData = await response.json();

    if (!response.ok) {
      console.error("Resend API error:", resendData);
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: resendData }),
        { status: response.status, headers: jsonHeaders }
      );
    }

    return new Response(JSON.stringify({ success: true, id: resendData.id }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (error) {
    console.error("Error in send-email function:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: jsonHeaders }
    );
  }
});

function renderTemplate(template: string, data: Record<string, any>): string {
  const templates: Record<string, (data: Record<string, any>) => string> = {
    "signup-confirmation": (data) => `
      <h1>Selamat datang di BuyingAccount, ${data.fullName}!</h1>
      <p>Terima kasih telah mendaftar. Untuk menyelesaikan pendaftaran, silakan verifikasi email kamu dengan klik tombol di bawah:</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${data.verifyLink}" style="background: #2c3e50; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block; font-weight: bold;">
          Verifikasi Email
        </a>
      </p>
      <p>Atau copy-paste link ini ke browser kamu:</p>
      <p style="word-break: break-all; background: #f0f0f0; padding: 10px; border-radius: 5px; font-size: 12px;">
        ${data.verifyLink}
      </p>
      <p>Link ini berlaku selama 24 jam. Jika kamu tidak membuat akun, abaikan email ini.</p>
      <p style="color: #999; font-size: 12px;">Email ini dikirim ke: <strong>${data.email}</strong></p>
    `,
    "email-verification": (data) => `
      <h1>Verifikasi Email BuyingAccount</h1>
      <p>Klik tombol di bawah untuk verifikasi email kamu:</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${data.verifyLink}" style="background: #2c3e50; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block; font-weight: bold;">
          Verifikasi Email Sekarang
        </a>
      </p>
      <p>Link berlaku 24 jam. Jika bukan kamu yang request, abaikan email ini.</p>
    `,
    "topup-confirmation": (data) => `
      <h1>Konfirmasi Top Up Saldo</h1>
      <p>Top up sebesar <strong>${data.amount}</strong> berhasil diproses.</p>
      <p>Saldo terbaru kamu: <strong>${data.newBalance}</strong></p>
      <p style="font-size: 12px; color: #999;">Waktu: ${data.timestamp}</p>
      <p>Gunakan saldo kamu untuk membeli akun di BuyingAccount.</p>
    `,
    "order-confirmation": (data) => `
      <h1>Terima kasih atas pesananmu!</h1>
      <p>Nomor pesanan: <strong>${data.orderNumber || ""}</strong></p>
      <p>Total: Rp${(data.total || 0).toLocaleString("id-ID")}</p>
      <p>Status: ${data.status || "Pending"}</p>
      ${
        data.items
          ? `
        <h3>Daftar Barang:</h3>
        <ul>
          ${data.items
            .map(
              (item: any) =>
                `<li>${item.name} x${item.quantity} - Rp${(item.price || 0).toLocaleString("id-ID")}</li>`
            )
            .join("")}
        </ul>
      `
          : ""
      }
      <p>Kami akan menghubungimu segera untuk konfirmasi pembayaran.</p>
    `,
    "order-shipped": (data) => `
      <h1>Pesananmu #${data.orderNumber} sudah dikirim!</h1>
      <p>Kami telah mengirimkan <strong>${data.assignedCount || 1} akun</strong> untuk pesananmu.</p>
      ${data.trackingNumber ? `<p>No. Resi: ${data.trackingNumber}</p>` : ""}
      <p style="background: #f0f0f0; padding: 10px; border-radius: 5px;">
        <strong>Catatan:</strong> ${data.notes || "Silakan cek pesan dan dashboard Anda untuk detail akun."}
      </p>
      <p>Jika ada pertanyaan, hubungi kami via chat atau WhatsApp. Terima kasih!</p>
    `,
    "order-delivered": (data) => `
      <h1>Pesananmu sudah tiba!</h1>
      <p>Nomor pesanan: <strong>${data.orderNumber || ""}</strong></p>
      <p>Silakan cek dan verifikasi barang yang diterima.</p>
      <p>Jika ada masalah, hubungi kami melalui WhatsApp atau email.</p>
    `,
    "order-credentials": (data) => {
      const credRows = (data.credentials || []).map((c: any, i: number) => {
        const rows = [
          `<tr><td colspan="2" style="padding:8px 8px 2px;font-weight:bold;color:#2c3e50;background:#f0f4f8">Akun ${i + 1}${c.grade_label ? ` — ${c.grade_label}` : ""}</td></tr>`,
          c.email    ? `<tr><td style="padding:4px 8px;color:#666;width:120px">Email</td><td style="padding:4px 8px;font-family:monospace">${c.email}</td></tr>` : "",
          c.password ? `<tr><td style="padding:4px 8px;color:#666">Password</td><td style="padding:4px 8px;font-family:monospace">${c.password}</td></tr>` : "",
          c.twofa    ? `<tr><td style="padding:4px 8px;color:#666">2FA Key</td><td style="padding:4px 8px;font-family:monospace">${c.twofa}</td></tr>` : "",
          c.recovery ? `<tr><td style="padding:4px 8px;color:#666">Recovery</td><td style="padding:4px 8px;font-family:monospace">${c.recovery}</td></tr>` : "",
          c.notes    ? `<tr><td style="padding:4px 8px;color:#666">Catatan</td><td style="padding:4px 8px">${c.notes}</td></tr>` : "",
        ].filter(Boolean).join("");
        return rows;
      }).join("");
      return `
        <h1 style="color:#2c3e50">🎉 Pesananmu sudah siap!</h1>
        <p>Halo,</p>
        <p>Pesanan <strong>${data.orderNumber || ""}</strong> sudah diproses. Berikut detail akun yang kamu beli:</p>
        <table style="border-collapse:collapse;width:100%;margin:16px 0;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">
          ${credRows}
        </table>
        ${data.adminNotes ? `<p style="background:#fffbea;padding:10px;border-radius:6px;border-left:3px solid #f59e0b"><strong>Catatan admin:</strong> ${data.adminNotes}</p>` : ""}
        <p>Simpan informasi ini dengan aman. Kamu juga bisa lihat detail order di <a href="https://jualanakunfb.my.id/order/${data.orderNumber}">halaman ordermu</a>.</p>
        <p style="color:#999;font-size:12px">Jika ada masalah, hubungi kami melalui halaman order.</p>
      `;
    },
    "admin-new-order": (data) => `
      <h1>🛒 Order Baru Masuk!</h1>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:8px;color:#666">No. Order</td><td style="padding:8px;font-weight:bold">${data.orderNumber || ""}</td></tr>
        <tr style="background:#f9f9f9"><td style="padding:8px;color:#666">Nama</td><td style="padding:8px">${data.customerName || ""}</td></tr>
        <tr><td style="padding:8px;color:#666">Email</td><td style="padding:8px">${data.customerEmail || ""}</td></tr>
        <tr style="background:#f9f9f9"><td style="padding:8px;color:#666">Total</td><td style="padding:8px;font-weight:bold;color:#2c3e50">Rp${Number(data.totalPrice || 0).toLocaleString("id-ID")}</td></tr>
      </table>
      <p style="margin-top:20px">
        <a href="https://jualanakunfb.my.id/admin/orders" style="background:#2c3e50;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">
          Lihat di Admin Panel
        </a>
      </p>
    `,
    "admin-payment-proof": (data) => `
      <h1>📤 Bukti Pembayaran Diunggah!</h1>
      <p>Customer sudah upload bukti transfer untuk order berikut:</p>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:8px;color:#666">No. Order</td><td style="padding:8px;font-weight:bold">${data.orderNumber || ""}</td></tr>
        <tr style="background:#f9f9f9"><td style="padding:8px;color:#666">Nama</td><td style="padding:8px">${data.customerName || ""}</td></tr>
        <tr><td style="padding:8px;color:#666">Email</td><td style="padding:8px">${data.customerEmail || ""}</td></tr>
        <tr style="background:#f9f9f9"><td style="padding:8px;color:#666">Total</td><td style="padding:8px;font-weight:bold;color:#2c3e50">Rp${Number(data.totalPrice || 0).toLocaleString("id-ID")}</td></tr>
      </table>
      <p style="margin-top:20px">
        <a href="https://jualanakunfb.my.id/admin/orders" style="background:#27ae60;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">
          Verifikasi Sekarang
        </a>
      </p>
    `,
  };

  const render = templates[template];
  if (!render) {
    throw new Error(`Unknown template: ${template}`);
  }

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; color: #333; }
          h1 { color: #2c3e50; }
          p { line-height: 1.6; }
          strong { color: #2c3e50; }
        </style>
      </head>
      <body>
        ${render(data)}
        <hr>
        <p style="font-size: 12px; color: #999;">
          © 2026 Jualanakun. Semua hak dilindungi.
        </p>
      </body>
    </html>
  `;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}
