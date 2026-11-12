type CachedLead = { id: number; creatorId?: number | null; creatorName?: string | null; [key: string]: unknown };
type CreatorRow = { id: number; create_uid?: unknown };

export function missingCrmCreatorIds(leads: CachedLead[]): number[] {
  return leads
    .filter((lead) => (!Number.isInteger(lead.creatorId) || !lead.creatorName?.trim()) &&
      Number.isFinite(lead.id) && lead.id > 0)
    .map((lead) => lead.id);
}

export function mergeCrmCreators(leads: CachedLead[], rows: CreatorRow[]): CachedLead[] {
  const creators = new Map(rows.map((row) => [Number(row.id), row.create_uid]));
  return leads.map((lead) => {
    if (Number.isInteger(lead.creatorId) && lead.creatorName?.trim()) return lead;
    const value = creators.get(lead.id);
    const creatorId = Array.isArray(value) ? Number(value[0]) : Number(value);
    const creatorName = Array.isArray(value) && typeof value[1] === 'string' ? value[1].trim() : '';
    return {
      ...lead,
      creatorId: Number.isFinite(creatorId) && creatorId > 0 ? creatorId : null,
      creatorName: creatorName || null,
    };
  });
}
