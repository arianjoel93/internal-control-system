export type ModuleDocsKey = 'calculator' | 'imeba-quoter' | 'marketing' | 'reports';

const moduleDocsPaths: Record<ModuleDocsKey, string> = {
  calculator: '/docs/calculadora.html',
  'imeba-quoter': '/docs/cotizador-imeba.html',
  marketing: '/docs/marketing.html',
  reports: '/docs/reportes.html',
};

export function openModuleDocs(moduleKey: ModuleDocsKey) {
  const target = moduleDocsPaths[moduleKey];
  window.open(target, '_blank', 'noopener,noreferrer');
}
