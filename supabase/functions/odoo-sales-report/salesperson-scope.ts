export type OdooUserIdentityRow = {
  id?: unknown;
  active?: unknown;
  company_id?: unknown;
  company_ids?: unknown;
  email?: unknown;
  login?: unknown;
  name?: unknown;
  partner_id?: unknown;
};

export function normalizeOdooEmail(value: unknown) {
  return `${value ?? ''}`.trim().toLowerCase();
}

export function selectExactActiveOdooUsers(
  rows: OdooUserIdentityRow[],
  email: unknown,
) {
  const normalizedEmail = normalizeOdooEmail(email);
  if (!normalizedEmail) return [];

  const uniqueRows = new Map<number, OdooUserIdentityRow>();
  for (const row of rows) {
    const id = Number(row?.id);
    if (!Number.isFinite(id) || id <= 0 || row?.active === false) continue;

    const matchesExactly = [row?.login, row?.email].some(
      (value) => normalizeOdooEmail(value) === normalizedEmail,
    );
    if (matchesExactly && !uniqueRows.has(id)) {
      uniqueRows.set(id, row);
    }
  }

  return [...uniqueRows.values()];
}

export function resolveServerSellerIds({
  requestedSellerIds,
  resolvedSellerId,
  visibilityScope,
}: {
  requestedSellerIds: unknown[];
  resolvedSellerId: number | null;
  visibilityScope: 'all' | 'own';
}) {
  if (visibilityScope === 'own') {
    return resolvedSellerId && Number.isFinite(resolvedSellerId)
      ? [resolvedSellerId]
      : [];
  }

  return [
    ...new Set(
      requestedSellerIds
        .map(Number)
        .filter((value) => Number.isFinite(value) && (value > 0 || value === -1)),
    ),
  ];
}

export function resolveServerCompanyIds({
  requestedCompanyIds,
  resolvedCompanyId,
  visibilityScope,
}: {
  requestedCompanyIds: unknown[];
  resolvedCompanyId: number | null;
  visibilityScope: 'all' | 'own';
}) {
  if (visibilityScope === 'own') {
    return resolvedCompanyId && Number.isFinite(resolvedCompanyId)
      ? [resolvedCompanyId]
      : [];
  }

  return [
    ...new Set(
      requestedCompanyIds
        .map(Number)
        .filter((value) => Number.isFinite(value) && (value > 0 || value === -1)),
    ),
  ];
}

export function shouldUseOwnReportScope(
  role: string,
  permissionScope: unknown,
) {
  if (role === 'owner' || role === 'manager' || role === 'admin') {
    return false;
  }

  return role === 'sales_agent' || permissionScope === 'own';
}
