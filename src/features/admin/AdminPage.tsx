import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  BarChart3,
  Calculator,
  CalendarPlus,
  PackageSearch,
  Edit2,
  Eye,
  FileText,
  LayoutGrid,
  ListChecks,
  LogOut,
  Mail,
  Megaphone,
  Plus,
  Printer,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UsersRound,
  Warehouse,
  X,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { useSearchParams } from "react-router-dom";
import { EmptyState } from "../../components/EmptyState";
import { OdooLoadingModal } from "../../components/OdooLoadingModal";
import { formatDate } from "../../lib/dates";
import {
  MAX_SUPPORT_IMAGES,
  MAX_SUPPORT_PDFS,
  getSupportImageUrl,
  isAcceptedSupportFile,
  isSupportPdf,
} from "../../lib/supportImages";
import { supabase } from "../../lib/supabase";
import {
  caseStatusFromEventType,
  getCurrentSupportState,
  getLatestSupportEvent,
  statusLabel,
} from "../../lib/tracking";
import type {
  Manufacturer,
  PrinterModelWithManufacturer,
  SupportCaseWithEvents,
  SupportImage,
  SupportAgent,
  SupportEventType,
  AdminUserModulePermissions,
  SupportMailerSettings,
} from "../../lib/types";
import {
  createSupportAgent,
  createManufacturer,
  createPrinterModel,
  createSupportEventType,
  deleteSupportAgent,
  deletePrinterModel,
  deleteSupportEventType,
  getSupportAgents,
  getManufacturers,
  getPrinterModels,
  getSupportEventTypes,
  updateSupportAgent,
  updateManufacturer,
  updatePrinterModel,
  updateSupportEventType,
} from "./configService";
import {
  addSupportImages,
  addSupportMovement,
  adminSearchSupports,
  createSupportCase,
  deleteSupportImage,
  supportShippingCarriers,
  type SupportMovementFormValues,
} from "../support/supportService";
import { SupportDetails } from "../support/SupportDetails";
import { SupportForm } from "./SupportForm";
import { InventoryDashboard } from "./InventoryDashboard";
import { PolicyDashboard } from "./PolicyDashboard";
import { CalculatorDashboard } from "./CalculatorDashboard";
import { QuoterDashboard } from "../quoting/QuoterDashboard";
import { MarketingDashboard } from "../marketing/MarketingDashboard";
import { buildDefaultFilters, ReportsDashboard } from "../reports/ReportsDashboard";
import { getCommercialDataset } from "../reports/reportsService";
import { saveStoredCommercialDataset } from "../reports/reportsDatasetCache";
import type { ReportRequestedDomain } from "../reports/odooSalesCore";
import { SidebarUserFooter } from "./SidebarUserFooter";
import {
  adminModules,
  adminUserRoles,
  applyRolePermissionDefaults,
  buildEmptyPermissionDraft,
  buildModulePermissionDraft,
  createAdminUser,
  getCurrentModulePermission,
  getModulePermissions,
  getSupportMailerSettings,
  isDesignatedOwnerEmail,
  isPermissionOwner,
  saveSupportMailerSettings,
  updateAdminUser,
  type AdminUserRole,
  type CreateAdminUserDraft,
  type ModulePermissionDraft,
  type SupportMailerSettingsDraft,
} from "./settingsService";

type AdminSection = "register" | "manufacturers" | "events" | "agents";
type AdminModule = "home" | "supports" | "inventory" | "policies" | "reports" | "marketing" | "quoting" | "calculator" | "settings";
type SettingsSection = "permissions" | "support_mailer";
type ModuleAccess = {
  supports: { can_access: boolean; visibility_scope: "all" | "own" };
  inventory: { can_access: boolean; visibility_scope: "all" | "own" };
  policies: { can_access: boolean; visibility_scope: "all" | "own" };
  reports: { can_access: boolean; visibility_scope: "all" | "own" };
  marketing: { can_access: boolean; visibility_scope: "all" | "own" };
  quoting: { can_access: boolean; visibility_scope: "all" | "own" };
  calculator: { can_access: boolean; visibility_scope: "all" | "own" };
};

type ModelDraft = {
  id?: string;
  manufacturer_id: string;
  name: string;
  part_number: string;
};

type EventDraft = {
  id?: string;
  name: string;
  code: string;
  event_type: SupportEventType["event_type"];
  support_type: SupportEventType["support_type"];
  description: string;
  sort_order: number;
};

type AgentDraft = {
  id?: string;
  full_name: string;
  position: string;
};

function normalizeAdminModule(value: string | null): AdminModule | null {
  if (
    value === "home" ||
    value === "supports" ||
    value === "inventory" ||
    value === "policies" ||
    value === "reports" ||
    value === "marketing" ||
    value === "quoting" ||
    value === "calculator" ||
    value === "settings"
  ) {
    return value;
  }

  return null;
}

const sections: Array<{ id: AdminSection; label: string; icon: ReactNode }> = [
  {
    id: "register",
    label: "Registro de soportes",
    icon: <CalendarPlus size={18} />,
  },
  { id: "manufacturers", label: "Impresoras", icon: <Printer size={18} /> },
  { id: "events", label: "Estados", icon: <ListChecks size={18} /> },
  { id: "agents", label: "Agentes", icon: <UsersRound size={18} /> },
];

export function AdminPage() {
  return <AdminApp />;
}

function AdminApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (authLoading) {
    return (
      <div className="page">
        <EmptyState title="Cargando">Validando sesión...</EmptyState>
      </div>
    );
  }

  if (!session) {
    return <AdminLogin />;
  }

  return <AdminDashboard session={session} />;
}

