import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { withLocation, scopeToLocation } from "@/lib/locationScope";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AddBuyerModal } from "@/components/buyers/AddBuyerModal";
import { Pencil, Trash2, Plus, ChevronsUpDown, Check } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Offer = {
  id: string;
  deal_id: string;
  buyer_id: string;
  offer_amount: number;
  emd_amount: number | null;
  ideal_closing_date: string | null;
  offer_date: string;
  status: "active" | "accepted" | "countered" | "rejected" | "withdrawn";
  contingencies: string[];
  contingencies_other: string | null;
  notes: string | null;
  created_at: string;
};

type BuyerLite = { id: string; name: string; company_name: string | null; phone: string | null };

const STANDARD_CONTINGENCIES = [
  "Inspection", "Financing", "Appraisal", "Sale of buyer's property",
  "Title", "Survey", "Insurance", "HOA review",
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "accepted", label: "Accepted" },
  { value: "countered", label: "Countered" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
] as const;

function statusClasses(status: string) {
  switch (status) {
    case "accepted": return "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30";
    case "countered": return "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30";
    case "rejected": return "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30";
    case "withdrawn": return "bg-muted text-muted-foreground border-border";
    default: return "bg-secondary text-secondary-foreground border-border";
  }
}

function fmt$(n: number | null | undefined) {
  if (n == null) return "—";
  return `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function DealOffers({ dealId }: { dealId: string }) {
  const { user } = useAuth();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [buyers, setBuyers] = useState<BuyerLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Offer | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true);
    const [{ data: o }, { data: b }] = await Promise.all([
      supabase.from("deal_offers" as any).select("*").eq("deal_id", dealId).order("created_at", { ascending: false }),
      scopeToLocation(supabase.from("buyers").select("id,name,company_name,phone").order("name")),
    ]);
    setOffers((o as any) || []);
    setBuyers((b as any) || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [dealId]);

  const buyerMap = Object.fromEntries(buyers.map((b) => [b.id, b]));

  async function confirmDelete() {
    if (!deleteId) return;
    const { error } = await supabase.from("deal_offers" as any).delete().eq("id", deleteId);
    if (error) toast.error(error.message);
    else { toast.success("Offer deleted"); load(); }
    setDeleteId(null);
  }

  function openAdd() { setEditing(null); setShowForm(true); }
  function openEdit(o: Offer) { setEditing(o); setShowForm(true); }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openAdd} className="bg-primary hover:bg-primary-hover">
          <Plus className="h-4 w-4 mr-1" /> Add Offer
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground text-center py-8">Loading…</div>
      ) : offers.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-12 border border-dashed border-border rounded-lg">
          No offers tracked yet. Click <span className="font-medium">Add Offer</span> to start tracking buyer offers on this deal.
        </div>
      ) : (
        <ul className="space-y-3">
          {offers.map((o) => {
            const b = buyerMap[o.buyer_id];
            const buyerName = b ? (b.company_name ? `${b.name} (${b.company_name})` : b.name) : "Unknown buyer";
            const isExpanded = expandedNotes[o.id];
            const notesShort = o.notes && o.notes.length > 80 ? `${o.notes.slice(0, 80)}…` : o.notes;
            return (
              <li key={o.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{buyerName}</span>
                      <Badge variant="outline" className={cn("text-xs", statusClasses(o.status))}>
                        {o.status.charAt(0).toUpperCase() + o.status.slice(1)}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-xs">
                      <div><div className="text-muted-foreground">Offer</div><div className="font-medium">{fmt$(o.offer_amount)}</div></div>
                      <div><div className="text-muted-foreground">EMD</div><div className="font-medium">{fmt$(o.emd_amount)}</div></div>
                      <div><div className="text-muted-foreground">Ideal close</div><div className="font-medium">{o.ideal_closing_date ? format(new Date(o.ideal_closing_date), "MMM d, yyyy") : "—"}</div></div>
                      <div><div className="text-muted-foreground">Offer date</div><div className="font-medium">{format(new Date(o.offer_date), "MMM d, yyyy")}</div></div>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(o)} aria-label="Edit offer">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(o.id)} aria-label="Delete offer">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {(o.contingencies.length > 0 || o.contingencies_other) && (
                  <div className="flex flex-wrap gap-1">
                    {o.contingencies.map((c) => (
                      <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>
                    ))}
                    {o.contingencies_other && (
                      <Badge variant="secondary" className="text-[10px]">{o.contingencies_other}</Badge>
                    )}
                  </div>
                )}
                {o.notes && (
                  <button
                    type="button"
                    onClick={() => setExpandedNotes((s) => ({ ...s, [o.id]: !s[o.id] }))}
                    className="text-xs text-left text-muted-foreground hover:text-foreground w-full"
                  >
                    {isExpanded ? o.notes : notesShort}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <OfferFormModal
        open={showForm}
        onClose={() => setShowForm(false)}
        dealId={dealId}
        editing={editing}
        buyers={buyers}
        onBuyersChanged={load}
        onSaved={() => { setShowForm(false); load(); }}
        userId={user?.id}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this offer?</AlertDialogTitle>
            <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function OfferFormModal({
  open, onClose, dealId, editing, buyers, onBuyersChanged, onSaved, userId,
}: {
  open: boolean;
  onClose: () => void;
  dealId: string;
  editing: Offer | null;
  buyers: BuyerLite[];
  onBuyersChanged: () => void;
  onSaved: () => void;
  userId?: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [buyerId, setBuyerId] = useState<string>("");
  const [offerAmount, setOfferAmount] = useState("");
  const [emdAmount, setEmdAmount] = useState("");
  const [closingDate, setClosingDate] = useState("");
  const [offerDate, setOfferDate] = useState(today);
  const [status, setStatus] = useState<Offer["status"]>("active");
  const [contingencies, setContingencies] = useState<string[]>([]);
  const [contingenciesOther, setContingenciesOther] = useState("");
  const [notes, setNotes] = useState("");
  const [buyerPopoverOpen, setBuyerPopoverOpen] = useState(false);
  const [showAddBuyer, setShowAddBuyer] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setBuyerId(editing.buyer_id);
      setOfferAmount(String(editing.offer_amount));
      setEmdAmount(editing.emd_amount != null ? String(editing.emd_amount) : "");
      setClosingDate(editing.ideal_closing_date || "");
      setOfferDate(editing.offer_date);
      setStatus(editing.status);
      setContingencies(editing.contingencies || []);
      setContingenciesOther(editing.contingencies_other || "");
      setNotes(editing.notes || "");
    } else {
      setBuyerId(""); setOfferAmount(""); setEmdAmount("");
      setClosingDate(""); setOfferDate(today); setStatus("active");
      setContingencies([]); setContingenciesOther(""); setNotes("");
    }
  }, [open, editing]);

  function toggleContingency(c: string) {
    setContingencies((cs) => cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]);
  }

  async function submit() {
    if (!buyerId) { toast.error("Please select a buyer"); return; }
    const amt = Number(offerAmount);
    if (!offerAmount || isNaN(amt) || amt <= 0) { toast.error("Enter a valid offer amount"); return; }
    setSaving(true);
    const payload = {
      buyer_id: buyerId,
      offer_amount: amt,
      emd_amount: emdAmount ? Number(emdAmount) : null,
      ideal_closing_date: closingDate || null,
      offer_date: offerDate,
      status,
      contingencies,
      contingencies_other: contingenciesOther.trim() || null,
      notes: notes.trim() || null,
    };
    let error;
    if (editing) {
      ({ error } = await supabase.from("deal_offers" as any).update(payload).eq("id", editing.id));
    } else {
      ({ error } = await supabase.from("deal_offers" as any).insert(
        withLocation({ ...payload, deal_id: dealId, user_id: userId, created_by: userId }),
      ));
    }
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success(editing ? "Offer updated" : "Offer added"); onSaved(); }
  }

  const selectedBuyer = buyers.find((b) => b.id === buyerId);

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Offer" : "Add Offer"}</DialogTitle>
            <DialogDescription>Track a buyer's offer on this deal.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Buyer</label>
              <Popover open={buyerPopoverOpen} onOpenChange={setBuyerPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                    {selectedBuyer ? (selectedBuyer.company_name ? `${selectedBuyer.name} (${selectedBuyer.company_name})` : selectedBuyer.name) : "Select a buyer…"}
                    <ChevronsUpDown className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search by name, company, or phone…" />
                    <CommandList>
                      <CommandEmpty>No buyers found.</CommandEmpty>
                      <CommandGroup>
                        {buyers.map((b) => {
                          const label = b.company_name ? `${b.name} (${b.company_name})` : b.name;
                          const searchVal = `${b.name} ${b.company_name ?? ""} ${b.phone ?? ""}`;
                          return (
                            <CommandItem
                              key={b.id}
                              value={searchVal}
                              onSelect={() => { setBuyerId(b.id); setBuyerPopoverOpen(false); }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", buyerId === b.id ? "opacity-100" : "opacity-0")} />
                              <div className="flex flex-col">
                                <span>{label}</span>
                                {b.phone && <span className="text-xs text-muted-foreground">{b.phone}</span>}
                              </div>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                      <CommandGroup>
                        <CommandItem onSelect={() => { setBuyerPopoverOpen(false); setShowAddBuyer(true); }}>
                          <Plus className="mr-2 h-4 w-4" /> Add new buyer to Rolodex
                        </CommandItem>
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Offer Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input type="number" step="0.01" min="0" value={offerAmount} onChange={(e) => setOfferAmount(e.target.value)} className="pl-7" placeholder="0.00" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">EMD Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input type="number" step="0.01" min="0" value={emdAmount} onChange={(e) => setEmdAmount(e.target.value)} className="pl-7" placeholder="0.00" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Ideal Closing</label>
                <Input type="date" value={closingDate} onChange={(e) => setClosingDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Offer Date</label>
                <Input type="date" value={offerDate} onChange={(e) => setOfferDate(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium">Status</label>
              <Select value={status} onValueChange={(v) => setStatus(v as Offer["status"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium">Contingencies</label>
              <div className="grid grid-cols-2 gap-2 p-3 border border-border rounded-md">
                {STANDARD_CONTINGENCIES.map((c) => (
                  <label key={c} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={contingencies.includes(c)} onCheckedChange={() => toggleContingency(c)} />
                    <span>{c}</span>
                  </label>
                ))}
              </div>
              <Input
                value={contingenciesOther}
                onChange={(e) => setContingenciesOther(e.target.value)}
                placeholder="Other (specify)…"
                className="mt-2"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium">Notes</label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Anything important about this offer…" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={submit} disabled={saving} className="bg-primary hover:bg-primary-hover">
              {saving ? "Saving…" : editing ? "Save Changes" : "Add Offer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddBuyerModal
        open={showAddBuyer}
        onClose={() => setShowAddBuyer(false)}
        onCreated={async (newBuyerId?: string) => {
          setShowAddBuyer(false);
          await onBuyersChanged();
          if (newBuyerId) setBuyerId(newBuyerId);
        }}
      />
    </>
  );
}
