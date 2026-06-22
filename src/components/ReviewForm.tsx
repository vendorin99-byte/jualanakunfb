import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { StarRating } from "./StarRating";
import { toast } from "sonner";

interface Props {
  productId: string;
  orderId: string;
  onSuccess?: () => void;
}

export function ReviewForm({ productId, orderId, onSuccess }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  const { data: existing } = useQuery({
    queryKey: ["review-mine", user?.id, productId],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("product_reviews")
        .select("id, rating, comment")
        .eq("user_id", user!.id)
        .eq("product_id", productId)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (existing) {
      setRating(existing.rating);
      setComment(existing.comment || "");
    }
  }, [existing]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("login");
      if (existing) {
        const { error } = await supabase
          .from("product_reviews")
          .update({ rating, comment: comment.trim() || null })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("product_reviews").insert({
          user_id: user.id,
          product_id: productId,
          order_id: orderId,
          rating,
          comment: comment.trim() || null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(existing ? "Ulasan diperbarui" : "Ulasan dikirim");
      qc.invalidateQueries({ queryKey: ["review-mine", user?.id, productId] });
      qc.invalidateQueries({ queryKey: ["product-reviews", productId] });
      onSuccess?.();
    },
    onError: (e: any) => toast.error("Gagal: " + (e.message || "unknown")),
  });

  if (!user) return null;

  return (
    <Card className="border-0 shadow-md">
      <CardContent className="space-y-3 p-5">
        <h3 className="font-semibold">{existing ? "Edit Ulasan" : "Berikan Ulasan"}</h3>
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Rating</p>
          <StarRating value={rating} onChange={setRating} />
        </div>
        <Textarea
          placeholder="Bagaimana pengalamanmu? (opsional)"
          maxLength={1000}
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        <Button
          onClick={() => submit.mutate()}
          disabled={submit.isPending}
          className="w-full bg-gradient-to-r from-primary to-accent text-primary-foreground"
        >
          {submit.isPending ? "Mengirim..." : existing ? "Perbarui Ulasan" : "Kirim Ulasan"}
        </Button>
      </CardContent>
    </Card>
  );
}