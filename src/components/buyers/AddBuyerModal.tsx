import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { withLocation } from "@/lib/locationScope";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { X, Upload, CalendarIcon, ArrowLeft } from "lucide-react";
import { MarketsInput } from "./MarketsInput";
import { BUYER_ACTIVITY_OPTIONS } from "@/lib/buyerActivity";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const PROPERTY_TYPES = ["SFH", "MFH 2-4", "MFH 5+", "Commercial", "Land", "Mobile"];
const BUYER_TYPES = ["Flipper", "Landlord", "Developer", "Section 8", "Hedge Fund", "Airbnb / Rooming House", "Padsplit", "Mobile Homes"];
const BUYER_FREQUENCY = ["Full-time Buyer", "Part-time Buyer", "Tax Write-off Buyer"];
const BUYER_STATUS = [
  { value: "not_vetted", label: "Not Vetted" },
  { value: "vetted", label: "Vetted" },
  { value: "vetted_and_closed", label: "Vetted + Closed" },
  { value: "repeat", label: "Repeat Buyer" },
  { value: "recurring", label: "Recurring Buyer" },
];

function MultiChips({ label, options, value, onChange, allowOther, otherValue, onOtherChange }: {
  label: string; options: string[]; value: string[]; onChange: (v: string[]) => void;
  allowOther?: boolean; otherValue?: string; onOtherChange?: (v: string) => void;
}) {
  function toggle(o: string) {
    onChange(value.includes(o) ? value.filter((v) => v !== o) : [...value, o]);
  }
  return (
    <div className="col-span-2 space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button type="button" key={o} onClick={() => toggle(o)}
            className={`px-3 py-1 rounded-full text-xs border transition ${value.includes(o) ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:border-primary/40"}`}>
            {o}
          </button>
        ))}
        {allowOther && (
          <button type="button" onClick={() => toggle("Other")}
            className={`px-3 py-1 rounded-full text-xs border ${value.includes("Other") ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground"}`}>
            Other
          </button>
        )}
      </div>
      {allowOther && value.includes("Other") && (
        <Input placeholder="Specify other property type" value={otherValue || ""} onChange={(e) => onOtherChange?.(e.target.value)} />
      )}
    </div>
  );
}

