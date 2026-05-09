import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Upload, Trash2, FileText, Image as ImageIcon, Download } from "lucide-react";

type Category = "photo" | "psa" | "assignment" | "jv_contract" | "addendum" | "other";
const CATEGORIES: { key: Category; label: string; accept: string }[] = [
  { key: "photo", label: "Photos", accept: "image/*" },
  { key: "psa", label: "Purchase & Sale Agreement", accept: ".pdf,image/*" },
  { key: "assignment", label: "Assignment", accept: ".pdf,image/*" },
  { key: "jv_contract", label: "JV Contract", accept: ".pdf,image/*" },
  { key: "addendum", label: "Addendums", accept: ".pdf,image/*" },
  { key: "other", label: "Other", accept: "*" },
];

interface DealFile {
  id: string; deal_id: string; category: Category;
  file_path: string; file_name: string; mime_type: string | null; size_bytes: number | null;
}

export function DealFiles({ dealId }: { dealId: string }) {
  const { user } = useAuth();
  const [files, setFiles] = useState<DealFile[]>([]);
  const [busy, setBusy] = useState<Category | null>(null);

  async function load() {
    const { data } = await supabase.from("deal_files").select("*").eq("deal_id", dealId).order("created_at", { ascending: false });
    setFiles((data as any) || []);
  }
  useEffect(() => { load(); }, [dealId]);

  async function upload(cat: Category, list: FileList | null) {
    if (!list || !user) return;
    setBusy(cat);
    for (const file of Array.from(list)) {
      const path = `${user.id}/${dealId}/${cat}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("deal-files").upload(path, file);
      if (upErr) { toast.error(upErr.message); continue; }
      const { error } = await supabase.from("deal_files").insert(withLocation({
        deal_id: dealId, user_id: user.id, category: cat,
        file_path: path, file_name: file.name, mime_type: file.type, size_bytes: file.size,
      }));
      if (error) toast.error(error.message);
    }
    setBusy(null);
    load();
    toast.success("Uploaded");
  }

  async function openFile(f: DealFile) {
    if (/^https?:\/\//i.test(f.file_path)) { window.open(f.file_path, "_blank"); return; }
    const { data } = await supabase.storage.from("deal-files").createSignedUrl(f.file_path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  async function remove(f: DealFile) {
    if (!confirm(`Delete ${f.file_name}?`)) return;
    if (!/^https?:\/\//i.test(f.file_path)) {
      await supabase.storage.from("deal-files").remove([f.file_path]);
    }
    await supabase.from("deal_files").delete().eq("id", f.id);
    load();
  }

  return (
    <div className="space-y-5">
      {CATEGORIES.map((c) => {
        const items = files.filter((f) => f.category === c.key);
        return (
          <div key={c.key} className="rounded-lg border border-border p-3 bg-card">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{c.label}</span>
                <Badge variant="outline" className="text-[10px]">{items.length}</Badge>
              </div>
              <label className="cursor-pointer">
                <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border hover:bg-muted">
                  <Upload className="h-3.5 w-3.5" /> {busy === c.key ? "Uploading…" : "Upload"}
                </span>
                <input hidden type="file" multiple accept={c.accept} onChange={(e) => upload(c.key, e.target.files)} />
              </label>
            </div>
            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground">No files yet.</p>
            ) : (
              <ul className="space-y-1">
                {items.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 text-sm group">
                    {f.mime_type?.startsWith("image/") ? <ImageIcon className="h-4 w-4 text-muted-foreground" /> : <FileText className="h-4 w-4 text-muted-foreground" />}
                    <button onClick={() => openFile(f)} className="flex-1 text-left truncate hover:text-primary">{f.file_name}</button>
                    <button onClick={() => openFile(f)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary"><Download className="h-3.5 w-3.5" /></button>
                    <button onClick={() => remove(f)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
