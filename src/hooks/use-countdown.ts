import { useState, useEffect } from "react";

function getRemaining(endsAt: string | null): number {
  if (!endsAt) return 0;
  return Math.max(0, Math.floor((new Date(endsAt).getTime() - Date.now()) / 1000));
}

export function useCountdown(endsAt: string | null | undefined) {
  const [remaining, setRemaining] = useState(() => getRemaining(endsAt ?? null));

  useEffect(() => {
    setRemaining(getRemaining(endsAt ?? null));
    if (!endsAt) return;
    const id = setInterval(() => {
      const r = getRemaining(endsAt);
      setRemaining(r);
      if (r <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  if (remaining <= 0) return { isActive: false, formatted: null };

  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  return {
    isActive: true,
    formatted: h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`,
  };
}
