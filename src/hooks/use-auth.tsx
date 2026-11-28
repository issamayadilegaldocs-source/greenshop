import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AuthValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  roles: string[];
  rbacRoles: string[];
  permissions: string[];
  isAdmin: boolean;
  isStaff: boolean;
  can: (permission: string) => boolean;
};

const AuthContext = createContext<AuthValue>({
  session: null,
  user: null,
  loading: true,
  roles: [],
  rbacRoles: [],
  permissions: [],
  isAdmin: false,
  isStaff: false,
  can: () => false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  const rolesQuery = useQuery({
    queryKey: ["my-roles", userId],
    enabled: !!userId,
    queryFn: async () => {
      const [legacyRes, rbacRes] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId!),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).rpc("get_my_rbac_profile"),
      ]);
      if (legacyRes.error) throw legacyRes.error;
      const legacyRoles = legacyRes.data.map((r) => r.role as string);
      const rbacData = (
        !rbacRes.error && rbacRes.data ? rbacRes.data : { roles: [], permissions: [] }
      ) as { roles?: string[]; permissions?: string[] };
      return {
        legacyRoles,
        rbacRoles: Array.isArray(rbacData.roles) ? rbacData.roles : [],
        permissions: Array.isArray(rbacData.permissions) ? rbacData.permissions : [],
      };
    },
  });

  const roles = rolesQuery.data?.legacyRoles ?? [];
  const rbacRoles = rolesQuery.data?.rbacRoles ?? [];
  const permissions = useMemo(
    () => rolesQuery.data?.permissions ?? [],
    [rolesQuery.data?.permissions],
  );
  const isAdmin =
    roles.includes("admin") || rbacRoles.includes("super_admin") || rbacRoles.includes("admin");
  const isStaff = isAdmin || roles.includes("staff") || rbacRoles.length > 0;
  const authLoading = loading || (Boolean(userId) && rolesQuery.isPending);

  const can = useCallback(
    (permission: string) => isAdmin || permissions.includes(permission),
    [isAdmin, permissions],
  );

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading: authLoading,
        roles,
        rbacRoles,
        permissions,
        isAdmin,
        isStaff,
        can,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
