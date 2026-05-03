import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Plus } from "lucide-react";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

type MarketType = "state" | "zip" | "county" | "city";

/**
 * Markets are stored as structured strings to keep a single text[] column but stay parseable:
 *   State:TX
 *   Zip:75001
 *   County:Dallas, TX
 *   City:Chicago, IL
 */
export function formatMarket(type: MarketType, value: string, state?: string): string {
  const v = value.trim();
  switch (type) {
    case "state": return `State:${v.toUpperCase()}`;
    case "zip": return `Zip:${v}`;
    case "county": return `County:${v}, ${(state || "").toUpperCase()}`;
    case "city": return `City:${v}, ${(state || "").toUpperCase()}`;
  }
}

export function MarketsInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [type, setType] = useState<MarketType>("city");
  const [name, setName] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");

  function reset() { setName(""); setState(""); setZip(""); }

  function add() {
    if (type === "state") {
      if (!state) return;
      const m = formatMarket("state", state);
      if (!value.includes(m)) onChange([...value, m]);
    } else if (type === "zip") {
      const z = zip.trim();
      if (!/^\d{5}$/.test(z)) return;
      const m = formatMarket("zip", z);
      if (!value.includes(m)) onChange([...value, m]);
    } else {
      if (!name.trim() || !state) return;
      const m = formatMarket(type, name.trim(), state);
      if (!value.includes(m)) onChange([...value, m]);
    }
    reset();
  }

  function remove(m: string) { onChange(value.filter((x) => x !== m)); }

  return (
    <div className="col-span-2 space-y-2">
      <Label>Markets</Label>
      <p className="text-xs text-muted-foreground">
        Add specific buying areas. County and City require a state to keep matching unambiguous.
      </p>

      <div className="flex flex-wrap items-end gap-2 p-3 rounded-lg border border-border bg-muted/20">
        <div className="w-32">
          <Label className="text-xs">Type</Label>
          <Select value={type} onValueChange={(v) => { setType(v as MarketType); reset(); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="state">State</SelectItem>
              <SelectItem value="city">City + State</SelectItem>
              <SelectItem value="county">County + State</SelectItem>
              <SelectItem value="zip">Zip Code</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {type === "state" && (
          <div className="w-32">
            <Label className="text-xs">State</Label>
            <Select value={state} onValueChange={setState}>
              <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
              <SelectContent className="max-h-60">
                {US_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {type === "zip" && (
          <div className="w-32">
            <Label className="text-xs">Zip</Label>
            <Input inputMode="numeric" maxLength={5} value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, ""))} placeholder="75001" />
          </div>
        )}

        {(type === "city" || type === "county") && (
          <>
            <div className="flex-1 min-w-[160px]">
              <Label className="text-xs">{type === "city" ? "City" : "County"}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={type === "city" ? "Chicago" : "Cook"} />
            </div>
            <div className="w-28">
              <Label className="text-xs">State</Label>
              <Select value={state} onValueChange={setState}>
                <SelectTrigger><SelectValue placeholder="State" /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {US_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        <Button type="button" size="sm" onClick={add} className="bg-primary hover:bg-primary-hover">
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {value.map((m) => (
            <Badge key={m} variant="outline" className="gap-1 pl-2 pr-1 py-1">
              <span className="text-xs">{m}</span>
              <button type="button" onClick={() => remove(m)} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
