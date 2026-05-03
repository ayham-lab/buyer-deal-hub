import { DndContext, DragEndEvent, useDraggable, useDroppable, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { Deal, DealStatus } from "@/pages/Pipeline";
import { STATUS_COLS, ipBadge } from "./utils";
import { cn } from "@/lib/utils";

export function KanbanBoard({ deals, onStatusChange, onSelect }: {
  deals: Deal[]; onStatusChange: (id: string, s: DealStatus) => void; onSelect: (id: string) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  function onDragEnd(e: DragEndEvent) {
    if (!e.over) return;
    const id = String(e.active.id);
    const status = String(e.over.id) as DealStatus;
    onStatusChange(id, status);
  }
  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {STATUS_COLS.map((col) => (
          <Column key={col.id} id={col.id} label={col.label} deals={deals.filter((d) => d.status === col.id)} onSelect={onSelect} />
        ))}
      </div>
    </DndContext>
  );
}

function Column({ id, label, deals, onSelect }: { id: string; label: string; deals: Deal[]; onSelect: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div className="bg-card/60 border border-border rounded-lg p-3 min-h-[400px]">
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-xs uppercase tracking-wider font-semibold">{label}</h3>
        <span className="text-xs text-muted-foreground bg-secondary rounded px-2 py-0.5">{deals.length}</span>
      </div>
      <div ref={setNodeRef} className={cn("space-y-2 min-h-[300px] rounded transition-colors", isOver && "bg-primary/5 ring-1 ring-primary/30")}>
        {deals.map((d) => <Card key={d.id} deal={d} onSelect={onSelect} />)}
      </div>
    </div>
  );
}

function Card({ deal, onSelect }: { deal: Deal; onSelect: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const ip = ipBadge(deal.ip_expiry_date);
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => !isDragging && onSelect(deal.id)}
      className={cn(
        "bg-card border border-border rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-primary/40 transition-colors",
        isDragging && "opacity-50"
      )}
    >
      <div className="text-sm font-medium line-clamp-2">{deal.property_address}</div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-primary font-bold text-sm">
          {deal.assignment_fee ? `$${deal.assignment_fee.toLocaleString()}` : "—"}
        </span>
        {ip && <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", ip.cls)}>{ip.label}</span>}
      </div>
      {deal.lead_source && <div className="mt-2 text-[10px] text-muted-foreground uppercase tracking-wider">{deal.lead_source}</div>}
    </div>
  );
}
