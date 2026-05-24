import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { withLocation } from "@/lib/locationScope";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Copy, Trash2, Upload, ExternalLink, Sparkles } from "lucide-react";
import {
  generateMarketingTemplate,
  MARKETING_PROPERTY_FIELDS,
  MARKETING_CONDITION_FIELDS,
} from "@/lib/marketingTemplate";

interface Props {
  dealId: string;
  deal: any;
  onChange: (patch: any) => void;
}

export function DealMarketing({ dealId, deal, onChange }: Props) {
  const { user } = useAuth();
  const [name, setName] = useState(deal.marketing_name ?? "");
  const [desc, setDesc] = useState(deal.marketing_description ?? "");
  const [photos, setPhotos] = useState<string[]>(deal.marketing_photos ?? []);
  const [published, setPublished] = useState(!!deal.marketing_published);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setName(deal.marketing_name ?? "");
    setDesc(deal.marketing_description ?? "");
    setPhotos(deal.marketing_photos ?? []);
    setPublished(!!deal.marketing_published);
  }, [dealId]);

  async function save(patch: Record<string, any>) {
    const { error } = await supabase.from("deals").update(patch as any).eq("id", dealId);
    if (error) return toast.error(error.message);
    onChange(patch);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!user || !e.target.files?.length) return;
    setUploading(true);
    const newPaths: string[] = [];
    for (const file of Array.from(e.target.files)) {
      const path = `${user.id}/${dealId}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("deal-marketing").upload(path, file);
      if (error) { toast.error(error.message); continue; }
      const { data } = supabase.storage.from("deal-marketing").getPublicUrl(path);
      newPaths.push(data.publicUrl);
      // Also link into the Files tab under "Photos"
      await supabase.from("deal_files").insert(withLocation({
        deal_id: dealId, user_id: user.id, category: "photo",
        file_path: data.publicUrl, file_name: file.name, mime_type: file.type, size_bytes: file.size,
      }));
    }
    const updated = [...photos, ...newPaths];
    setPhotos(updated);
    await save({ marketing_photos: updated });
    setUploading(false);
    e.target.value = "";
  }

  async function removePhoto(url: string) {
    const updated = photos.filter((p) => p !== url);
    setPhotos(updated);
    await save({ marketing_photos: updated });
    // best-effort remove from storage
    const idx = url.indexOf("/deal-marketing/");
    if (idx >= 0) {
      const path = url.slice(idx + "/deal-marketing/".length);
      await supabase.storage.from("deal-marketing").remove([path]);
    }
  }

  const publicUrl = `${window.location.origin}/deal/${dealId}`;

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border p-3 bg-muted/30 space-y-1.5 text-sm">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Linked from Overview</div>
        <div><span className="text-muted-foreground">Address:</span> {deal.property_address || "—"}</div>
        <div><span className="text-muted-foreground">Asking Price:</span> {deal.asking_price ? `$${Number(deal.asking_price).toLocaleString()}` : "—"}</div>
        <div><span className="text-muted-foreground">Minimum Sale Price:</span> {deal.minimum_sale_price ? `$${Number(deal.minimum_sale_price).toLocaleString()}` : "—"}</div>
      </div>

      <div>
        <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Deal Name</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== (deal.marketing_name ?? "") && save({ marketing_name: name })}
          placeholder="e.g. Charming 3BR Bungalow in Tampa"
        />
      </div>

      <PropertyConditionEditor deal={deal} save={save} />

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Marketing Description</label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1.5"
            onClick={async () => {
              const { data: prof } = await supabase
                .from("profiles")
                .select("name, email, phone_number")
                .eq("user_id", user?.id ?? "")
                .maybeSingle();
              const tpl = generateMarketingTemplate(deal, {
                name: prof?.name,
                email: prof?.email,
                phone: prof?.phone_number,
              });
              setDesc(tpl);
              await save({ marketing_description: tpl });
              toast.success("Template generated. Fill in any [ADD] placeholders.");
            }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Generate template
          </Button>
        </div>
        <Textarea
          rows={18}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onBlur={() => desc !== (deal.marketing_description ?? "") && save({ marketing_description: desc })}
          placeholder="Click Generate template to auto-fill, or write your own…"
          className="font-mono text-xs"
        />
      </div>

      <div>
        <label className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2 block">Photos</label>
        <div className="grid grid-cols-3 gap-2 mb-2">
          {photos.map((p) => (
            <div key={p} className="relative group aspect-square rounded-md overflow-hidden border border-border">
              <img src={p} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => removePhoto(p)}
                className="absolute top-1 right-1 bg-background/80 hover:bg-destructive hover:text-destructive-foreground rounded p-1 opacity-0 group-hover:opacity-100 transition"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <label className="inline-flex items-center gap-2 cursor-pointer text-sm border border-border rounded-md px-3 py-2 hover:bg-muted">
          <Upload className="h-4 w-4" />
          {uploading ? "Uploading…" : "Upload photos"}
          <input type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>

      <div className="rounded-lg border border-border p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Public Marketing Page</div>
            <div className="text-xs text-muted-foreground">When published, anyone with the link can view this deal.</div>
          </div>
          <Switch checked={published} onCheckedChange={(v) => { setPublished(v); save({ marketing_published: v }); }} />
        </div>
        {published && (
          <div className="flex items-center gap-2">
            <Input value={publicUrl} readOnly className="text-xs" />
            <Button type="button" size="icon" variant="outline" onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success("Link copied"); }}>
              <Copy className="h-4 w-4" />
            </Button>
            <Button type="button" size="icon" variant="outline" onClick={() => window.open(publicUrl, "_blank")}>
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
