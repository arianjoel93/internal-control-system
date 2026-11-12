type OdooCreatorUser = {
  id?: unknown;
  name?: unknown;
  active?: unknown;
};

function normalizeName(value: unknown) {
  return typeof value === 'string'
    ? value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-MX')
    : '';
}

export function selectUniqueOdooCreatorByName(rows: OdooCreatorUser[], profileName: unknown) {
  const expected = normalizeName(profileName);
  if (!expected) return { status: 'not_found' as const, user: null };

  const matches = new Map<number, OdooCreatorUser>();
  rows.forEach((row) => {
    const id = Number(row.id);
    if (row.active === false || !Number.isInteger(id) || id <= 0 || normalizeName(row.name) !== expected) return;
    matches.set(id, row);
  });

  const users = [...matches.values()];
  return {
    status: users.length === 1 ? 'linked' as const : users.length > 1 ? 'ambiguous' as const : 'not_found' as const,
    user: users.length === 1 ? users[0] : null,
  };
}
