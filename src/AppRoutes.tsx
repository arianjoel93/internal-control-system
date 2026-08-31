/* eslint-disable react-refresh/only-export-components */
import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { HomePage } from './features/public/HomePage';

const AdminPage = lazy(() => import('./features/admin/AdminPage').then((module) => ({ default: module.AdminPage })));
const SharedSalesReportPage = lazy(() =>
  import('./features/reports/SharedSalesReportPage').then((module) => ({
    default: module.SharedSalesReportPage,
  })),
);
const PublicFormPage = lazy(() =>
  import('./features/forms/PublicFormPage').then((module) => ({
    default: module.PublicFormPage,
  })),
);

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      {
        path: 'admin',
        element: (
          <Suspense fallback={<div className="page">Cargando panel...</div>}>
            <AdminPage />
          </Suspense>
        ),
      },
    ],
  },
  {
    path: '/reportes/compartido/:token',
    element: (
      <Suspense fallback={<div className="page">Cargando reporte compartido...</div>}>
        <SharedSalesReportPage />
      </Suspense>
    ),
  },
  {
    path: '/formularios/:slug',
    element: (
      <Suspense fallback={<div className="page">Cargando formulario...</div>}>
        <PublicFormPage />
      </Suspense>
    ),
  },
]);
