import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { withLocation } from "@/lib/locationScope";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Check, Loader2, Building2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { DEAL_TYPE_LABELS } from "@/pages/TitleCompanies";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

type ArchiveRow = {
  id: string; source: string; name: string; contact_name: string | null; email: string | null;
  phone: string | null; address: string | null;
  service_states: string[]; service_cities: string[];
  charges_file_fee: boolean; file_fee_amount: number | null;
  deal_types: string[]; notes: string | null;
  usage_count: number;
};

export function ArchiveTitleCompaniesBrowser({ open, onClose, onAdded }: {
  open: boolean; onClose: () => void; onAdded: () => void;
}) {
  const { user } = useAuth();
  const [items, setItems] = useState<ArchiveRow[]>([]);
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [state, setState] = useState("all");

  useEffect(() => {
    if (!open || !user) return;
    (async () => {
      setLoading(true);
      const [{ data: ar }, { data: mine }] = await Promise.all([
        supabase.rpc("list_title_company_archive" as any),
        supabase.from("title_companies").select("name").eq("user_id", user.id),
      ]);
      setItems((ar as any) || []);
      setExistingNames(new Set(((mine as any[]) || []).map((r) => r.name.toLowerCase())));
      setLoading(false);
    })();
  }, [open, user]);

  const filtered = useMemo(() => {
    const s = q.toLowerCase().trim();
    return items.filter((t) => {
      const matchQ = !s || t.name.toLowerCase().includes(s) ||
        (t.contact_name || "").toLowerCase().includes(s) ||
        (t.email || "").toLowerCase().includes(s) ||
        t.service_cities.some((c) => c.toLowerCase().includes(s));
      const matchState = state === "all" || t.service_states.includes(state);
      return matchQ && matchState;
    });
  }, [items, q, state]);

  async function addToRolodex(row: ArchiveRow) {
    if (!user) return;
    setAdding(row.id);
    const payload = withLocation({
      user_id: user.id,
      name: row.name,
      contact_name: row.contact_name,
      email: row.email,
      phone: row.phone,
      address: row.address,
      service_states: row.service_states || [],
      service_cities: row.service_cities || [],
      charges_file_fee: row.charges_file_fee,
      file_fee_amount: row.file_fee_amount,
      deal_types: row.deal_types || [],
      notes: row.notes,
    } as Record<string, unknown>);
    const { error } = await supabase.from("title_companies").insert(payload as any);
    setAdding(null);
    if (error) return toast({ title: "Failed to add", description: error.message, variant: "destructive" });
    toast({ title: "Added to your rolodex", description: row.name });
    setExistingNames((s) => new Set(s).add(row.name.toLowerCase()));
    onAdded();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" /> Title Company Archive
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-3 pb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search by name, contact, email, city…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={state} onValueChange={setState}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all">All states</SelectItem>
              {US_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-y-auto -mx-6 px-6 space-y-2">
          {loading ? (
            <div className="py-10 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">
              {items.length === 0 ? "Archive is empty. Admins can add companies from the Admin Console." : "No matches."}
            </div>
          ) : filtered.map((t) => {
            const already = existingNames.has(t.name.toLowerCase());
            return (
              <div key={t.id} className="border border-border rounded-lg p-4 bg-card hover:border-primary/40 transition">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold">{t.name}</h4>
                      {t.contact_name && <span className="text-sm text-muted-foreground">· {t.contact_name}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 space-x-3">
                      {t.phone && <span>{t.phone}</span>}
                      {t.email && <span>{t.email}</span>}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {t.service_states.slice(0, 6).map((s) => <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>)}
                      {t.service_cities.slice(0, 4).map((c) => <Badge key={c} variant="outline" className="text-[10px]">{c}</Badge>)}
                      {t.deal_types.map((d) => <Badge key={d} className="text-[10px]">{DEAL_TYPE_LABELS[d] || d}</Badge>)}
                      {t.charges_file_fee && (
                        <Badge variant="outline" className="text-[10px]">
                          File fee {t.file_fee_amount ? `$${Number(t.file_fee_amount).toLocaleString()}` : ""}
                        </Badge>
                      )}
                    </div>
                    {t.notes && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{t.notes}</p>}
                  </div>
                  <Button
                    size="sm"
                    disabled={already || adding === t.id}
                    onClick={() => addToRolodex(t)}
                    className="bg-primary hover:bg-primary-hover shrink-0"
                  >
                    {already ? (<><Check className="h-4 w-4 mr-1" /> In Rolodex</>) :
                      adding === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> :
                      (<><Plus className="h-4 w-4 mr-1" /> Add</>)}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
