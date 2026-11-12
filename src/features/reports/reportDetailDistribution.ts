import type { AgentCrmLeadDetail, AgentCustomerLifecycleDetail } from './reportExecutiveModel';

export type CustomerSellerDistribution = {
  name: string;
  newCount: number;
  reactivated: number;
  toReactivate: number;
  lost: number;
  total: number;
};

export function buildCustomerSellerDistribution(details: AgentCustomerLifecycleDetail[]): CustomerSellerDistribution[] {
  const sellers = new Map<string, CustomerSellerDistribution>();
  for (const row of details) {
    const name = row.sellerName || 'Sin vendedor asignado';
    const key = name.trim().toLocaleLowerCase('es-MX');
    const seller = sellers.get(key) ?? { name, newCount: 0, reactivated: 0, toReactivate: 0, lost: 0, total: 0 };
    seller.total += 1;
    if (row.status === 'Nuevo') seller.newCount += 1;
    else if (row.status === 'Reactivado') seller.reactivated += 1;
    else if (row.status === 'A reactivar') seller.toReactivate += 1;
    else seller.lost += 1;
    sellers.set(key, seller);
  }
  return [...sellers.values()].sort((left, right) => right.total - left.total || left.name.localeCompare(right.name, 'es'));
}

export type CrmSellerDistribution = {
  key: string;
  name: string;
  assigned: number;
  attended: number;
  unattended: number;
  attentionRate: number;
};

export function buildCrmSellerDistribution(details: AgentCrmLeadDetail[]): CrmSellerDistribution[] {
  const sellers = new Map<string, { key: string; name: string; assigned: number; attended: number }>();
  for (const lead of details) {
    const name = lead.sellerName || 'Sin vendedor asignado';
    const key = lead.sellerId ? `id:${lead.sellerId}` : `name:${name.trim().toLocaleLowerCase('es-MX')}`;
    const seller = sellers.get(key) ?? { key, name, assigned: 0, attended: 0 };
    seller.assigned += 1;
    if (lead.attended) seller.attended += 1;
    sellers.set(key, seller);
  }
  return [...sellers.values()]
    .map((seller) => ({ ...seller, unattended: seller.assigned - seller.attended, attentionRate: seller.attended / seller.assigned * 100 }))
    .sort((left, right) => right.attentionRate - left.attentionRate || right.assigned - left.assigned || left.name.localeCompare(right.name, 'es'));
}
