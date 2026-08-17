import { LogOut } from "lucide-react";

type SidebarUserFooterProps = {
  email?: string | null;
  onSignOut: () => void;
  statusLabel?: string;
};

export function SidebarUserFooter({
  email,
  onSignOut,
  statusLabel = "Sesión activa",
}: SidebarUserFooterProps) {
  const normalizedEmail = (email ?? "").trim();
  const displayEmail = normalizedEmail || "Sin correo";
  const initials = buildInitials(normalizedEmail);

  return (
    <div className="reports-sidebar-user admin-sidebar-user-footer">
      <div className="reports-sidebar-user-avatar">{initials}</div>
      <div>
        <strong>{displayEmail}</strong>
        <small>{statusLabel}</small>
      </div>
      <button
        className="sidebar-logout reports-sidebar-logout admin-sidebar-user-logout"
        type="button"
        onClick={onSignOut}
        aria-label="Salir"
      >
        <LogOut size={16} />
      </button>
    </div>
  );
}

function buildInitials(email: string) {
  const source = email.split("@")[0] || "US";
  return source.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase() || "US";
}
