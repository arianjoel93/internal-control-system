import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

export type SalesForecastMonthlyPoint = {
  month: string;
  label: string;
  amount: number;
  invoiceCount: number;
};

export type SalesForecastDimensionPoint = {
  id: number | null;
  label: string;
  amount: number;
  invoiceCount: number;
  sharePct: number;
};

export type SalesForecastDataset = {
  fetchedAt: string;
  companyId: number | null;
  companyName: string;
  currentYear: number;
  currentDate: string;
  historicalStartDate: string;
  historicalEndDate: string;
  visibilityScope: 'all' | 'own';
  sellerName: string | null;
  monthly: SalesForecastMonthlyPoint[];
  currentYearSellers: SalesForecastDimensionPoint[];
  currentYearCategories: SalesForecastDimensionPoint[];
  currentYearCustomers: SalesForecastDimensionPoint[];
  warnings: string[];
};

export async function getSalesForecastDataset() {
  const { data, error } = await supabase.functions.invoke('odoo-sales-forecast', {
    body: {
      companyName: 'Corporación Tectronic',
    },
  });

  if (error) {
    const detailedMessage = await readFunctionErrorMessage(error);
    throw new Error(
      detailedMessage || error.message || 'No se pudo consultar el pronóstico comercial de Odoo.',
    );
  }

  if (data?.error) {
    throw new Error(String(data.error));
  }

  return data as SalesForecastDataset;
}

async function readFunctionErrorMessage(error: unknown) {
  if (error instanceof FunctionsHttpError) {
    const response = error.context;
    if (response instanceof Response) {
      try {
        const payload = (await response.clone().json()) as {
          error?: string;
          message?: string;
        };
        return payload.error || payload.message || error.message;
      } catch {
        return error.message;
      }
    }
  }

  return error instanceof Error ? error.message : null;
}
