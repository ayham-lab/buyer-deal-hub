import { useEffect, useState } from "react";
import { Bell, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { scopeToLocation } from "@/lib/locationScope";
import { useAuth } from "@/hooks/useAuth";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link_url: string | null;
  is_read: boolean;
  created_at: string;
}

export function NotificationBell() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    (async () => {
      const { data } = await scopeToLocation(
        supabase
          .from("notifications")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(30)
      );
      if (mounted) setItems((data as any) || []);
    })();

    const ch = supabase
      .channel(`notif-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => {
          scopeToLocation(
            supabase
              .from("notifications")
              .select("*")
              .order("created_at", { ascending: false })
              .limit(30)
          ).then(({ data }) => setItems((data as any) || []));
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(ch);
    };
  }, [user]);

  const unread = items.filter((i) => !i.is_read).length;

  async function markAllRead() {
    if (!user) return;
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    setItems((items) => items.map((i) => ({ ...i, is_read: true })));
  }

  async function clickItem(n: Notification) {
    if (!n.is_read) {
      await supabase.from("notifications").update({ is_read: true }).eq("id", n.id);
      setItems((items) => items.map((i) => i.id === n.id ? { ...i, is_read: true } : i));
    }
    if (n.link_url) {
      setOpen(false);
      nav(n.link_url);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="h-9 w-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted relative">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <div className="text-sm font-semibold">Notifications</div>
          {unread > 0 && (
            <button onClick={markAllRead} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              <Check className="h-3 w-3" /> Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">No notifications yet</div>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                onClick={() => clickItem(n)}
                className={`w-full text-left px-3 py-2.5 border-b border-border hover:bg-muted transition-colors ${!n.is_read ? "bg-primary/5" : ""}`}
              >
                <div className="flex items-start gap-2">
                  {!n.is_read && <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{n.title}</div>
                    {n.body && <div className="text-xs text-muted-foreground line-clamp-2">{n.body}</div>}
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
