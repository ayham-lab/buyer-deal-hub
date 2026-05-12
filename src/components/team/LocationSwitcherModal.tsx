import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface LocationOption {
  location_id: string;
  location_name: string | null;
  is_owner: boolean;
}

export function LocationSwitcherModal({
  open,
  options,
  onPick,
}: {
  open: boolean;
  options: LocationOption[];
  onPick: (locationId: string) => void;
}) {
  return (
    <Dialog open={open}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Choose a workspace</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 mt-2">
          {options.map((o) => (
            <Button
              key={o.location_id}
              variant="outline"
              className="w-full justify-between h-auto py-3"
              onClick={() => onPick(o.location_id)}
            >
              <span className="text-left">
                <span className="block font-medium">{o.location_name ?? "GHL Location"}</span>
                <span className="block text-xs text-muted-foreground font-mono">{o.location_id}</span>
              </span>
              {o.is_owner && <span className="text-xs text-primary">Owner</span>}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
