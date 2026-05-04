import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import {
  Activity,
  ArrowRight,
  FileUp,
  MessageSquare,
  UserPlus,
  UserMinus,
  DollarSign,
  CheckCircle2,
} from "lucide-react";

interface Activity {
  id: string;
  event_type: string;
  from_value: string | null;
  to_value: string | null;
  metadata: any;
  created_at: string;
  user_id: string | null;
}

const ICONS: Record<string, any> = {
  status_change: ArrowRight,
  emd_received: DollarSign,
  field_updated: Activity,
  assignee_added: UserPlus,
  assignee_removed: UserMinus,
  file_uploaded: FileUp,
  note_added: MessageSquare,
};

function describe(a: Activity): string {
  switch (a.event_type) {
    case "status_change":
      return `Status changed from ${a.from_value || "—"} to ${a.to_value}`;
    case "emd_received":
      return `EMD received${a.to_value ? ` ($${a.to_value})` : ""}`;
    case "field_updated": {
      const f = a.metadata?.field || "field";
      return `${f.replace(/_/g, " ")} updated to ${a.to_value || "—"}`;
    }
    case "assignee_added":
      return `Teammate assigned (${a.metadata?.role || "team"})`;
    case "assignee_removed":
      return `Teammate removed (${a.metadata?.role || "team"})`;
    case "file_uploaded":
      return `Uploaded ${a.to_value} (${a.metadata?.category || "file"})`;
    case "note_added":
      return a.to_value || "Note added";
    default:
      return a.event_type;
  }
}

export function DealActivity({ dealId }: { dealId: string }) {
  const { user } = useAuth();
  const [items, setItems] = useState<Activity[]>([]);
  const [note, setNote] = useState("");

  async function load() {
    const { data } = await supabase
      .from("deal_activity")
      .select("*")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false });
    setItems((data as any) || []);
  }

  useEffect(() => {
    load();
  }, [dealId]);

  async function addNote() {
    if (!note.trim() || !user) return;
    await supabase.from("deal_activity").insert({
      deal_id: dealId,
      user_id: user.id,
      event_type: "note_added",
      to_value: note.trim(),
    });
    setNote("");
    load();
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note to the activity log…"
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addNote())}
        />
        <Button onClick={addNote} className="bg-primary hover:bg-primary-hover">Post</Button>
      </div>
      {items.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-8">No activity yet</div>
      ) : (
        <ul className="space-y-2.5">
          {items.map((a) => {
            const Icon = ICONS[a.event_type] || Activity;
            return (
              <li key={a.id} className="flex gap-3 items-start">
                <div className="mt-0.5 h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm">{describe(a)}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {format(new Date(a.created_at), "MMM d, yyyy · h:mm a")}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
