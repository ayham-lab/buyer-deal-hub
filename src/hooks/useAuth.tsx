import { useEffect, useState, createContext, useContext, ReactNode, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

interface Profile {
  id: string;
  user_id: string;
  email: string | null;
  name: string | null;
  ghl_location_id: string | null;
  subscription_status: string;
}

interface AuthCtx {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null, session: null, profile: null, isAdmin: false, isSuperAdmin: false, loading: true,
  signOut: async () => {},
  refreshRoles: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);

  const loadProfile = useCallback(async (uid: string) => {
    const [{ data: p }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("id,user_id,email,name,ghl_location_id,subscription_status").eq("user_id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
    ]);
    setProfile(p as any);
    const roleList = (roles || []).map((r: any) => r.role);
    setIsSuperAdmin(roleList.includes("super_admin"));
    setIsAdmin(roleList.includes("admin") || roleList.includes("super_admin"));
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      userIdRef.current = s?.user?.id ?? null;
      if (s?.user) {
        setTimeout(() => loadProfile(s.user.id), 0);
        // Defense-in-depth: if there's a pending invite stashed and the
        // signed-in user's email matches, consume it now. Covers the case
        // where Supabase's confirm-email redirect drops the ?token= param.
        if (event === "SIGNED_IN") {
          setTimeout(async () => {
            try {
              const raw = localStorage.getItem("pending_invite");
              if (!raw) return;
              const { token, email } = JSON.parse(raw);
              if (!token) { localStorage.removeItem("pending_invite"); return; }
              if (email && (s.user.email ?? "").toLowerCase() !== String(email).toLowerCase()) return;
              const { data, error } = await supabase.functions.invoke("accept-invite", { body: { token } });
              if (error || (data as any)?.error) return;
              const locId = (data as any)?.location_id as string | undefined;
              if (locId) {
                try {
                  sessionStorage.setItem("ghl_active_location", JSON.stringify({ locationId: locId, companyId: null }));
                } catch {}
              }
              localStorage.removeItem("pending_invite");
              if (window.location.pathname !== "/") window.location.replace("/");
            } catch {}
          }, 0);
        }
      } else {
        setProfile(null);
        setIsAdmin(false);
        setIsSuperAdmin(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      userIdRef.current = s?.user?.id ?? null;
      if (s?.user) loadProfile(s.user.id);
      setLoading(false);
    });

    const onFocus = () => {
      if (userIdRef.current) loadProfile(userIdRef.current);
    };
    window.addEventListener("focus", onFocus);

    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener("focus", onFocus);
    };
  }, [loadProfile]);

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function refreshRoles() {
    if (userIdRef.current) await loadProfile(userIdRef.current);
  }

  return (
    <Ctx.Provider value={{ user, session, profile, isAdmin, isSuperAdmin, loading, signOut, refreshRoles }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
