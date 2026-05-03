import { Deal } from "@/pages/Pipeline";
import { ipBadge } from "./utils";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

export function DealListView({ deals, onSelect }: { deals: Deal[]; onSelect: (id: string) => void }) {
  if (!deals.length) return <div className="empty-state"><p className="text-muted-foreground">No deals yet.</p></div>;
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="data-table w-full">
        <thead>
          <tr>
            <th>Property</th>
            <th>Status</th>
            <th>Assignment Fee</th>
            <th>IP Expiry</th>
            <th>Closing</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {deals.map((d) => {
            const ip = ipBadge(d.ip_expiry_date);
            return (
              <tr key={d.id} onClick={() => onSelect(d.id)} className="cursor-pointer">
                <td className="font-medium">{d.property_address}</td>
                <td><Badge variant="outline" className="capitalize">{d.status.replace("_", " ")}</Badge></td>
                <td className="text-primary font-semibold">{d.assignment_fee ? `$${d.assignment_fee.toLocaleString()}` : "—"}</td>
                <td>{ip ? <span className={`text-xs px-1.5 py-0.5 rounded ${ip.cls}`}>{ip.label}</span> : "—"}</td>
                <td className="text-muted-foreground">{d.closing_date ? format(new Date(d.closing_date), "MMM d, yyyy") : "—"}</td>
                <td className="text-muted-foreground">{d.lead_source || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
