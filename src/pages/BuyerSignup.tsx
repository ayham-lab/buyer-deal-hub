import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const FN_URL = `https://ihvqhjrrahgyunmfvtrp.supabase.co/functions/v1/buyer-intake`;

export default function BuyerSignup() {
  const { token = "" } = useParams();
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [workspace, setWorkspace] = useState<string>("");
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    company_name: "",
    markets: "",
    property_types: "",
    price_min: "",
    price_max: "",
    previous_deals: "",
    experience: "",
    criteria_notes: "",
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${FN_URL}?token=${encodeURIComponent(token)}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!data?.is_active) throw new Error();
        setWorkspace(data.workspace_name ?? "Workspace");
        document.title = `Buyer signup · ${data.workspace_name ?? ""}`;
      } catch {
        setInvalid(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const on = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email && !form.phone) {
      toast.error("Please provide an email or phone.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...form, source: "public_form" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || data?.error || "Submission failed");
      setDone(true);
    } catch (err: any) {
      toast.error(err.message || "Could not submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (invalid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-semibold mb-2">Link not available</h1>
          <p className="text-muted-foreground">This signup link is invalid or has been disabled. Please contact the person who shared it.</p>
        </div>
      </div>
    );
  }
  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center max-w-md">
          <CheckCircle2 className="h-12 w-12 text-primary mx-auto mb-3" />
          <h1 className="text-2xl font-semibold mb-2">You're on the list</h1>
          <p className="text-muted-foreground">Thanks! {workspace} will reach out with deals that match your criteria.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <header className="mb-6">
          <h1 className="text-3xl font-bold">Get on the buyers list</h1>
          <p className="text-muted-foreground mt-1">
            {workspace} sends off-market deals to vetted buyers. Fill this out to be notified when a match hits.
          </p>
        </header>
        <form onSubmit={submit} className="space-y-4 bg-card border rounded-lg p-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><Label>First name</Label><Input value={form.first_name} onChange={on("first_name")} /></div>
            <div><Label>Last name</Label><Input value={form.last_name} onChange={on("last_name")} /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={on("email")} /></div>
            <div><Label>Phone</Label><Input type="tel" value={form.phone} onChange={on("phone")} /></div>
            <div className="md:col-span-2"><Label>Company (optional)</Label><Input value={form.company_name} onChange={on("company_name")} /></div>
            <div className="md:col-span-2"><Label>Markets / cities (comma separated)</Label><Input placeholder="Philadelphia, Camden, Trenton" value={form.markets} onChange={on("markets")} /></div>
            <div className="md:col-span-2"><Label>Property types (comma separated)</Label><Input placeholder="Single Family, Multi Family, Townhouse" value={form.property_types} onChange={on("property_types")} /></div>
            <div><Label>Min price</Label><Input type="number" value={form.price_min} onChange={on("price_min")} /></div>
            <div><Label>Max price</Label><Input type="number" value={form.price_max} onChange={on("price_max")} /></div>
            <div className="md:col-span-2"><Label>Previous deals</Label><Textarea rows={2} value={form.previous_deals} onChange={on("previous_deals")} /></div>
            <div className="md:col-span-2"><Label>Experience</Label><Textarea rows={2} value={form.experience} onChange={on("experience")} /></div>
            <div className="md:col-span-2"><Label>Buy box notes</Label><Textarea rows={3} value={form.criteria_notes} onChange={on("criteria_notes")} /></div>
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting…</> : "Add me to the list"}
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            By submitting, you agree to be contacted about investment opportunities.
          </p>
        </form>
      </div>
    </div>
  );
}
