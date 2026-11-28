import { supabase } from "@/integrations/supabase/client";

export type RbacRole = {
  code: string;
  name_fr: string;
  name_ar: string;
  description_fr: string;
  description_ar: string;
  display_order: number;
};

export type RbacPermission = {
  code: string;
  module: string;
  label_fr: string;
  label_ar: string;
  display_order: number;
};

export type AuditLogRow = {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  module: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  summary: string | null;
  details: unknown;
  created_at: string;
};

export type HomepageSectionRow = {
  id: string;
  section_key: string;
  title_fr: string;
  title_ar: string;
  subtitle_fr: string | null;
  subtitle_ar: string | null;
  is_enabled: boolean;
  display_order: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sbAny = () => supabase as any;

export async function fetchRbacMatrix() {
  const [rolesRes, permsRes, mapRes, userRolesRes] = await Promise.all([
    sbAny().from("rbac_roles").select("*").order("display_order"),
    sbAny().from("rbac_permissions").select("*").order("display_order"),
    sbAny().from("rbac_role_permissions").select("role_code, permission_code"),
    sbAny().from("user_rbac_roles").select("user_id, role_code, created_at").order("created_at"),
  ]);
  if (rolesRes.error) throw rolesRes.error;
  if (permsRes.error) throw permsRes.error;
  if (mapRes.error) throw mapRes.error;
  if (userRolesRes.error) throw userRolesRes.error;

  const userIds = [...new Set((userRolesRes.data as { user_id: string }[]).map((r) => r.user_id))];
  let profiles: { id: string; full_name: string | null; email: string | null }[] = [];
  if (userIds.length > 0) {
    const pRes = await supabase.from("profiles").select("id, full_name, email").in("id", userIds);
    if (pRes.error) throw pRes.error;
    profiles = pRes.data ?? [];
  }

  return {
    roles: (rolesRes.data ?? []) as RbacRole[],
    permissions: (permsRes.data ?? []) as RbacPermission[],
    rolePermissions: (mapRes.data ?? []) as { role_code: string; permission_code: string }[],
    assignments: (userRolesRes.data ?? []).map(
      (r: { user_id: string; role_code: string; created_at: string }) => ({
        ...r,
        profile: profiles.find((p) => p.id === r.user_id) ?? null,
      }),
    ),
  };
}

export async function toggleRolePermission(
  roleCode: string,
  permissionCode: string,
  grant: boolean,
) {
  if (roleCode === "super_admin" && !grant) {
    throw new Error("Les permissions du Super Administrateur ne peuvent pas être retirées.");
  }
  if (grant) {
    const { error } = await sbAny()
      .from("rbac_role_permissions")
      .upsert(
        { role_code: roleCode, permission_code: permissionCode },
        { onConflict: "role_code,permission_code" },
      );
    if (error) throw error;
  } else {
    const { error } = await sbAny()
      .from("rbac_role_permissions")
      .delete()
      .eq("role_code", roleCode)
      .eq("permission_code", permissionCode);
    if (error) throw error;
  }
  await sbAny().rpc("log_audit_event", {
    _module: "security",
    _action: grant ? "rbac.permission_granted" : "rbac.permission_revoked",
    _summary: `Permission ${permissionCode} ${grant ? "activée" : "désactivée"} pour ${roleCode}`,
    _entity_type: "role",
    _entity_id: roleCode,
    _metadata: { role_code: roleCode, permission_code: permissionCode, grant },
  });
}

export async function assignRbacRoleToUser(
  userId: string,
  roleCode: string,
  grant: boolean,
  currentUserId?: string,
) {
  if (userId === currentUserId && (roleCode === "super_admin" || roleCode === "admin") && !grant) {
    throw new Error("Vous ne pouvez pas retirer votre propre rôle administrateur.");
  }

  if (grant) {
    const { error } = await sbAny()
      .from("user_rbac_roles")
      .upsert(
        { user_id: userId, role_code: roleCode, assigned_by: currentUserId ?? null },
        { onConflict: "user_id,role_code" },
      );
    if (error) throw error;
  } else {
    const { error } = await sbAny()
      .from("user_rbac_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role_code", roleCode);
    if (error) throw error;
  }

  // Sync legacy user_roles ('admin' / 'staff') via existing SECURITY DEFINER RPC
  const { data: currentRoles } = await sbAny()
    .from("user_rbac_roles")
    .select("role_code")
    .eq("user_id", userId);
  const codes = (currentRoles ?? []).map((r: { role_code: string }) => r.role_code);
  const shouldAdmin = codes.includes("super_admin") || codes.includes("admin");
  const shouldStaff = !shouldAdmin && codes.length > 0;

  await supabase.rpc("set_user_role", {
    _user_id: userId,
    _role: "admin",
    _grant: shouldAdmin,
  });
  await supabase.rpc("set_user_role", {
    _user_id: userId,
    _role: "staff",
    _grant: shouldStaff,
  });

  await sbAny().rpc("log_audit_event", {
    _module: "security",
    _action: grant ? "rbac.role_granted" : "rbac.role_revoked",
    _summary: `Rôle ${roleCode} ${grant ? "attribué" : "retiré"}`,
    _entity_type: "user",
    _entity_id: userId,
    _metadata: { role_code: roleCode, grant },
  });
}

export async function fetchAuditLogs(moduleFilter?: string) {
  let q = sbAny()
    .from("audit_logs")
    .select(
      "id, actor_id, actor_email, module, action, entity, entity_id, summary, details, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(80);
  if (moduleFilter && moduleFilter !== "__all__") {
    q = q.eq("module", moduleFilter);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as AuditLogRow[];
}

export async function fetchHomepageSections() {
  const { data, error } = await sbAny()
    .from("homepage_sections")
    .select("*")
    .order("display_order");
  if (error) throw error;
  return (data ?? []) as HomepageSectionRow[];
}

export async function updateHomepageSection(
  id: string,
  patch: Partial<
    Pick<
      HomepageSectionRow,
      "title_fr" | "title_ar" | "subtitle_fr" | "subtitle_ar" | "is_enabled" | "display_order"
    >
  >,
) {
  const { error } = await sbAny()
    .from("homepage_sections")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
