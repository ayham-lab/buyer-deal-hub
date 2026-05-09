import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { withLocation, scopeToLocation } from "@/lib/locationScope";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout, PageHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, CheckSquare, Download } from "lucide-react";
import { format, isToday, isPast, parseISO } from "date-fns";
import { toast } from "sonner";
import { exportToCsv } from "@/lib/csv";

interface Task {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: "low" | "medium" | "high";
  is_completed: boolean;
  deal_id: string | null;
  created_at: string;
}

const PRIORITY_COLOR: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-blue-100 text-blue-700 border-blue-200",
  high: "bg-red-100 text-red-700 border-red-200",
};

export default function Tasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"open" | "today" | "overdue" | "completed" | "all">("open");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await scopeToLocation(
      supabase
        .from("tasks")
        .select("*")
        .order("is_completed")
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
    );
    setTasks((data as any) || []);
    setLoading(false);
  }

  useEffect(() => {
    if (user) load();
  }, [user]);

  async function toggleComplete(t: Task) {
    setTasks((ts) => ts.map((x) => x.id === t.id ? { ...x, is_completed: !t.is_completed } : x));
    await supabase.from("tasks").update({ is_completed: !t.is_completed }).eq("id", t.id);
  }

  async function deleteTask(id: string) {
    setTasks((ts) => ts.filter((x) => x.id !== id));
    await supabase.from("tasks").delete().eq("id", id);
  }

  const filtered = tasks.filter((t) => {
    if (filter === "all") return true;
    if (filter === "completed") return t.is_completed;
    if (filter === "open") return !t.is_completed;
    if (filter === "today") return !t.is_completed && t.due_date && isToday(parseISO(t.due_date));
    if (filter === "overdue") return !t.is_completed && t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date));
    return true;
  });

  return (
    <AppLayout>
      <PageHeader
        title="Tasks"
        subtitle="Reminders and to-dos across your deals"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => exportToCsv(filtered.map((t) => ({
              title: t.title, description: t.description, due_date: t.due_date,
              priority: t.priority, completed: t.is_completed, created_at: t.created_at,
            })), `tasks-${new Date().toISOString().slice(0,10)}`)}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
            <Button onClick={() => { setEditing(null); setShowAdd(true); }} className="bg-primary hover:bg-primary-hover">
              <Plus className="h-4 w-4 mr-1" /> New Task
            </Button>
          </div>
        }
        tabs={
          <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
            <TabsList className="bg-transparent h-auto p-0 gap-1">
              {[
                { v: "open", l: "Open" },
                { v: "today", l: "Today" },
                { v: "overdue", l: "Overdue" },
                { v: "completed", l: "Completed" },
                { v: "all", l: "All" },
              ].map((t) => (
                <TabsTrigger key={t.v} value={t.v} className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  {t.l}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
      />

      <div className="px-6 lg:px-8 py-5">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <CheckSquare className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No tasks here. You're all caught up.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((t) => {
              const overdue = t.due_date && !t.is_completed && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date));
              return (
                <li
                  key={t.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted/40 transition-colors group"
                >
                  <Checkbox checked={t.is_completed} onCheckedChange={() => toggleComplete(t)} />
                  <button
                    onClick={() => { setEditing(t); setShowAdd(true); }}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className={`text-sm font-medium ${t.is_completed ? "line-through text-muted-foreground" : ""}`}>
                      {t.title}
                    </div>
                    {t.description && (
                      <div className="text-xs text-muted-foreground line-clamp-1">{t.description}</div>
                    )}
                  </button>
                  <Badge variant="outline" className={`${PRIORITY_COLOR[t.priority]} text-[10px]`}>{t.priority}</Badge>
                  {t.due_date && (
                    <span className={`text-xs ${overdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                      {format(parseISO(t.due_date), "MMM d")}
                    </span>
                  )}
                  <button
                    onClick={() => deleteTask(t.id)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <TaskModal
        open={showAdd}
        task={editing}
        onClose={() => setShowAdd(false)}
        onSaved={() => { setShowAdd(false); load(); }}
      />
    </AppLayout>
  );
}

function TaskModal({ open, task, onClose, onSaved }: { open: boolean; task: Task | null; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || "");
      setDueDate(task.due_date || "");
      setPriority(task.priority);
    } else {
      setTitle(""); setDescription(""); setDueDate(""); setPriority("medium");
    }
  }, [task, open]);

  async function save() {
    if (!title.trim() || !user) return;
    setBusy(true);
    const payload: any = {
      title: title.trim(),
      description: description.trim() || null,
      due_date: dueDate || null,
      priority,
    };
    if (task) {
      const { error } = await supabase.from("tasks").update(payload).eq("id", task.id);
      if (error) toast.error(error.message);
    } else {
      const { error } = await supabase.from("tasks").insert(withLocation({ ...payload, user_id: user.id }));
      if (error) toast.error(error.message);
    }
    setBusy(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{task ? "Edit Task" : "New Task"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Due Date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy} className="bg-primary hover:bg-primary-hover">
            {task ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