export function AddBuyerModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [buyerId, setBuyerId] = useState<string | null>(null);

  const initial = {
    first_name: "", last_name: "", email: "", phone: "", company_name: "",
    markets: [] as string[],
    property_types: [] as string[], other_property_type: "",
    buyer_status: "not_vetted",
    buyer_types: [] as string[],
    buyer_frequency: [] as string[],
    price_min: "", price_max: "",
    deals_purchased: "0",
    source: "",
    criteria_notes: "",
    previous_deals: "", experience: "",
    buyer_activity: "currently_buying",
    activity_resume_date: "" as string,
  };
  const [form, setForm] = useState(initial);
  const [pofFiles, setPofFiles] = useState<File[]>([]);

  function set<K extends keyof typeof form>(k: K, v: any) { setForm((f) => ({ ...f, [k]: v })); }

  function reset() {
    setForm(initial);
    setPofFiles([]);
    setStep(1);
    setBuyerId(null);
  }

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    const combined = [...pofFiles, ...files].slice(0, 5);
    setPofFiles(combined);
  }

  async function uploadPof(bId: string): Promise<string[]> {
    if (!user || pofFiles.length === 0) return [];
    const urls: string[] = [];
    for (const f of pofFiles) {
      const path = `${user.id}/${bId}/${Date.now()}-${f.name}`;
      const { error } = await supabase.storage.from("buyer-pof").upload(path, f);
      if (error) { toast.error(`Upload failed: ${error.message}`); continue; }
      urls.push(path);
    }
    return urls;
  }

  // Step 1: create the buyer with the essentials
  async function submitStep1(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const name = `${form.first_name} ${form.last_name}`.trim();
    const payload = {
      user_id: user.id,
      name,
      first_name: form.first_name || null,
      last_name: form.last_name || null,
      email: form.email || null,
      phone: form.phone || null,
      markets: form.markets,
      property_types: form.property_types,
      other_property_type: form.other_property_type || null,
      criteria_notes: form.criteria_notes || null,
    };
    const { data: inserted, error } = await supabase
      .from("buyers")
      .insert(withLocation(payload))
      .select("id")
      .single();
    if (error) { toast.error(error.message); setBusy(false); return; }

    setBuyerId(inserted.id);
    toast.success("Buyer created — add more details or finish");
    onCreated(); // refresh list in the background
    setStep(2);
    setBusy(false);
  }

  // Step 2: update the rest of the fields
  async function submitStep2(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !buyerId) return;
    setBusy(true);

    const updatePayload: Record<string, any> = {
      company_name: form.company_name || null,
      buyer_status: form.buyer_status,
      buyer_types: form.buyer_types,
      buyer_frequency: form.buyer_frequency,
      price_min: form.price_min ? Number(form.price_min) : null,
      price_max: form.price_max ? Number(form.price_max) : null,
      deals_purchased: Math.max(0, Math.min(999, Number(form.deals_purchased) || 0)),
      source: form.source || null,
      previous_deals: form.previous_deals || null,
      experience: form.experience || null,
      buyer_activity: form.buyer_activity,
      activity_resume_date:
        form.buyer_activity === "not_buying_now" && form.activity_resume_date
          ? form.activity_resume_date
          : null,
    };

    if (pofFiles.length > 0) {
      const urls = await uploadPof(buyerId);
      if (urls.length) updatePayload.proof_of_funds_files = urls;
    }

    const { error } = await supabase.from("buyers").update(updatePayload as any).eq("id", buyerId).select("id");
    if (error) { toast.error(error.message); setBusy(false); return; }

    toast.success("Buyer details saved");
    setBusy(false);
    onCreated();
    onClose();
    reset();
  }

  function finishLater() {
    onClose();
    reset();
  }

  function handleClose() {
    onClose();
    reset();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl bg-card border-border max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? "Add Buyer — Step 1 of 2" : "Add Buyer — Step 2 of 2 (Details)"}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1 mb-2">
          {step === 1
            ? "Start with the basics. You can add the rest after the buyer is created."
            : "Optional details. Skip what you don't have — you can edit anytime from the buyer's profile."}
        </p>

        {step === 1 && (
          <form onSubmit={submitStep1} className="grid grid-cols-2 gap-4">
            <div><Label>First Name *</Label><Input required value={form.first_name} onChange={(e) => set("first_name", e.target.value)} /></div>
            <div><Label>Last Name</Label><Input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>

            <MultiChips
              label="What They're Buying (Property Types)"
              options={PROPERTY_TYPES}
              value={form.property_types}
              onChange={(v) => set("property_types", v)}
              allowOther
              otherValue={form.other_property_type}
              onOtherChange={(v) => set("other_property_type", v)}
            />

            <div className="col-span-2">
              <Label>Areas They're Buying</Label>
              <MarketsInput value={form.markets} onChange={(v) => set("markets", v)} />
            </div>

            <div className="col-span-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Buying criteria, preferences, anything else worth noting"
                value={form.criteria_notes}
                onChange={(e) => set("criteria_notes", e.target.value)}
              />
            </div>

            <div className="col-span-2 flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
              <Button type="submit" disabled={busy} className="bg-primary hover:bg-primary-hover">
                {busy ? "Creating…" : "Create & Continue"}
              </Button>
            </div>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={submitStep2} className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Company Name</Label><Input value={form.company_name} onChange={(e) => set("company_name", e.target.value)} /></div>

            <div className="col-span-2">
              <Label>Buyer Status</Label>
              <Select value={form.buyer_status} onValueChange={(v) => set("buyer_status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BUYER_STATUS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Current Activity</Label>
              <Select value={form.buyer_activity} onValueChange={(v) => set("buyer_activity", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BUYER_ACTIVITY_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Expected Resume Date {form.buyer_activity === "not_buying_now" ? "" : "(N/A)"}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={form.buyer_activity !== "not_buying_now"}
                    className={cn("w-full justify-start text-left font-normal", !form.activity_resume_date && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.activity_resume_date ? format(new Date(form.activity_resume_date + "T00:00:00"), "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={form.activity_resume_date ? new Date(form.activity_resume_date + "T00:00:00") : undefined}
                    onSelect={(d) => set("activity_resume_date", d ? format(d, "yyyy-MM-dd") : "")}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <MultiChips label="Buyer Type" options={BUYER_TYPES} value={form.buyer_types} onChange={(v) => set("buyer_types", v)} />
            <MultiChips label="Buyer Frequency" options={BUYER_FREQUENCY} value={form.buyer_frequency} onChange={(v) => set("buyer_frequency", v)} />

            <div><Label>Price Min</Label><Input type="number" value={form.price_min} onChange={(e) => set("price_min", e.target.value)} /></div>
            <div><Label>Price Max</Label><Input type="number" value={form.price_max} onChange={(e) => set("price_max", e.target.value)} /></div>

            <div className="col-span-2">
              <Label>Deals Purchased (your count)</Label>
              <Input type="number" min={0} max={999} value={form.deals_purchased} onChange={(e) => set("deals_purchased", e.target.value)} />
            </div>

            <div className="col-span-2"><Label>Source</Label><Input value={form.source} onChange={(e) => set("source", e.target.value)} placeholder="REIA, Facebook, Referral" /></div>

            <div className="col-span-2 border-t border-border pt-4 mt-2">
              <h3 className="text-sm font-semibold mb-1">Buyer Qualification</h3>
              <p className="text-xs text-muted-foreground mb-3">Complete all three to auto-vet this buyer.</p>
            </div>

            <div className="col-span-2 space-y-2">
              <Label>Proof of Funds (up to 5 files)</Label>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 px-3 py-2 border border-border rounded-md cursor-pointer text-sm hover:bg-muted">
                  <Upload className="h-4 w-4" /> Upload files
                  <input type="file" multiple accept="image/*,.pdf" hidden onChange={onPickFiles} disabled={pofFiles.length >= 5} />
                </label>
                <span className="text-xs text-muted-foreground">{pofFiles.length}/5</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {pofFiles.map((f, i) => (
                  <Badge key={i} variant="outline" className="gap-1">
                    {f.name}
                    <button type="button" onClick={() => setPofFiles(pofFiles.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
                  </Badge>
                ))}
              </div>
            </div>

            <div className="col-span-2"><Label>Previous Deals</Label><Textarea placeholder="Describe past closed deals" value={form.previous_deals} onChange={(e) => set("previous_deals", e.target.value)} /></div>
            <div className="col-span-2"><Label>Experience</Label><Textarea placeholder="Years investing, focus areas, etc." value={form.experience} onChange={(e) => set("experience", e.target.value)} /></div>

            <div className="col-span-2 flex justify-between gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={finishLater}>Finish Later</Button>
                <Button type="submit" disabled={busy} className="bg-primary hover:bg-primary-hover">
                  {busy ? "Saving…" : "Save Details"}
                </Button>
              </div>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
