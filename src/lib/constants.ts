export const CATEGORIES = [
  { value: 'all', label: 'Semua', emoji: '🏪' },
  { value: 'facebook', label: 'Facebook', emoji: '📘' },
  { value: 'instagram', label: 'Instagram', emoji: '📸' },
  { value: 'tiktok', label: 'TikTok', emoji: '🎵' },
  { value: 'gaming', label: 'Gaming', emoji: '🎮' },
  { value: 'tools', label: 'Tools', emoji: '🛠️' },
  { value: 'crypto', label: 'Crypto', emoji: '₿' },
] as const;

export const CATEGORY_EMOJI: Record<string, string> = {
  facebook: '📘',
  instagram: '📸',
  tiktok: '🎵',
  gaming: '🎮',
  tools: '🛠️',
  crypto: '₿',
};

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function getStockBadge(stock: number) {
  if (stock === 0) return { label: 'Habis', variant: 'destructive' as const, pulse: false, badgeClass: '' };
  if (stock <= 5) return { label: 'Terbatas', variant: 'secondary' as const, pulse: true, badgeClass: '' };
  return { label: 'Ready', variant: 'default' as const, pulse: false, badgeClass: 'bg-yellow-400 text-yellow-900 hover:bg-yellow-400/80 border-transparent' };
}
