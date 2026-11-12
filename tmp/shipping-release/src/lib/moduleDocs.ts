export type ModuleDocsKey = 'marketing' | 'reports';

const moduleDocsPaths: Record<ModuleDocsKey, string> = {
  marketing: '/docs/marketing.html',
  reports: '/docs/reportes.html',
};

export function openModuleDocs(moduleKey: ModuleDocsKey) {
  const target = moduleDocsPaths[moduleKey];
  window.open(target, '_blank', 'noopener,noreferrer');
}
