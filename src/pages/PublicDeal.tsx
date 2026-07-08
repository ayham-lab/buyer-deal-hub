import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function PublicDeal() {
  const { id } = useParams();
  const [deal, setDeal] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("get_public_marketing_deal" as any, { p_id: id });
      setDeal(data);
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <div className="max-w-4xl mx-auto p-8"><Skeleton className="h-96 w-full" /></div>;

  if (!deal || !deal.marketing_published) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <Card><CardContent className="p-8 text-center">
          <h1 className="text-xl font-semibold mb-2">Deal not available</h1>
          <p className="text-muted-foreground">This listing is no longer published.</p>
        </CardContent></Card>
      </div>
    );
  }

  const photos: string[] = deal.marketing_photos || [];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6 lg:p-10 space-y-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">{deal.marketing_name || deal.property_address}</h1>
          <p className="text-muted-foreground mt-1">{deal.property_address}{deal.city ? `, ${deal.city}` : ""}{deal.state ? `, ${deal.state}` : ""}</p>
        </header>

        {photos.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {photos.map((p) => (
              <a key={p} href={p} target="_blank" rel="noreferrer" className="aspect-square rounded-lg overflow-hidden border border-border block">
                <img src={p} alt="" className="w-full h-full object-cover hover:scale-105 transition" />
              </a>
            ))}
          </div>
        )}

        <Card><CardContent className="p-6 grid grid-cols-2 gap-4">
          <Stat label="Asking Price" value={deal.asking_price ? `$${Number(deal.asking_price).toLocaleString()}` : "—"} />
          <Stat label="ARV" value={deal.arv ? `$${Number(deal.arv).toLocaleString()}` : "—"} />
        </CardContent></Card>

        {deal.marketing_description && (
          <Card><CardContent className="p-6">
            <h2 className="text-lg font-semibold mb-3">About this deal</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{deal.marketing_description}</p>
          </CardContent></Card>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