function AdminDashboard({ session }: { session: Session }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isOdooPreloading, setIsOdooPreloading] = useState(false);
  const queryClient = useQueryClient();
  const activeModule = normalizeAdminModule(searchParams.get("module")) ?? "home";
  const designatedOwner = isDesignatedOwnerEmail(session.user.email);
  const permissionsQuery = useQuery({
    queryKey: ["current-module-permissions", session.user.id],
    queryFn: () => getCurrentModulePermission(session.user.id, session.user.email),
    enabled: !designatedOwner,
  });
  const owner = designatedOwner || isPermissionOwner(permissionsQuery.data);
  const currentRole: AdminUserRole = owner
    ? "owner"
    : getPermissionRole(permissionsQuery.data as AdminUserModulePermissions);
  const permissionActive = owner || permissionsQuery.data?.is_active !== false;
  const canAccessPurchases = owner || (
    permissionActive &&
    (
      currentRole === "purchase_agent" ||
      Boolean(
        permissionsQuery.data?.module_permissions.some(
          (item) => item.module_key === "purchases" && item.can_access,
        ),
      )
    )
  );
  const moduleAccess: ModuleAccess = owner
      ? {
          supports: { can_access: true, visibility_scope: "all" },
          inventory: { can_access: true, visibility_scope: "all" },
          policies: { can_access: true, visibility_scope: "all" },
          reports: { can_access: true, visibility_scope: "all" },
          marketing: { can_access: true, visibility_scope: "all" },
          quoting: { can_access: true, visibility_scope: "all" },
          calculator: { can_access: true, visibility_scope: "all" },
        }
      : !permissionActive
        ? {
            supports: { can_access: false, visibility_scope: "all" },
            inventory: { can_access: false, visibility_scope: "all" },
            policies: { can_access: false, visibility_scope: "all" },
            reports: { can_access: false, visibility_scope: "all" },
            marketing: { can_access: false, visibility_scope: "all" },
            quoting: { can_access: false, visibility_scope: "all" },
            calculator: { can_access: false, visibility_scope: "all" },
          }
      : {
          supports: getModuleAccessFromPermission(permissionsQuery.data, "supports"),
          inventory: getModuleAccessFromPermission(permissionsQuery.data, "inventory"),
          policies: getModuleAccessFromPermission(permissionsQuery.data, "policies"),
          reports: getModuleAccessFromPermission(permissionsQuery.data, "reports"),
          marketing: getModuleAccessFromPermission(permissionsQuery.data, "marketing"),
          quoting: getModuleAccessFromPermission(permissionsQuery.data, "quoting"),
          calculator: getModuleAccessFromPermission(permissionsQuery.data, "calculator"),
        };
  const canAccessSalesReports = moduleAccess.reports.can_access;
  const canOpenReports = canAccessSalesReports || canAccessPurchases;

  const visibleModule: AdminModule =
    (activeModule === "supports" && !moduleAccess.supports.can_access) ||
    (activeModule === "inventory" && !moduleAccess.inventory.can_access) ||
    (activeModule === "policies" && !moduleAccess.policies.can_access) ||
    (activeModule === "reports" && !canOpenReports) ||
    (activeModule === "marketing" && !moduleAccess.marketing.can_access) ||
    (activeModule === "quoting" && !moduleAccess.quoting.can_access) ||
    (activeModule === "calculator" && !moduleAccess.calculator.can_access) ||
    (activeModule === "settings" && !owner)
      ? "home"
      : activeModule;

  const preloadDomain: ReportRequestedDomain | null = canAccessSalesReports
    ? "sales"
    : canAccessPurchases
      ? "purchases"
      : null;
  const preloadVisibilityScope = currentRole === "sales_agent"
    ? "own"
    : moduleAccess.reports.visibility_scope;

  useEffect(() => {
    let active = true;

    if ((!designatedOwner && permissionsQuery.isPending) || !preloadDomain) {
      queueMicrotask(() => {
        if (active) setIsOdooPreloading(false);
      });
      return () => {
        active = false;
      };
    }

    const filters = buildDefaultFilters(preloadVisibilityScope);
    queueMicrotask(() => {
      if (active) setIsOdooPreloading(true);
    });

    void queryClient.fetchQuery({
      queryKey: ["commercial-dashboard-dataset", session.user.id, preloadDomain, "fast", filters],
      queryFn: () => getCommercialDataset(filters, preloadDomain, "fast"),
      staleTime: 1000 * 60 * 3,
    }).then((dataset) => {
      saveStoredCommercialDataset(
        filters,
        dataset,
        preloadDomain,
        session.user.id,
        "fast",
      );
    }).catch((error) => {
      console.error("No se pudo completar la precarga de Odoo.", error);
    }).finally(() => {
      if (active) setIsOdooPreloading(false);
    });

    return () => {
      active = false;
    };
  }, [
    permissionsQuery.isPending,
    designatedOwner,
    preloadDomain,
    preloadVisibilityScope,
    queryClient,
    session.user.id,
  ]);

  useEffect(() => {
    if (visibleModule === activeModule) {
      return;
    }

    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams);
      if (visibleModule === "home") {
        nextParams.delete("module");
      } else {
        nextParams.set("module", visibleModule);
      }
      return nextParams;
    }, { replace: true });
  }, [activeModule, setSearchParams, visibleModule]);

  function openModule(module: AdminModule) {
    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams);
      if (module === "home") {
        nextParams.delete("module");
      } else {
        nextParams.set("module", module);
      }
      return nextParams;
    });
  }

  function openReportsModule() {
    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams);
      nextParams.set("module", "reports");
      if (!canAccessSalesReports && canAccessPurchases) {
        nextParams.set("reportsSection", "purchases");
      }
      return nextParams;
    });
  }

  function withOdooPreload(content: ReactNode) {
    return (
      <>
        <OdooLoadingModal
          open={isOdooPreloading && visibleModule !== "reports"}
          title="Preparando los reportes de Odoo"
        />
        {content}
      </>
    );
  }

  if (!designatedOwner && permissionsQuery.isLoading) {
    return (
      <div className="page">
        <EmptyState title="Cargando permisos">Validando módulos disponibles...</EmptyState>
      </div>
    );
  }

  if (!designatedOwner && permissionsQuery.isError) {
    return (
      <div className="page permission-error-page">
        <EmptyState title="No se pudieron cargar tus permisos">
          No fue posible consultar los módulos asignados. Reintenta para recuperar tu acceso.
        </EmptyState>
        <button
          type="button"
          className="primary-button"
          onClick={() => {
            void permissionsQuery.refetch();
          }}
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (visibleModule === "home") {
    return withOdooPreload(
      <ModuleHub
        session={session}
        moduleAccess={moduleAccess}
        canOpenReports={canOpenReports}
        canOpenSettings={owner}
        onOpenSupports={() => openModule("supports")}
        onOpenInventory={() => openModule("inventory")}
        onOpenPolicies={() => openModule("policies")}
        onOpenReports={openReportsModule}
        onOpenMarketing={() => openModule("marketing")}
        onOpenQuoting={() => openModule("quoting")}
        onOpenCalculator={() => openModule("calculator")}
        onOpenSettings={() => openModule("settings")}
      />,
    );
  }

  if (visibleModule === "inventory" && moduleAccess.inventory.can_access) {
    return withOdooPreload(
      <InventoryDashboard
        session={session}
        onOpenHub={() => openModule("home")}
      />,
    );
  }

  if (visibleModule === "policies" && moduleAccess.policies.can_access) {
    return withOdooPreload(
      <PolicyDashboard
        session={session}
        onOpenHub={() => openModule("home")}
      />,
    );
  }

  if (visibleModule === "calculator" && moduleAccess.calculator.can_access) {
    return withOdooPreload(
      <CalculatorDashboard
        session={session}
        onOpenHub={() => openModule("home")}
      />,
    );
  }

  if (visibleModule === "reports" && canOpenReports) {
    return (
      <ReportsDashboard
        session={session}
        visibilityScope={currentRole === "sales_agent" ? "own" : moduleAccess.reports.visibility_scope}
        canAccessSales={canAccessSalesReports}
        canAccessPurchases={canAccessPurchases}
        onOpenHub={() => openModule("home")}
      />
    );
  }

  if (visibleModule === "marketing" && moduleAccess.marketing.can_access) {
    return withOdooPreload(
      <MarketingDashboard
        session={session}
        userRole={currentRole}
        visibilityScope={moduleAccess.marketing.visibility_scope}
        onOpenHub={() => openModule("home")}
      />,
    );
  }

  if (visibleModule === "quoting" && moduleAccess.quoting.can_access) {
    return withOdooPreload(
      <QuoterDashboard
        session={session}
        onOpenHub={() => openModule("home")}
      />,
    );
  }

  if (visibleModule === "settings" && owner) {
    return withOdooPreload(
      <SettingsDashboard
        session={session}
        onOpenHub={() => openModule("home")}
      />,
    );
  }

  if (!moduleAccess.supports.can_access) {
    return withOdooPreload(
      <ModuleHub
        session={session}
        moduleAccess={moduleAccess}
        canOpenReports={canOpenReports}
        canOpenSettings={owner}
        onOpenSupports={() => openModule("supports")}
        onOpenInventory={() => openModule("inventory")}
        onOpenPolicies={() => openModule("policies")}
        onOpenReports={openReportsModule}
        onOpenMarketing={() => openModule("marketing")}
        onOpenQuoting={() => openModule("quoting")}
        onOpenCalculator={() => openModule("calculator")}
        onOpenSettings={() => openModule("settings")}
      />,
    );
  }

  return withOdooPreload(
    <SupportAdminDashboard
      session={session}
      onOpenHub={() => openModule("home")}
    />,
  );
}

function ModuleHub({
  session,
  moduleAccess,
  canOpenReports,
  canOpenSettings,
  onOpenSupports,
  onOpenInventory,
  onOpenPolicies,
  onOpenReports,
  onOpenMarketing,
  onOpenQuoting,
  onOpenCalculator,
  onOpenSettings,
}: {
  session: Session;
  moduleAccess: ModuleAccess;
  canOpenReports: boolean;
  canOpenSettings: boolean;
  onOpenSupports: () => void;
  onOpenInventory: () => void;
  onOpenPolicies: () => void;
  onOpenReports: () => void;
  onOpenMarketing: () => void;
  onOpenQuoting: () => void;
  onOpenCalculator: () => void;
  onOpenSettings: () => void;
}) {
  const hasVisibleModules =
    moduleAccess.supports.can_access ||
    moduleAccess.inventory.can_access ||
    moduleAccess.policies.can_access ||
    canOpenReports ||
    moduleAccess.marketing.can_access ||
    moduleAccess.quoting.can_access ||
    moduleAccess.calculator.can_access ||
    canOpenSettings;

  return (
    <div className="module-hub">
      <header className="module-hub-topbar">
        {/* <button className="icon-button" type="button" aria-label="Módulos">
          <LayoutGrid size={18} />
        </button> */}
        <div className="module-hub-user">
          <img src="/tectronic-logo.png" alt="Tectronic" />
          <div>
            <strong>Corporación Tectronic</strong>
            <small>{session.user.email}</small>
          </div>
        </div>
        <button
          className="module-logout"
          type="button"
          onClick={() => supabase.auth.signOut()}
        >
          <LogOut size={18} />
          Salir
        </button>
      </header>
      <main className="module-grid-wrap">
        <div className="module-grid">
          {moduleAccess.supports.can_access ? (
          <button
            type="button"
            className="module-tile"
            onClick={onOpenSupports}
          >
            <span className="module-icon support-module">
              <CalendarPlus size={34} />
            </span>
            <strong>Soportes</strong>
          </button>
          ) : null}
          {moduleAccess.inventory.can_access ? (
          <button
            type="button"
            className="module-tile"
            onClick={onOpenInventory}
          >
            <span className="module-icon inventory-module">
              <Warehouse size={34} />
            </span>
            <strong>Inventario</strong>
          </button>
          ) : null}
          {moduleAccess.policies.can_access ? (
          <button
            type="button"
            className="module-tile"
            onClick={onOpenPolicies}
          >
            <span className="module-icon policies-module">
              <FileText size={34} />
            </span>
            <strong>Pólizas</strong>
          </button>
          ) : null}
          {canOpenReports ? (
          <button
            type="button"
            className="module-tile"
            onClick={onOpenReports}
          >
            <span className="module-icon reports-module">
              <BarChart3 size={34} />
            </span>
            <strong>Reportes</strong>
          </button>
          ) : null}
          {moduleAccess.marketing.can_access ? (
          <button
            type="button"
            className="module-tile"
            onClick={onOpenMarketing}
          >
            <span className="module-icon marketing-module">
              <Megaphone size={34} />
            </span>
            <strong>Marketing</strong>
          </button>
          ) : null}
          {moduleAccess.quoting.can_access ? (
          <button
            type="button"
            className="module-tile"
            onClick={onOpenQuoting}
          >
            <span className="module-icon quoting-module">
              <PackageSearch size={34} />
            </span>
            <strong>Cotizador IMEBA</strong>
          </button>
          ) : null}
          {moduleAccess.calculator.can_access ? (
          <button
            type="button"
            className="module-tile"
            onClick={onOpenCalculator}
          >
            <span className="module-icon calculator-module">
              <Calculator size={34} />
            </span>
            <strong>Calculadora</strong>
          </button>
          ) : null}
          {canOpenSettings ? (
          <button
            type="button"
            className="module-tile"
            onClick={onOpenSettings}
          >
            <span className="module-icon settings-module">
              <Settings size={34} />
            </span>
            <strong>Ajustes</strong>
          </button>
          ) : null}
          {!hasVisibleModules ? (
            <div className="module-empty" role="status">
              <span className="module-empty-icon" aria-hidden="true">
                <LayoutGrid size={42} />
              </span>
              <p className="eyebrow">Acceso pendiente</p>
              <h2>No tienes módulos asignados</h2>
              <p>
                Solicita a un administrador que habilite los módulos que necesitas para trabajar.
              </p>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function getModuleAccessFromPermission(
  permission: AdminUserModulePermissions | null | undefined,
  moduleKey: keyof ModuleAccess,
) {
  const modulePermission = permission?.module_permissions.find((item) => item.module_key === moduleKey);
  return {
    can_access: Boolean(modulePermission?.can_access),
    visibility_scope: modulePermission?.visibility_scope ?? "all",
  };
}

function getPermissionRole(permission: AdminUserModulePermissions | null | undefined): AdminUserRole {
  return permission?.role ?? (isPermissionOwner(permission) ? "owner" : "manager");
}

function roleLabel(role: AdminUserRole) {
  return adminUserRoles.find((item) => item.value === role)?.label ?? "Gerente";
}

function SettingsDashboard({
  session,
  onOpenHub,
}: {
  session: Session;
  onOpenHub: () => void;
}) {
  const queryClient = useQueryClient();
  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSection>("permissions");
  const [selectedPermissionId, setSelectedPermissionId] = useState<string | null>(null);
  const [permissionDraft, setPermissionDraft] = useState<ModulePermissionDraft | null>(null);
  const [draftPermissionId, setDraftPermissionId] = useState<string | null>(null);
  const [editingUserRole, setEditingUserRole] = useState<AdminUserRole>("manager");
  const [editingFullName, setEditingFullName] = useState("");
  const [editingActive, setEditingActive] = useState(true);
  const [editingPassword, setEditingPassword] = useState("");
  const [createUserModalOpen, setCreateUserModalOpen] = useState(false);
  const [resultModal, setResultModal] = useState<{ title: string; message: string; tone: "success" | "error" } | null>(null);
  const permissionsQuery = useQuery({
    queryKey: ["module-permissions", session.user.id],
    queryFn: getModulePermissions,
  });
  const supportMailerQuery = useQuery({
    queryKey: ["support-mailer-settings"],
    queryFn: getSupportMailerSettings,
  });
  const savePermissionMutation = useMutation({
    mutationFn: (payload: {
      permission: AdminUserModulePermissions;
      draft: ModulePermissionDraft;
      role: AdminUserRole;
      full_name: string;
      is_active: boolean;
      password: string;
    }) => updateAdminUser({
      permission: payload.permission,
      permissions: payload.draft,
      role: payload.role,
      full_name: payload.full_name,
      is_active: payload.is_active,
      password: payload.password,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["module-permissions"] });
      queryClient.invalidateQueries({ queryKey: ["current-module-permissions"] });
      closePermissionEditor();
      setResultModal({
        title: "Cambios guardados",
        message: "Los cambios del usuario se guardaron con éxito.",
        tone: "success",
      });
    },
    onError: (error) => {
      setResultModal({
        title: "No se pudieron guardar",
        message: error instanceof Error ? error.message : "Ocurrió un error al guardar los permisos.",
        tone: "error",
      });
    },
  });
  const createUserMutation = useMutation({
    mutationFn: createAdminUser,
    onSuccess: (createdUser) => {
      queryClient.invalidateQueries({ queryKey: ["module-permissions"] });
      queryClient.invalidateQueries({ queryKey: ["current-module-permissions"] });
      setCreateUserModalOpen(false);
      setResultModal({
        title: "Usuario creado",
        message: `El usuario ${createdUser.email} se creó con éxito y ya puede iniciar sesión.`,
        tone: "success",
      });
    },
    onError: (error) => {
      setResultModal({
        title: "No se pudo crear",
        message: error instanceof Error ? error.message : "Ocurrió un error al crear el usuario.",
        tone: "error",
      });
    },
  });
  const saveSupportMailerMutation = useMutation({
    mutationFn: saveSupportMailerSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-mailer-settings"] });
      setResultModal({
        title: "Correo guardado",
        message: "La configuración del correo saliente de soportes se guardó con éxito.",
        tone: "success",
      });
    },
    onError: (error) => {
      setResultModal({
        title: "No se pudo guardar",
        message: error instanceof Error ? error.message : "Ocurrió un error al guardar el correo saliente.",
        tone: "error",
      });
    },
  });
  const permissions = permissionsQuery.data ?? [];
  const selectedPermission =
    permissions.find((permission) => permission.id === selectedPermissionId) ?? null;
  const selectedOwner = editingUserRole === "owner";
  const activePermissionDraft =
    selectedPermission && draftPermissionId === selectedPermission.id && permissionDraft
      ? permissionDraft
      : selectedPermission
        ? buildModulePermissionDraft(selectedPermission)
        : null;
  const hasPendingDraft =
    selectedPermission && activePermissionDraft
      ? JSON.stringify(activePermissionDraft) !== JSON.stringify(buildModulePermissionDraft(selectedPermission)) ||
        editingUserRole !== getPermissionRole(selectedPermission) ||
        editingFullName !== (selectedPermission.full_name ?? "") ||
        editingActive !== selectedPermission.is_active ||
        Boolean(editingPassword.trim())
      : false;
  const showInlinePermissionEditor = Boolean(
    selectedPermission && activePermissionDraft && selectedPermissionId === "__inline-permission-editor__",
  );

  function updateDraft(moduleKey: keyof ModulePermissionDraft, patch: Partial<ModulePermissionDraft[keyof ModulePermissionDraft]>) {
    if (!selectedPermission || !activePermissionDraft || selectedOwner) return;
    setDraftPermissionId(selectedPermission.id);
    setPermissionDraft({
      ...activePermissionDraft,
      [moduleKey]: {
        ...activePermissionDraft[moduleKey],
        ...patch,
      },
    });
  }

  function changeEditingUserRole(role: AdminUserRole) {
    setEditingUserRole(role);
    if (!selectedPermission || !activePermissionDraft || role !== "marketing_agent") return;
    setDraftPermissionId(selectedPermission.id);
    setPermissionDraft(applyRolePermissionDefaults(activePermissionDraft, role));
  }

  function cancelChanges() {
    if (selectedPermission) {
      setDraftPermissionId(selectedPermission.id);
      setPermissionDraft(buildModulePermissionDraft(selectedPermission));
      setEditingUserRole(getPermissionRole(selectedPermission));
      setEditingFullName(selectedPermission.full_name ?? "");
      setEditingActive(selectedPermission.is_active);
      setEditingPassword("");
    }
    closePermissionEditor();
  }

  function acceptChanges() {
    if (!selectedPermission || !activePermissionDraft) return;
    savePermissionMutation.mutate({
      permission: selectedPermission,
      draft: activePermissionDraft,
      role: editingUserRole,
      full_name: editingFullName,
      is_active: editingActive,
      password: editingPassword,
    });
  }

  function selectPermission(permission: AdminUserModulePermissions) {
    setSelectedPermissionId(permission.id);
    setDraftPermissionId(permission.id);
    setPermissionDraft(buildModulePermissionDraft(permission));
    setEditingUserRole(getPermissionRole(permission));
    setEditingFullName(permission.full_name ?? "");
    setEditingActive(permission.is_active);
    setEditingPassword("");
  }

  function closePermissionEditor() {
    setSelectedPermissionId(null);
    setDraftPermissionId(null);
    setPermissionDraft(null);
    setEditingUserRole("manager");
    setEditingFullName("");
    setEditingActive(true);
    setEditingPassword("");
  }

  function getDraftForPermission(permission: AdminUserModulePermissions) {
    if (draftPermissionId === permission.id && permissionDraft) {
      return permissionDraft;
    }
    return buildModulePermissionDraft(permission);
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div>
          <button type="button" className="admin-module-back" onClick={onOpenHub}>
            <i className="bi bi-arrow-left"></i>
            <span className="admin-module-back-label">Ajustes</span>
          </button>
        </div>
        <nav className="admin-nav" aria-label="Secciones de ajustes">
          <button
            className={activeSettingsSection === "permissions" ? "active" : undefined}
            type="button"
            onClick={() => setActiveSettingsSection("permissions")}
          >
            <ShieldCheck size={18} />
            Usuarios y permisos
          </button>
          <button
            className={activeSettingsSection === "support_mailer" ? "active" : undefined}
            type="button"
            onClick={() => setActiveSettingsSection("support_mailer")}
          >
            <Mail size={18} />
            Correo de soportes
          </button>
        </nav>
        <SidebarUserFooter
          email={session.user.email}
          statusLabel="Sesión activa"
          onSignOut={() => {
            void supabase.auth.signOut();
          }}
        />
      </aside>

      <main className="admin-workspace">
        <section className="admin-section">
          <div className="admin-section-head">
            <div>
              <p className="eyebrow">
                {activeSettingsSection === "permissions"
                  ? "Seguridad"
                  : "Correo saliente"}
              </p>
              <h2>
                {activeSettingsSection === "permissions"
                  ? "Ajustes del sistema"
                  : "Configuración de correo"}
              </h2>
            </div>
            {activeSettingsSection === "permissions" ? (
              <button type="button" onClick={() => setCreateUserModalOpen(true)}>
                <Plus size={18} />
                Crear usuario
              </button>
            ) : null}
          </div>
          {activeSettingsSection === "permissions" ? (
          <article className="panel">
            <div className="catalog-note">
              Activa solamente los módulos que cada usuario puede ver en el panel.
            </div>
            <div className="table-wrap">
              <table className="records-table permissions-table">
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Servicios</th>
                    <th>Inventario</th>
                    <th>Pólizas</th>
                    <th>Reportes</th>
                    <th>Compras</th>
                    <th>Marketing</th>
                    <th>Cotizador IMEBA</th>
                    <th>Calculadora</th>
                    <th>Rol / estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {permissions.map((permission) => {
                    const owner = isPermissionOwner(permission);
                    const rowDraft = getDraftForPermission(permission);

                    return (
                      <tr
                        key={permission.id}
                        className={selectedPermission?.id === permission.id ? "clickable-row selected-row" : "clickable-row"}
                        onClick={() => selectPermission(permission)}
                      >
                        <td>
                          <strong>{permission.email}</strong>
                          <small>{permission.user_id}</small>
                        </td>
                        <td>
                          <PermissionSummary value={owner ? { can_access: true, visibility_scope: "all" } : rowDraft.supports} />
                        </td>
                        <td>
                          <PermissionSummary value={owner ? { can_access: true, visibility_scope: "all" } : rowDraft.inventory} />
                        </td>
                        <td>
                          <PermissionSummary value={owner ? { can_access: true, visibility_scope: "all" } : rowDraft.policies} />
                        </td>
                        <td>
                          <PermissionSummary value={owner ? { can_access: true, visibility_scope: "all" } : rowDraft.reports} />
                        </td>
                        <td>
                          <PermissionSummary value={owner ? { can_access: true, visibility_scope: "all" } : rowDraft.purchases} />
                        </td>
                        <td>
                          <PermissionSummary value={owner ? { can_access: true, visibility_scope: "all" } : rowDraft.marketing} />
                        </td>
                        <td>
                          <PermissionSummary value={owner ? { can_access: true, visibility_scope: "all" } : rowDraft.quoting} />
                        </td>
                        <td>
                          <PermissionSummary value={owner ? { can_access: true, visibility_scope: "all" } : rowDraft.calculator} />
                        </td>
                        <td>
                          <strong>{roleLabel(permission.role ?? (owner ? "owner" : "manager"))}</strong>
                          <small>{permission.is_active ? "Activo" : "Inactivo"}</small>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="icon-button"
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                selectPermission(permission);
                              }}
                              aria-label={`Ver permisos de ${permission.email}`}
                              title="Ver permisos"
                            >
                              <Eye size={16} />
                            </button>
                            <button
                              className="icon-button"
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                selectPermission(permission);
                              }}
                              aria-label={`Editar permisos de ${permission.email}`}
                              title="Editar permisos"
                            >
                              <Edit2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {showInlinePermissionEditor && selectedPermission && activePermissionDraft ? (
                <div className="settings-permission-editor">
                  <div className="settings-editor-head">
                    <div>
                      <span className="inventory-category">{selectedOwner ? "Propietario" : "Usuario"}</span>
                      <h3>{selectedPermission.email}</h3>
                      <p>Activa solamente los módulos que este usuario puede ver en el panel.</p>
                      <p>Define si cada módulo muestra todo el contenido o solo lo creado por este usuario.</p>
                    </div>
                    <SlidersHorizontal size={22} />
                  </div>
                  <div className="permissions-module-list">
                    {adminModules.map((module) => {
                      const moduleDraft = activePermissionDraft[module.key];
                      return (
                        <div className="permission-module-card" key={module.key}>
                          <div>
                            <strong>{module.label}</strong>
                            <small>{moduleDraft.can_access ? "Módulo visible" : "Módulo oculto"}</small>
                          </div>
                          <PermissionToggle
                            checked={moduleDraft.can_access}
                            disabled={selectedOwner || savePermissionMutation.isPending}
                            onChange={(checked) => updateDraft(module.key, { can_access: checked })}
                          />
                          <label className="field">
                            <span>Contenido visible</span>
                            <select
                              value={moduleDraft.visibility_scope}
                              disabled={!moduleDraft.can_access || selectedOwner || savePermissionMutation.isPending}
                              onChange={(event) =>
                                updateDraft(module.key, { visibility_scope: event.target.value as "all" | "own" })
                              }
                            >
                              <option value="all">Todo el contenido del módulo</option>
                              <option value="own">Solo lo creado por él</option>
                            </select>
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {permissionsQuery.isLoading ? (
                <EmptyState title="Cargando">Consultando usuarios registrados...</EmptyState>
              ) : null}
              {!permissionsQuery.isLoading && permissions.length === 0 ? (
                <EmptyState title="Sin usuarios">No hay usuarios autenticados para mostrar.</EmptyState>
              ) : null}
            </div>
            {savePermissionMutation.error ? (
              <p className="form-error permissions-error">{savePermissionMutation.error.message}</p>
            ) : null}
          </article>
          ) : (
            <SupportMailerSettingsPanel
              key={supportMailerQuery.data?.updated_at ?? "support-mailer-panel"}
              settings={supportMailerQuery.data}
              isLoading={supportMailerQuery.isLoading}
              isSaving={saveSupportMailerMutation.isPending}
              error={supportMailerQuery.error?.message ?? saveSupportMailerMutation.error?.message}
              onSave={(payload) => saveSupportMailerMutation.mutate(payload)}
            />
          )}
        </section>
      </main>
      {selectedPermission && activePermissionDraft ? (
        <Modal title={`Permisos de ${selectedPermission.email}`} onClose={cancelChanges} size="wide">
          <div className="settings-permission-editor modal-permission-editor">
            <div className="settings-editor-head">
              <div>
                <span className="inventory-category">{selectedOwner ? "Propietario" : "Usuario"}</span>
                <h3>{selectedPermission.email}</h3>
                <p>Actualiza el tipo de usuario, cambia su contraseña o ajusta sus permisos por módulo.</p>
              </div>
              <SlidersHorizontal size={22} />
            </div>
            <div className="form-grid">
              <label className="field">
                <span>Nombre</span>
                <input
                  value={editingFullName}
                  onChange={(event) => setEditingFullName(event.target.value)}
                  disabled={savePermissionMutation.isPending}
                />
              </label>
              <label className="field">
                <span>Rol</span>
                <select
                  value={editingUserRole}
                  disabled={savePermissionMutation.isPending}
                  onChange={(event) => changeEditingUserRole(event.target.value as AdminUserRole)}
                >
                  {adminUserRoles.map((role) => (
                    <option key={role.value} value={role.value}>{role.label}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Estado</span>
                <select
                  value={editingActive ? "active" : "inactive"}
                  disabled={savePermissionMutation.isPending || selectedOwner}
                  onChange={(event) => setEditingActive(event.target.value === "active")}
                >
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </select>
              </label>
              <label className="field">
                <span>Nueva contraseña</span>
                <input
                  type="password"
                  value={editingPassword}
                  onChange={(event) => setEditingPassword(event.target.value)}
                  minLength={6}
                  placeholder="Dejar vacío para conservarla"
                  disabled={savePermissionMutation.isPending}
                />
              </label>
            </div>
            {selectedPermission.role === "owner" ? (
              <div className="catalog-note">
                Este correo es propietario fijo del sistema. Puedes cambiar su contraseña, pero el tipo se mantiene como Propietario.
              </div>
            ) : null}
            <div className="permissions-module-list">
              {adminModules.map((module) => {
                const moduleDraft = selectedOwner
                  ? { can_access: true, visibility_scope: "all" as const }
                  : activePermissionDraft[module.key];
                return (
                  <div className="permission-module-card" key={module.key}>
                    <div>
                      <strong>{module.label}</strong>
                      <small>{moduleDraft.can_access ? "Módulo visible" : "Módulo oculto"}</small>
                    </div>
                    <PermissionToggle
                      checked={moduleDraft.can_access}
                      disabled={selectedOwner || savePermissionMutation.isPending}
                      onChange={(checked) => updateDraft(module.key, { can_access: checked })}
                    />
                    <label className="field">
                      <span>Contenido visible</span>
                      <select
                        value={moduleDraft.visibility_scope}
                        disabled={!moduleDraft.can_access || selectedOwner || savePermissionMutation.isPending}
                        onChange={(event) =>
                          updateDraft(module.key, { visibility_scope: event.target.value as "all" | "own" })
                        }
                      >
                        <option value="all">Todo el contenido del módulo</option>
                        <option value="own">Solo lo creado por él</option>
                      </select>
                    </label>
                  </div>
                );
              })}
            </div>
            {savePermissionMutation.error ? (
              <p className="form-error permissions-error">{savePermissionMutation.error.message}</p>
            ) : null}
            <div className="permission-modal-actions">
              <button
                type="button"
                onClick={acceptChanges}
                disabled={!hasPendingDraft || savePermissionMutation.isPending}
              >
                Aceptar
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={cancelChanges}
                disabled={savePermissionMutation.isPending}
              >
                Cancelar
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
      {createUserModalOpen ? (
        <Modal title="Crear usuario" onClose={() => setCreateUserModalOpen(false)} size="wide">
          <CreateAdminUserForm
            isSaving={createUserMutation.isPending}
            error={createUserMutation.error?.message}
            onSave={(payload) => createUserMutation.mutate(payload)}
            onCancel={() => setCreateUserModalOpen(false)}
          />
        </Modal>
      ) : null}
      {resultModal ? (
        <Modal title={resultModal.title} onClose={() => setResultModal(null)}>
          <div className="permission-result-modal">
            <span className={`policy-notification-icon ${resultModal.tone === "success" ? "success" : "danger"}`}>
              <ShieldCheck size={26} />
            </span>
            <p>{resultModal.message}</p>
            <button type="button" onClick={() => setResultModal(null)}>
              Aceptar
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function SupportMailerSettingsPanel({
  settings,
  isLoading,
  isSaving,
  error,
  onSave,
}: {
  settings: SupportMailerSettings | null | undefined;
  isLoading: boolean;
  isSaving: boolean;
  error?: string;
  onSave: (payload: SupportMailerSettingsDraft) => void;
}) {
  const [draft, setDraft] = useState<SupportMailerSettingsDraft>(() =>
    buildSupportMailerDraftFromSettings(settings),
  );

  return (
    <article className="panel">
      <div className="catalog-note">
        Configura el correo desde el que se envían las actualizaciones de estado del módulo de soportes.
      </div>
      {isLoading ? (
        <div className="reports-panel-body">
          <EmptyState title="Cargando">Consultando la configuración actual del correo...</EmptyState>
        </div>
      ) : (
        <form
          className="compact-form settings-mailer-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(draft);
          }}
        >
          <div className="form-grid">
            <label className="field">
              <span>Asunto del correo</span>
              <input
                type="text"
                value={draft.subject_template}
                onChange={(event) => setDraft((current) => ({ ...current, subject_template: event.target.value }))}
                placeholder="Actualización de soporte {{folio}}: {{event_label}}"
                disabled={isSaving}
              />
            </label>
            <label className="field">
              <span>Texto plano del correo</span>
              <textarea
                value={draft.text_template}
                onChange={(event) => setDraft((current) => ({ ...current, text_template: event.target.value }))}
                rows={10}
                disabled={isSaving}
              />
            </label>
            <label className="field">
              <span>Plantilla HTML del correo</span>
              <textarea
                value={draft.html_template}
                onChange={(event) => setDraft((current) => ({ ...current, html_template: event.target.value }))}
                rows={16}
                disabled={isSaving}
              />
            </label>
            <label className="field">
              <span>Usuario SMTP</span>
              <input
                type="text"
                value={draft.smtp_username}
                onChange={(event) => setDraft((current) => ({ ...current, smtp_username: event.target.value }))}
                disabled={isSaving}
              />
            </label>
            <label className="field">
              <span>Contraseña SMTP</span>
              <input
                type="password"
                value={draft.smtp_password}
                onChange={(event) => setDraft((current) => ({ ...current, smtp_password: event.target.value }))}
                disabled={isSaving}
              />
            </label>
            <label className="field">
              <span>Correo remitente</span>
              <input
                type="email"
                value={draft.sender_email}
                onChange={(event) => setDraft((current) => ({ ...current, sender_email: event.target.value }))}
                disabled={isSaving}
              />
            </label>
            <label className="field">
              <span>Nombre remitente</span>
              <input
                type="text"
                value={draft.sender_name}
                onChange={(event) => setDraft((current) => ({ ...current, sender_name: event.target.value }))}
                disabled={isSaving}
              />
            </label>
            <label className="field">
              <span>Responder a</span>
              <input
                type="email"
                value={draft.reply_to_email ?? ""}
                onChange={(event) => setDraft((current) => ({ ...current, reply_to_email: event.target.value || null }))}
                placeholder="soporte@tectronic.mx"
                disabled={isSaving}
              />
            </label>
          </div>
          <div className="settings-mailer-options">
            <label className="check-field">
              <input
                type="checkbox"
                checked={draft.smtp_secure}
                onChange={(event) => setDraft((current) => ({ ...current, smtp_secure: event.target.checked }))}
                disabled={isSaving}
              />
              <span>Usar conexión segura SMTP</span>
            </label>
            <label className="check-field">
              <input
                type="checkbox"
                checked={draft.is_active}
                onChange={(event) => setDraft((current) => ({ ...current, is_active: event.target.checked }))}
                disabled={isSaving}
              />
              <span>Configuración activa para envíos</span>
            </label>
          </div>
          <div className="catalog-note settings-mailer-note">
            En el correo al cliente se resaltarán en verde y subrayados la descripción del movimiento, el movimiento y el estado actual del soporte.
          </div>
          {error ? <p className="form-error permissions-error">{error}</p> : null}
          <div className="permission-modal-actions">
            <button type="submit" disabled={isSaving}>
              {isSaving ? "Guardando..." : "Guardar configuración"}
            </button>
          </div>
        </form>
      )}
    </article>
  );
}

function PermissionSummary({
  value,
}: {
  value: { can_access: boolean; visibility_scope: "all" | "own" };
}) {
  if (!value.can_access) {
    return <span className="permission-chip denied">Sin acceso</span>;
  }

  return (
    <span className="permission-chip allowed">
      {value.visibility_scope === "own" ? "Solo propios" : "Todo"}
    </span>
  );
}

function buildDefaultSupportMailerDraft(): SupportMailerSettingsDraft {
  return {
    provider: "hostinger",
    smtp_host: "",
    smtp_port: 465,
    smtp_secure: true,
    smtp_username: "",
    smtp_password: "",
    sender_email: "",
    sender_name: "Soportes Tectronic",
    reply_to_email: null,
    is_active: true,
    subject_template: "Actualización de soporte {{folio}}: {{event_label}}",
    text_template:
      "Hola {{customer_name}},\n\nTe compartimos una actualización de tu soporte.\n\n{{details_text}}\n\nSi necesitas más información, responde a este correo o ponte en contacto con Soportes Tectronic.",
    html_template:
      "<div style=\"font-family: Arial, sans-serif; color: #24313f; line-height: 1.6;\">\n  <h2 style=\"margin-bottom: 12px;\">Actualización de soporte</h2>\n  <p>Hola <strong>{{customer_name}}</strong>,</p>\n  <p>Te compartimos una actualización de tu soporte.</p>\n  {{details_html}}\n  <p>Si necesitas más información, responde a este correo o ponte en contacto con Soportes Tectronic.</p>\n</div>",
  };
}

function buildSupportMailerDraftFromSettings(
  settings: SupportMailerSettings | null | undefined,
): SupportMailerSettingsDraft {
  const defaults = buildDefaultSupportMailerDraft();

  if (!settings) {
    return defaults;
  }

  return {
    provider: settings.provider,
    smtp_host: settings.smtp_host,
    smtp_port: settings.smtp_port,
    smtp_secure: settings.smtp_secure,
    smtp_username: settings.smtp_username,
    smtp_password: settings.smtp_password,
    sender_email: settings.sender_email,
    sender_name: settings.sender_name,
    reply_to_email: settings.reply_to_email,
    is_active: settings.is_active,
    subject_template: settings.subject_template?.trim() || defaults.subject_template,
    text_template: settings.text_template?.trim() || defaults.text_template,
    html_template: settings.html_template?.trim() || defaults.html_template,
  };
}

function CreateAdminUserForm({
  isSaving,
  error,
  onSave,
  onCancel,
}: {
  isSaving: boolean;
  error?: string;
  onSave: (payload: CreateAdminUserDraft) => void;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [userRole, setUserRole] = useState<AdminUserRole>("manager");
  const [draft, setDraft] = useState<ModulePermissionDraft>(buildEmptyPermissionDraft());
  const [localError, setLocalError] = useState("");
  const isOwner = userRole === "owner";

  function updateNewUserDraft(
    moduleKey: keyof ModulePermissionDraft,
    patch: Partial<ModulePermissionDraft[keyof ModulePermissionDraft]>,
  ) {
    if (isOwner) return;
    setDraft({
      ...draft,
      [moduleKey]: {
        ...draft[moduleKey],
        ...patch,
      },
    });
  }

  function changeNewUserRole(role: AdminUserRole) {
    setUserRole(role);
    setDraft((currentDraft) => applyRolePermissionDefaults(currentDraft, role));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) {
      setLocalError("Indica el correo del usuario.");
      return;
    }
    if (password.length < 6) {
      setLocalError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    setLocalError("");
    onSave({
      email,
      password,
      full_name: fullName,
      role: userRole,
      permissions: draft,
    });
  }

  return (
    <form className="settings-permission-editor modal-permission-editor" onSubmit={submit}>
      <div className="form-grid">
        <label className="field">
          <span>Nombre</span>
          <input value={fullName} onChange={(event) => setFullName(event.target.value)} />
        </label>
        <label className="field">
          <span>Correo</span>
          <input
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setLocalError("");
            }}
            placeholder="usuario@tectronic.mx"
            required
          />
        </label>
        <label className="field">
          <span>Rol</span>
          <select value={userRole} onChange={(event) => changeNewUserRole(event.target.value as AdminUserRole)}>
            {adminUserRoles.map((role) => (
              <option key={role.value} value={role.value}>{role.label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Contraseña</span>
          <input
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setLocalError("");
            }}
            minLength={6}
            required
          />
        </label>
      </div>
      <div className="catalog-note">
        {isOwner
          ? "Los propietarios tienen acceso completo a todos los módulos y pueden administrar usuarios."
          : "Configura los módulos que este usuario podrá ver al iniciar sesión."}
      </div>
      <div className="permissions-module-list">
        {adminModules.map((module) => {
          const moduleDraft = isOwner ? { can_access: true, visibility_scope: "all" as const } : draft[module.key];
          return (
            <div className="permission-module-card" key={module.key}>
              <div>
                <strong>{module.label}</strong>
                <small>{moduleDraft.can_access ? "Módulo visible" : "Módulo oculto"}</small>
              </div>
              <PermissionToggle
                checked={moduleDraft.can_access}
                disabled={isOwner || isSaving}
                onChange={(checked) => updateNewUserDraft(module.key, { can_access: checked })}
              />
              <label className="field">
                <span>Contenido visible</span>
                <select
                  value={moduleDraft.visibility_scope}
                  disabled={!moduleDraft.can_access || isOwner || isSaving}
                  onChange={(event) =>
                    updateNewUserDraft(module.key, { visibility_scope: event.target.value as "all" | "own" })
                  }
                >
                  <option value="all">Todo el contenido del módulo</option>
                  <option value="own">Solo lo creado por él</option>
                </select>
              </label>
            </div>
          );
        })}
      </div>
      {localError || error ? (
        <p className="form-error permissions-error">{localError || error}</p>
      ) : null}
      <div className="permission-modal-actions">
        <button type="submit" disabled={isSaving}>
          {isSaving ? "Creando..." : "Crear usuario"}
        </button>
        <button className="secondary-button" type="button" onClick={onCancel} disabled={isSaving}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function PermissionToggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="permission-toggle">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{checked ? "Permitido" : "Sin acceso"}</span>
    </label>
  );
}

function SupportAdminDashboard({
  session,
  onOpenHub,
}: {
  session: Session;
  onOpenHub: () => void;
}) {
  const [activeSection, setActiveSection] = useState<AdminSection>("register");
  const [supportSearch, setSupportSearch] = useState("");
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const [manufacturerModal, setManufacturerModal] = useState<
    Manufacturer | "new" | null
  >(null);
  const [modelModal, setModelModal] = useState<ModelDraft | "new" | null>(null);
  const [eventModal, setEventModal] = useState<EventDraft | "new" | null>(null);
  const [agentModal, setAgentModal] = useState<AgentDraft | "new" | null>(null);
  const [selectedSupport, setSelectedSupport] =
    useState<SupportCaseWithEvents | null>(null);
  const queryClient = useQueryClient();

  const manufacturersQuery = useQuery({
    queryKey: ["manufacturers"],
    queryFn: getManufacturers,
  });
  const printerModelsQuery = useQuery({
    queryKey: ["printer-models"],
    queryFn: getPrinterModels,
  });
  const eventTypesQuery = useQuery({
    queryKey: ["support-event-types"],
    queryFn: getSupportEventTypes,
  });
  const agentsQuery = useQuery({
    queryKey: ["support-agents"],
    queryFn: getSupportAgents,
  });
  const supportsQuery = useQuery({
    queryKey: ["admin-supports", session.user.id, supportSearch],
    queryFn: () => adminSearchSupports(supportSearch),
  });

  const manufacturers = manufacturersQuery.data ?? [];
  const printerModels = printerModelsQuery.data ?? [];
  const eventTypes = eventTypesQuery.data ?? [];
  const agents = agentsQuery.data ?? [];

  const createSupportMutation = useMutation({
    mutationFn: createSupportCase,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-supports"] });
      setSupportModalOpen(false);
    },
  });

  async function refreshSelectedSupport(supportCaseId: string) {
    const result = await supportsQuery.refetch();
    const refreshedSupport = result.data?.find(
      (support) => support.id === supportCaseId,
    );
    if (refreshedSupport) {
      setSelectedSupport(refreshedSupport);
    }
  }

  const addImagesMutation = useMutation({
    mutationFn: (payload: {
      supportCaseId: string;
      files: File[];
      currentFiles: SupportImage[];
    }) =>
      addSupportImages(
        payload.supportCaseId,
        payload.files,
        payload.currentFiles,
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-supports"] });
      refreshSelectedSupport(variables.supportCaseId);
    },
  });

  const deleteImageMutation = useMutation({
    mutationFn: (payload: { supportCaseId: string; image: SupportImage }) =>
      deleteSupportImage(payload.image),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-supports"] });
      refreshSelectedSupport(variables.supportCaseId);
    },
  });

  const addMovementMutation = useMutation({
    mutationFn: addSupportMovement,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-supports"] });
      refreshSelectedSupport(variables.support_case_id);
    },
  });

  const saveManufacturerMutation = useMutation({
    mutationFn: (payload: { id?: string; name: string }) =>
      payload.id
        ? updateManufacturer({ id: payload.id, name: payload.name })
        : createManufacturer({ name: payload.name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manufacturers"] });
      setManufacturerModal(null);
    },
  });

  const saveModelMutation = useMutation({
    mutationFn: (payload: ModelDraft) =>
      payload.id
        ? updatePrinterModel({
            id: payload.id,
            manufacturer_id: payload.manufacturer_id,
            name: payload.name,
            part_number: payload.part_number,
          })
        : createPrinterModel(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["printer-models"] });
      setModelModal(null);
    },
  });

  const removeModelMutation = useMutation({
    mutationFn: deletePrinterModel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["printer-models"] });
    },
  });

  const saveEventTypeMutation = useMutation({
    mutationFn: (payload: EventDraft) =>
      payload.id
        ? updateSupportEventType({
            id: payload.id,
            name: payload.name,
            code: payload.code,
            event_type: payload.event_type,
            support_type: payload.support_type,
            description: payload.description,
            sort_order: payload.sort_order,
          })
        : createSupportEventType(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-event-types"] });
      setEventModal(null);
    },
  });

  const removeEventTypeMutation = useMutation({
    mutationFn: deleteSupportEventType,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-event-types"] });
    },
  });

  const saveAgentMutation = useMutation({
    mutationFn: (payload: AgentDraft) =>
      payload.id
        ? updateSupportAgent({
            id: payload.id,
            full_name: payload.full_name,
            position: payload.position,
          })
        : createSupportAgent(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-agents"] });
      setAgentModal(null);
    },
  });

  const removeAgentMutation = useMutation({
    mutationFn: deleteSupportAgent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-agents"] });
    },
  });

  function requestDeleteModel(model: PrinterModelWithManufacturer) {
    const ok = window.confirm(`Eliminar modelo "${model.name}"?`);
    if (ok) removeModelMutation.mutate(model.id);
  }

  function requestDeleteEventType(eventType: SupportEventType) {
    const ok = window.confirm(`Eliminar estado "${eventType.name}"?`);
    if (ok) removeEventTypeMutation.mutate(eventType.id);
  }

  function requestDeleteAgent(agent: SupportAgent) {
    const ok = window.confirm(`Eliminar agente "${agent.full_name}"?`);
    if (ok) removeAgentMutation.mutate(agent.id);
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div>
          <button type="button" className="admin-module-back" onClick={onOpenHub}>
            <i className="bi bi-arrow-left"></i>
            <span className="admin-module-back-label">Soportes</span>
          </button>
        </div>
        <nav className="admin-nav" aria-label="Secciones de administración">
          {sections.map((section) => (
            <button
              key={section.id}
              className={activeSection === section.id ? "active" : undefined}
              type="button"
              onClick={() => setActiveSection(section.id)}
            >
              {section.icon}
              {section.label}
            </button>
          ))}
        </nav>
        <SidebarUserFooter
          email={session.user.email}
          statusLabel="Sesión activa"
          onSignOut={() => {
            void supabase.auth.signOut();
          }}
        />
      </aside>

      <main className="admin-workspace">
        {activeSection === "register" ? (
          <RegisterSection
            search={supportSearch}
            setSearch={setSupportSearch}
            supports={supportsQuery.data ?? []}
            isLoading={supportsQuery.isLoading}
            onAdd={() => setSupportModalOpen(true)}
            onSelect={setSelectedSupport}
          />
        ) : null}

        {activeSection === "manufacturers" ? (
          <ManufacturersSection
            manufacturers={manufacturers}
            printerModels={printerModels}
            onAddManufacturer={() => setManufacturerModal("new")}
            onAddModel={() => setModelModal("new")}
            onEditModel={(model) =>
              setModelModal({
                id: model.id,
                manufacturer_id: model.manufacturer_id,
                name: model.name,
                part_number: model.part_number ?? "",
              })
            }
            onDeleteModel={requestDeleteModel}
          />
        ) : null}

        {activeSection === "events" ? (
          <EventsSection
            eventTypes={eventTypes}
            onAdd={() => setEventModal("new")}
            onEdit={(eventType) =>
              setEventModal({
                id: eventType.id,
                name: eventType.name,
                code: eventType.code,
                event_type: eventType.event_type,
                support_type: eventType.support_type,
                description: eventType.description ?? "",
                sort_order: eventType.sort_order,
              })
            }
            onDelete={requestDeleteEventType}
          />
        ) : null}

        {activeSection === "agents" ? (
          <AgentsSection
            agents={agents}
            onAdd={() => setAgentModal("new")}
            onEdit={(agent) =>
              setAgentModal({
                id: agent.id,
                full_name: agent.full_name,
                position: agent.position,
              })
            }
            onDelete={requestDeleteAgent}
          />
        ) : null}
      </main>

      {supportModalOpen ? (
        <Modal
          title="Agregar nuevo soporte"
          onClose={() => setSupportModalOpen(false)}
          size="wide"
        >
          <SupportForm
            manufacturers={manufacturers}
            printerModels={printerModels}
            eventTypes={eventTypes}
            agents={agents}
            isSubmitting={createSupportMutation.isPending}
            onSubmit={(values) => createSupportMutation.mutate(values)}
            error={createSupportMutation.error?.message}
          />
        </Modal>
      ) : null}

      {selectedSupport ? (
        <Modal
          title={`Detalle del soporte ${selectedSupport.folio}`}
          onClose={() => setSelectedSupport(null)}
          size="wide"
        >
          <div className="support-detail-modal">
            <SupportMovementForm
              support={selectedSupport}
              eventTypes={eventTypes}
              isSubmitting={addMovementMutation.isPending}
              error={addMovementMutation.error?.message}
              onSubmit={(values) => addMovementMutation.mutate(values)}
            />
            <SupportImageManager
              support={selectedSupport}
              isAdding={addImagesMutation.isPending}
              isDeleting={deleteImageMutation.isPending}
              error={
                addImagesMutation.error?.message ??
                deleteImageMutation.error?.message
              }
              onAdd={(files) =>
                addImagesMutation.mutate({
                  supportCaseId: selectedSupport.id,
                  files,
                  currentFiles: selectedSupport.support_images ?? [],
                })
              }
              onDelete={(image) =>
                deleteImageMutation.mutate({
                  supportCaseId: selectedSupport.id,
                  image,
                })
              }
            />
            <SupportDetails
              cases={[selectedSupport]}
              disableFolioModal
              audience="admin"
              onSupportUpdated={refreshSelectedSupport}
            />
          </div>
        </Modal>
      ) : null}

      {manufacturerModal ? (
        <ManufacturerModal
          manufacturer={
            manufacturerModal === "new" ? undefined : manufacturerModal
          }
          isSaving={saveManufacturerMutation.isPending}
          error={saveManufacturerMutation.error?.message}
          onClose={() => setManufacturerModal(null)}
          onSave={(payload) => saveManufacturerMutation.mutate(payload)}
        />
      ) : null}

      {modelModal ? (
        <ModelModal
          model={modelModal === "new" ? undefined : modelModal}
          manufacturers={manufacturers}
          isSaving={saveModelMutation.isPending}
          error={saveModelMutation.error?.message}
          onClose={() => setModelModal(null)}
          onSave={(payload) => saveModelMutation.mutate(payload)}
        />
      ) : null}

      {eventModal ? (
        <EventTypeModal
          eventType={eventModal === "new" ? undefined : eventModal}
          isSaving={saveEventTypeMutation.isPending}
          error={saveEventTypeMutation.error?.message}
          onClose={() => setEventModal(null)}
          onSave={(payload) => saveEventTypeMutation.mutate(payload)}
        />
      ) : null}

      {agentModal ? (
        <AgentModal
          agent={agentModal === "new" ? undefined : agentModal}
          isSaving={saveAgentMutation.isPending}
          error={saveAgentMutation.error?.message}
          onClose={() => setAgentModal(null)}
          onSave={(payload) => saveAgentMutation.mutate(payload)}
        />
      ) : null}
    </div>
  );
}

function SupportImageManager({
  support,
  isAdding,
  isDeleting,
  error,
  onAdd,
  onDelete,
}: {
  support: SupportCaseWithEvents;
  isAdding: boolean;
  isDeleting: boolean;
  error?: string;
  onAdd: (files: File[]) => void;
  onDelete: (image: SupportImage) => void;
}) {
  const [localError, setLocalError] = useState("");
  const files = support.support_images ?? [];
  const images = files.filter((file) => !isSupportPdf(file));
  const pdfs = files.filter(isSupportPdf);
  const remainingImageSlots = MAX_SUPPORT_IMAGES - images.length;
  const remainingPdfSlots = MAX_SUPPORT_PDFS - pdfs.length;

  function handleFiles(files: FileList | null) {
    const selectedFiles = Array.from(files ?? []);
    if (selectedFiles.length === 0) return;

    if (selectedFiles.some((file) => !isAcceptedSupportFile(file))) {
      setLocalError("Solo se permiten imágenes PNG, JPG o archivos PDF.");
      return;
    }

    const incomingPdfCount = selectedFiles.filter((file) => file.type === "application/pdf").length;
    const incomingImageCount = selectedFiles.length - incomingPdfCount;

    if (incomingImageCount > remainingImageSlots) {
      setLocalError(
        `Solo puedes agregar ${remainingImageSlots} imagen${remainingImageSlots === 1 ? "" : "es"} más.`,
      );
      return;
    }

    if (incomingPdfCount > remainingPdfSlots) {
      setLocalError(
        `Solo puedes agregar ${remainingPdfSlots} PDF${remainingPdfSlots === 1 ? "" : "s"} más.`,
      );
      return;
    }

    setLocalError("");
    onAdd(selectedFiles);
  }

  return (
    <article className="admin-image-manager">
      <div>
        <h3>Archivos del soporte</h3>
        <p>
          {images.length} de {MAX_SUPPORT_IMAGES} imágenes y {pdfs.length} de {MAX_SUPPORT_PDFS} PDFs cargados.
        </p>
      </div>
      <label className="image-input-label">
        <Plus size={18} />
        Agregar archivos
        <input
          type="file"
          accept="image/png,image/jpeg,application/pdf"
          multiple
          disabled={(remainingImageSlots <= 0 && remainingPdfSlots <= 0) || isAdding}
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </label>
      {files.length > 0 ? (
        <div className="support-images-grid">
          {files.map((image) => (
            <div key={image.id} className="editable-support-image">
              <a
                href={getSupportImageUrl(image)}
                target="_blank"
                rel="noreferrer"
                className="support-image-link"
              >
                {isSupportPdf(image) ? (
                  <span className="support-pdf-preview">
                    <FileText size={24} />
                    <small>
                    {image?.original_name
                      ? image.original_name.length > 10
                        ? `${image.original_name.slice(0, 10)}...`
                        : image.original_name
                      : "PDF del soporte"}
                  </small>
                  </span>
                ) : (
                  <img
                    src={getSupportImageUrl(image)}
                    alt={image.original_name ?? "Imagen del soporte"}
                    loading="lazy"
                  />
                )}
              </a>
              <button
                type="button"
                className="icon-button danger-action"
                onClick={() => onDelete(image)}
                disabled={isDeleting}
                aria-label={isSupportPdf(image) ? "Eliminar PDF" : "Eliminar imagen"}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {localError || error ? (
        <p className="form-error">{localError || error}</p>
      ) : null}
    </article>
  );
}

function SupportMovementForm({
  support,
  eventTypes,
  isSubmitting,
  error,
  onSubmit,
}: {
  support: SupportCaseWithEvents;
  eventTypes: SupportEventType[];
  isSubmitting: boolean;
  error?: string;
  onSubmit: (values: SupportMovementFormValues) => void;
}) {
  const activeEventTypes = useMemo(
    () =>
      eventTypes.filter(
        (eventType) =>
          eventType.is_active &&
          eventType.support_type === support.support_type,
      ),
    [eventTypes, support.support_type],
  );
  const [eventTypeId, setEventTypeId] = useState(activeEventTypes[0]?.id ?? "");
  const [requiresRepair, setRequiresRepair] = useState(false);
  const [repairRequestNote, setRepairRequestNote] = useState("");
  const [repairRequestError, setRepairRequestError] = useState("");
  const [repairQuoteFile, setRepairQuoteFile] = useState<File | null>(null);
  const [repairQuoteError, setRepairQuoteError] = useState("");
  const [shippingCarrier, setShippingCarrier] = useState(supportShippingCarriers[0]);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [shippingError, setShippingError] = useState("");
  const selectedEventTypeId = activeEventTypes.some(
    (eventType) => eventType.id === eventTypeId,
  )
    ? eventTypeId
    : activeEventTypes[0]?.id || "";
  const selectedEventType =
    activeEventTypes.find(
      (eventType) => eventType.id === selectedEventTypeId,
    ) ?? null;
  const canRequestRepair =
    support.support_type === "technical" &&
    selectedEventType?.code === "diagnostico";
  const canRegisterShipment =
    support.support_type === "programming" && selectedEventType?.code === "enviada";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedEventType) return;
    if (canRequestRepair && !repairRequestNote.trim()) {
      setRepairRequestError("Escribe la descripción del diagnóstico.");
      return;
    }
    if (canRegisterShipment && !trackingNumber.trim()) {
      setShippingError("Indica el número de guía.");
      return;
    }

    if (
      canRequestRepair &&
      requiresRepair &&
      !repairQuoteFile &&
      !support.repair_quote_pdf_path
    ) {
      setRepairQuoteError("Carga una cotización en PDF para solicitar autorización.");
      return;
    }

    onSubmit({
      support_case_id: support.id,
      folio: support.folio,
      event_type: selectedEventType.event_type,
      event_type_id: selectedEventType.id,
      event_title: selectedEventType.name,
      status: caseStatusFromEventType(selectedEventType),
      is_diagnosis: canRequestRepair,
      requires_repair: canRequestRepair && requiresRepair,
      repair_request_note: canRequestRepair ? repairRequestNote.trim() : "",
      repair_quote_pdf_file:
        canRequestRepair && requiresRepair ? repairQuoteFile : null,
      current_repair_quote_pdf_path: support.repair_quote_pdf_path,
      current_repair_quote_pdf_name: support.repair_quote_pdf_name,
      shipping_carrier: canRegisterShipment ? shippingCarrier : "",
      tracking_number: canRegisterShipment ? trackingNumber.trim() : "",
    });
    setRequiresRepair(false);
    setRepairRequestNote("");
    setRepairRequestError("");
    setRepairQuoteFile(null);
    setRepairQuoteError("");
    setShippingCarrier(supportShippingCarriers[0]);
    setTrackingNumber("");
    setShippingError("");
  }

  return (
    <article className="admin-tracking-panel">
      <div className="tracking-state-card">
        <span>Estado actual</span>
        <strong>{getCurrentSupportState(support)}</strong>
        <small>Folio {support.folio}</small>
        {support.repair_approval_status ? (
          <small>
            Reparación: {repairApprovalLabel(
              support.repair_approval_status,
              support.repair_approval_response_source,
            )}
          </small>
        ) : null}
        {support.repair_approval_response_source ? (
          <small>
            Origen: {repairApprovalSourceLabel(support.repair_approval_response_source)}
          </small>
        ) : null}
      </div>
      <form className="compact-form tracking-form" onSubmit={submit}>
        <div className="form-grid">
          <label className="field">
            <span>Nuevo estado del folio</span>
            <select
              value={selectedEventTypeId}
              onChange={(event) => {
                setEventTypeId(event.target.value);
                setRequiresRepair(false);
                setRepairRequestNote("");
                setRepairRequestError("");
                setRepairQuoteFile(null);
                setRepairQuoteError("");
                setTrackingNumber("");
                setShippingError("");
              }}
            >
              {activeEventTypes.map((eventType) => (
                <option key={eventType.id} value={eventType.id}>
                  {eventType.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {canRequestRepair ? (
          <>
            <label className="field">
              <span>Descripción</span>
              <input
                value={repairRequestNote}
                onChange={(event) => {
                  setRepairRequestNote(event.target.value);
                  setRepairRequestError("");
                }}
                placeholder="Ej. Equipo con falla en cabezal y requiere revisión adicional"
              />
              {repairRequestError ? (
                <small className="field-error">{repairRequestError}</small>
              ) : null}
            </label>
            <label className="check-field">
              <input
                type="checkbox"
                checked={requiresRepair}
                onChange={(event) => {
                  setRequiresRepair(event.target.checked);
                  if (!event.target.checked) {
                    setRepairQuoteFile(null);
                    setRepairQuoteError("");
                  }
                }}
              />
              Mostrar al cliente que su equipo necesita reparación y pedir autorización
            </label>
            {requiresRepair ? (
              <label className="field">
                <span>Cotización en PDF</span>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    if (file && file.type !== "application/pdf") {
                      setRepairQuoteFile(null);
                      setRepairQuoteError("Solo se permite un archivo PDF.");
                      event.target.value = "";
                      return;
                    }
                    setRepairQuoteFile(file);
                    setRepairQuoteError("");
                  }}
                />
                <small>
                  Este archivo se mostrará al cliente junto con la solicitud de autorización.
                </small>
                {!repairQuoteFile && support.repair_quote_pdf_path ? (
                  <small>
                    Si no cargas una nueva cotización, se reutilizará la ya guardada para este folio.
                  </small>
                ) : null}
                {repairQuoteFile ? (
                  <small>Archivo seleccionado: {repairQuoteFile.name}</small>
                ) : null}
                {repairQuoteError ? (
                  <small className="field-error">{repairQuoteError}</small>
                ) : null}
              </label>
            ) : null}
          </>
        ) : null}
        {canRegisterShipment ? (
          <div className="form-grid">
            <label className="field">
              <span>Paquetería</span>
              <select value={shippingCarrier} onChange={(event) => setShippingCarrier(event.target.value)}>
                {supportShippingCarriers.map((carrier) => (
                  <option key={carrier} value={carrier}>
                    {carrier}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Número de guía</span>
              <input
                value={trackingNumber}
                onChange={(event) => {
                  setTrackingNumber(event.target.value);
                  setShippingError("");
                }}
                placeholder="Ej. 1234567890"
              />
              {shippingError ? (
                <small className="field-error">{shippingError}</small>
              ) : null}
            </label>
          </div>
        ) : null}
        {error ? <p className="form-error">{error}</p> : null}
        <button type="submit" disabled={isSubmitting || !selectedEventType}>
          {isSubmitting ? "Guardando movimiento..." : "Actualizar estado"}
        </button>
      </form>
    </article>
  );
}

function repairApprovalLabel(
  status: SupportCaseWithEvents["repair_approval_status"],
  source?: SupportCaseWithEvents["repair_approval_response_source"],
) {
  if (status === "accepted") return "aceptada";
  if (status === "declined") {
    return source === "automatic"
      ? "no revisada por el cliente"
      : "no aceptada";
  }
  if (status === "pending") return "pendiente de respuesta";
  return "sin solicitud";
}

function repairApprovalSourceLabel(
  source: SupportCaseWithEvents["repair_approval_response_source"],
) {
  if (source === "customer") return "cliente";
  if (source === "automatic") return "capturado automáticamente";
  return "sin origen";
}

function supportTypeLabel(type: SupportEventType["support_type"]) {
  return type === "programming" ? "Programación" : "Técnico";
}

function RegisterSection({
  search,
  setSearch,
  supports,
  isLoading,
  onAdd,
  onSelect,
}: {
  search: string;
  setSearch: (value: string) => void;
  supports: SupportCaseWithEvents[];
  isLoading: boolean;
  onAdd: () => void;
  onSelect: (support: SupportCaseWithEvents) => void;
}) {
  return (
    <section className="admin-section">
      <div className="admin-section-head">
        <div>
          <p className="eyebrow">Registro</p>
          <h2>Registros de soportes</h2>
        </div>
        <button type="button" onClick={onAdd}>
          <Plus size={18} />
          Agregar nuevo soporte
        </button>
      </div>
      <article className="panel">
        <div className="table-toolbar">
          <label className="inline-search">
            <Search size={18} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por folio, cliente, serie o modelo"
            />
          </label>
          <span>{supports.length} registros</span>
        </div>
        <SupportRecordsTable
          supports={supports}
          isLoading={isLoading}
          onSelect={onSelect}
        />
      </article>
    </section>
  );
}

function ManufacturersSection({
  manufacturers,
  printerModels,
  onAddManufacturer,
  onAddModel,
  onEditModel,
  onDeleteModel,
}: {
  manufacturers: Manufacturer[];
  printerModels: PrinterModelWithManufacturer[];
  onAddManufacturer: () => void;
  onAddModel: () => void;
  onEditModel: (model: PrinterModelWithManufacturer) => void;
  onDeleteModel: (model: PrinterModelWithManufacturer) => void;
}) {
  return (
    <section className="admin-section">
      <div className="admin-section-head">
        <div>
          <p className="eyebrow">Catálogos</p>
          <h2>Impresoras</h2>
        </div>
        <div className="header-actions">
          <button type="button" onClick={onAddManufacturer}>
            <Plus size={18} />
            Agregar fabricante
          </button>
          <button type="button" onClick={onAddModel}>
            <Plus size={18} />
            Agregar impresora
          </button>
        </div>
      </div>

      <article className="panel">
        <div className="catalog-note">
          {manufacturers.length} fabricantes registrados para clasificar{" "}
          {printerModels.length} impresoras.
        </div>
        <div className="table-wrap">
          <table className="records-table">
            <thead>
              <tr>
                <th>Fabricante</th>
                <th>Modelo</th>
                <th>Número de parte</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {printerModels.map((model) => (
                <tr key={model.id}>
                  <td>{model.manufacturers?.name ?? "Sin fabricante"}</td>
                  <td>{model.name}</td>
                  <td>{model.part_number ?? "-"}</td>
                  <td>{model.is_active ? "Activo" : "Inactivo"}</td>
                  <td>
                    <RowActions
                      onEdit={() => onEditModel(model)}
                      onDelete={() => onDeleteModel(model)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

function EventsSection({
  eventTypes,
  onAdd,
  onEdit,
  onDelete,
}: {
  eventTypes: SupportEventType[];
  onAdd: () => void;
  onEdit: (eventType: SupportEventType) => void;
  onDelete: (eventType: SupportEventType) => void;
}) {
  return (
    <section className="admin-section">
      <div className="admin-section-head">
        <div>
          <p className="eyebrow">Catálogos</p>
          <h2>Estados del soporte</h2>
        </div>
        <button type="button" onClick={onAdd}>
          <Plus size={18} />
          Agregar estado
        </button>
      </div>
      <article className="panel">
        <div className="table-wrap">
          <table className="records-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Código</th>
                <th>Tipo de soporte</th>
                <th>Tipo interno</th>
                <th>Orden</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {eventTypes.map((eventType) => (
                <tr key={eventType.id}>
                  <td>{eventType.name}</td>
                  <td>{eventType.code}</td>
                  <td>{supportTypeLabel(eventType.support_type)}</td>
                  <td>{eventType.event_type}</td>
                  <td>{eventType.sort_order}</td>
                  <td>{eventType.is_active ? "Activo" : "Inactivo"}</td>
                  <td>
                    <RowActions
                      onEdit={() => onEdit(eventType)}
                      onDelete={() => onDelete(eventType)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

function AgentsSection({
  agents,
  onAdd,
  onEdit,
  onDelete,
}: {
  agents: SupportAgent[];
  onAdd: () => void;
  onEdit: (agent: SupportAgent) => void;
  onDelete: (agent: SupportAgent) => void;
}) {
  return (
    <section className="admin-section">
      <div className="admin-section-head">
        <div>
          <p className="eyebrow">Equipo</p>
          <h2>Agentes</h2>
        </div>
        <button type="button" onClick={onAdd}>
          <Plus size={18} />
          Crear agente
        </button>
      </div>
      <article className="panel">
        <div className="table-wrap">
          <table className="records-table">
            <thead>
              <tr>
                <th>Nombre completo</th>
                <th>Puesto</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr key={agent.id}>
                  <td>{agent.full_name}</td>
                  <td>{agent.position}</td>
                  <td>{agent.is_active ? "Activo" : "Inactivo"}</td>
                  <td>
                    <RowActions
                      onEdit={() => onEdit(agent)}
                      onDelete={() => onDelete(agent)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {agents.length === 0 ? (
            <EmptyState title="Sin agentes">
              Crea el primer agente para asignarlo a los soportes.
            </EmptyState>
          ) : null}
        </div>
      </article>
    </section>
  );
}

function SupportRecordsTable({
  supports,
  isLoading,
  onSelect,
}: {
  supports: SupportCaseWithEvents[];
  isLoading: boolean;
  onSelect?: (support: SupportCaseWithEvents) => void;
}) {
  if (isLoading) {
    return <EmptyState title="Cargando">Consultando registros...</EmptyState>;
  }

  if (supports.length === 0) {
    return (
      <EmptyState title="Sin registros">
        No hay soportes para mostrar.
      </EmptyState>
    );
  }

  return (
    <div className="table-wrap">
      <table className="records-table">
        <thead>
          <tr>
            <th>Folio</th>
            <th>Cliente</th>
            <th>Tipo</th>
            <th>Serie</th>
            <th>Fabricante</th>
            <th>Modelo</th>
            <th>Estado actual</th>
            <th>Último movimiento</th>
          </tr>
        </thead>
        <tbody>
          {supports.map((support) => {
            const latestEvent = getLatestSupportEvent(support);

            return (
              <tr
                key={support.id}
                className={onSelect ? "clickable-row" : undefined}
                onClick={() => onSelect?.(support)}
              >
                <td>{support.folio}</td>
                <td>
                  <div className="customer-meta-cell">
                    <strong>{support.customer_name}</strong>
                    <small>{support.customer_email ?? "Sin correo"}</small>
                    <small>{support.customer_phone ?? "Sin teléfono"}</small>
                  </div>
                </td>
                <td>{supportTypeLabel(support.support_type)}</td>
                <td>{support.serial_number}</td>
                <td>{support.manufacturer}</td>
                <td>{support.printer_model}</td>
                <td>{getCurrentSupportState(support)}</td>
                <td>
                  {latestEvent
                    ? formatDate(latestEvent.event_date)
                    : statusLabel(support.status)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ManufacturerModal({
  manufacturer,
  isSaving,
  error,
  onClose,
  onSave,
}: {
  manufacturer?: Manufacturer;
  isSaving: boolean;
  error?: string;
  onClose: () => void;
  onSave: (payload: { id?: string; name: string }) => void;
}) {
  const [name, setName] = useState(manufacturer?.name ?? "");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    onSave({ id: manufacturer?.id, name });
  }

  return (
    <Modal
      title={manufacturer ? "Editar fabricante" : "Agregar fabricante"}
      onClose={onClose}
    >
      <form className="compact-form" onSubmit={submit}>
        <label className="field">
          <span>Nombre</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button type="submit" disabled={isSaving}>
          {isSaving ? "Guardando..." : "Guardar fabricante"}
        </button>
      </form>
    </Modal>
  );
}

function ModelModal({
  model,
  manufacturers,
  isSaving,
  error,
  onClose,
  onSave,
}: {
  model?: ModelDraft;
  manufacturers: Manufacturer[];
  isSaving: boolean;
  error?: string;
  onClose: () => void;
  onSave: (payload: ModelDraft) => void;
}) {
  const [manufacturerId, setManufacturerId] = useState(
    model?.manufacturer_id ?? manufacturers[0]?.id ?? "",
  );
  const [name, setName] = useState(model?.name ?? "");
  const [partNumber, setPartNumber] = useState(model?.part_number ?? "");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!manufacturerId || !name.trim()) return;
    onSave({
      id: model?.id,
      manufacturer_id: manufacturerId,
      name,
      part_number: partNumber,
    });
  }

  return (
    <Modal title={model ? "Editar modelo" : "Agregar modelo"} onClose={onClose}>
      <form className="compact-form" onSubmit={submit}>
        <label className="field">
          <span>Fabricante</span>
          <select
            value={manufacturerId}
            onChange={(event) => setManufacturerId(event.target.value)}
          >
            <option value="">Selecciona fabricante</option>
            {manufacturers.map((manufacturer) => (
              <option key={manufacturer.id} value={manufacturer.id}>
                {manufacturer.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Modelo</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Número de parte</span>
          <input
            value={partNumber}
            onChange={(event) => setPartNumber(event.target.value)}
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button type="submit" disabled={isSaving}>
          {isSaving ? "Guardando..." : "Guardar modelo"}
        </button>
      </form>
    </Modal>
  );
}

function AgentModal({
  agent,
  isSaving,
  error,
  onClose,
  onSave,
}: {
  agent?: AgentDraft;
  isSaving: boolean;
  error?: string;
  onClose: () => void;
  onSave: (payload: AgentDraft) => void;
}) {
  const [fullName, setFullName] = useState(agent?.full_name ?? "");
  const [position, setPosition] = useState(agent?.position ?? "");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fullName.trim() || !position.trim()) return;
    onSave({ id: agent?.id, full_name: fullName, position });
  }

  return (
    <Modal title={agent ? "Editar agente" : "Crear agente"} onClose={onClose}>
      <form className="compact-form" onSubmit={submit}>
        <label className="field">
          <span>Nombre completo</span>
          <input
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Puesto</span>
          <input
            value={position}
            onChange={(event) => setPosition(event.target.value)}
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button type="submit" disabled={isSaving}>
          {isSaving ? "Guardando..." : "Guardar agente"}
        </button>
      </form>
    </Modal>
  );
}

function EventTypeModal({
  eventType,
  isSaving,
  error,
  onClose,
  onSave,
}: {
  eventType?: EventDraft;
  isSaving: boolean;
  error?: string;
  onClose: () => void;
  onSave: (payload: EventDraft) => void;
}) {
  const [name, setName] = useState(eventType?.name ?? "");
  const [code, setCode] = useState(eventType?.code ?? "");
  const [category, setCategory] = useState<SupportEventType["event_type"]>(
    eventType?.event_type ?? "note",
  );
  const [supportType, setSupportType] = useState<
    SupportEventType["support_type"]
  >(eventType?.support_type ?? "technical");
  const [description, setDescription] = useState(eventType?.description ?? "");
  const [sortOrder, setSortOrder] = useState(eventType?.sort_order ?? 100);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    onSave({
      id: eventType?.id,
      name,
      code,
      event_type: category,
      support_type: supportType,
      description,
      sort_order: sortOrder,
    });
  }

  return (
    <Modal
      title={eventType ? "Editar estado" : "Agregar estado"}
      onClose={onClose}
    >
      <form className="compact-form" onSubmit={submit}>
        <label className="field">
          <span>Nombre</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Código</span>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Opcional"
          />
        </label>
        <label className="field">
          <span>Tipo interno</span>
          <select
            value={category}
            onChange={(event) =>
              setCategory(event.target.value as typeof category)
            }
          >
            <option value="ticket_created">Creación de ticket</option>
            <option value="remote_support_scheduled">Soporte remoto</option>
            <option value="diagnosis">Diagnóstico</option>
            <option value="repair">Reparación</option>
            <option value="closed">Cierre</option>
            <option value="note">Nota</option>
          </select>
        </label>
        <label className="field">
          <span>Tipo de soporte</span>
          <select
            value={supportType}
            onChange={(event) =>
              setSupportType(event.target.value as typeof supportType)
            }
          >
            <option value="technical">Técnico</option>
            <option value="programming">Programación</option>
          </select>
        </label>
        <label className="field">
          <span>Orden</span>
          <input
            type="number"
            value={sortOrder}
            onChange={(event) => setSortOrder(Number(event.target.value))}
          />
        </label>
        <label className="field">
          <span>Descripción</span>
          <textarea
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button type="submit" disabled={isSaving}>
          {isSaving ? "Guardando..." : "Guardar estado"}
        </button>
      </form>
    </Modal>
  );
}

function Modal({
  title,
  children,
  onClose,
  size,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  size?: "wide";
}) {
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <section
        className={size === "wide" ? "modal-card modal-wide" : "modal-card"}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function RowActions({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="row-actions">
      <button
        className="icon-button"
        type="button"
        onClick={onEdit}
        aria-label="Editar"
      >
        <Edit2 size={16} />
      </button>
      <button
        className="icon-button danger-action"
        type="button"
        onClick={onDelete}
        aria-label="Eliminar"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (signInError) setError(signInError.message);
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <img className="login-logo" src="/tectronic-logo.png" alt="Tectronic" />
        <p className="eyebrow">Administrador</p>
        <h1>Acceso al panel</h1>
        <label>
          Correo
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button type="submit" disabled={loading}>
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
