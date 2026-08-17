import { supabase } from '../../lib/supabase';
import type {
  InventoryMovement,
  InventoryMovementBatch,
  InventoryMovementBatchWithItems,
  InventoryProduct,
  InventoryStockWithWarehouse,
  InventoryWarehouse,
} from '../../lib/types';
import { getCurrentUserModuleAccess } from './settingsService';

export const inventoryCategories = [
  'Sistemas',
  'USB',
  'Hub USB',
  'Teclados numéricos',
  'Cables',
  'Impresoras',
  'Monitores',
  'Teclados alfanuméricos',
  'Refacciones',
  'Lectores',
  'Soportes de etiquetas',
  'Otro',
] as const;

export const inventoryUnits: Array<InventoryProduct['unit']> = ['pieza', 'metro', 'equipo', 'caja'];

export async function getInventoryProducts(term = '') {
  const access = await getCurrentUserModuleAccess('inventory');
  if (!access.can_access) return [];

  const query = supabase
    .from('inventory_products')
    .select('*')
    .eq('is_active', true)
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  if (access.visibility_scope === 'own' && access.user_id) {
    query.eq('created_by', access.user_id);
  }

  const normalizedTerm = term.trim();
  if (normalizedTerm) {
    const search = `%${normalizedTerm}%`;
    query.or(
      `sku.ilike.${search},barcode.ilike.${search},name.ilike.${search},category.ilike.${search},brand.ilike.${search}`,
    );
  }

  const { data, error } = await query;
  if (error) throw normalizeInventoryError(error);
  return (data ?? []) as InventoryProduct[];
}

export async function getInventoryWarehouses() {
  const access = await getCurrentUserModuleAccess('inventory');
  if (!access.can_access) return [];

  const query = supabase
    .from('inventory_warehouses')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (access.visibility_scope === 'own' && access.user_id) {
    query.eq('created_by', access.user_id);
  }

  const { data, error } = await query;
  if (error) throw normalizeInventoryError(error);
  return (data ?? []) as InventoryWarehouse[];
}

export async function getInventoryStock(productId: string) {
  const { data, error } = await supabase
    .from('inventory_stock')
    .select('*, inventory_warehouses (id, name, code)')
    .eq('product_id', productId)
    .order('updated_at', { ascending: false });

  if (error) throw normalizeInventoryError(error);
  return (data ?? []) as InventoryStockWithWarehouse[];
}

export async function getInventoryMovementBatches(limit = 50) {
  const access = await getCurrentUserModuleAccess('inventory');
  if (!access.can_access) return [];

  const query = supabase
    .from('inventory_movement_batches')
    .select('*, inventory_movements (*, inventory_products (id, name, category, unit, sku, barcode))')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (access.visibility_scope === 'own' && access.user_id) {
    query.eq('created_by', access.user_id);
  }

  const { data, error } = await query;
  if (error) throw normalizeInventoryError(error);
  return (data ?? []) as InventoryMovementBatchWithItems[];
}

export async function getInventoryStockOverview() {
  const access = await getCurrentUserModuleAccess('inventory');
  if (!access.can_access) return [];

  const { data, error } = await supabase
    .from('inventory_stock')
    .select('warehouse_id, quantity, inventory_products (id, name, required_quantity, is_active, created_by)');

  if (error) throw normalizeInventoryError(error);
  const rows = (data ?? []) as InventoryStockOverviewRow[];
  if (access.visibility_scope === 'own' && access.user_id) {
    return rows.filter((row) => row.inventory_products?.created_by === access.user_id);
  }
  return rows;
}

export async function createInventoryProduct(payload: InventoryProductDraft) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('inventory_products')
    .insert({
      ...toProductPayload(payload),
      created_by: user?.id ?? null,
      created_by_email: user?.email ?? null,
    })
    .select()
    .single();

  if (error) throw normalizeInventoryError(error);
  return data as InventoryProduct;
}

export async function updateInventoryProduct(payload: InventoryProductDraft & { id: string }) {
  const { data, error } = await supabase
    .from('inventory_products')
    .update(toProductPayload(payload))
    .eq('id', payload.id)
    .select()
    .single();

  if (error) throw normalizeInventoryError(error);
  return data as InventoryProduct;
}

export async function createInventoryWarehouse(payload: InventoryWarehouseDraft) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('inventory_warehouses')
    .insert({
      name: payload.name.trim(),
      code: normalizeCode(payload.code || payload.name),
      location: payload.location.trim() || null,
      is_active: true,
      created_by: user?.id ?? null,
      created_by_email: user?.email ?? null,
    })
    .select()
    .single();

  if (error) throw normalizeInventoryError(error);
  return data as InventoryWarehouse;
}

export async function updateInventoryWarehouse(payload: InventoryWarehouseDraft & { id: string }) {
  const { data, error } = await supabase
    .from('inventory_warehouses')
    .update({
      name: payload.name.trim(),
      code: normalizeCode(payload.code || payload.name),
      location: payload.location.trim() || null,
    })
    .eq('id', payload.id)
    .select()
    .single();

  if (error) throw normalizeInventoryError(error);
  return data as InventoryWarehouse;
}

export async function deactivateInventoryWarehouse(id: string) {
  const { error } = await supabase.from('inventory_warehouses').update({ is_active: false }).eq('id', id);
  if (error) throw normalizeInventoryError(error);
}

export async function deactivateInventoryProduct(id: string) {
  const { error } = await supabase.from('inventory_products').update({ is_active: false }).eq('id', id);
  if (error) throw normalizeInventoryError(error);
}

export async function deactivateInventoryProducts(ids: string[]) {
  if (ids.length === 0) return;
  const { error } = await supabase.from('inventory_products').update({ is_active: false }).in('id', ids);
  if (error) throw normalizeInventoryError(error);
}

export async function createInventoryMovementBatch(payload: InventoryMovementDraft) {
  await assertInventoryMovementIsAllowed(payload);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: batch, error: batchError } = await supabase
    .from('inventory_movement_batches')
    .insert({
      warehouse_id: payload.movement_type === 'transfer' ? null : payload.warehouse_id || null,
      source_warehouse_id: payload.movement_type === 'transfer' ? payload.source_warehouse_id || null : null,
      destination_warehouse_id: payload.movement_type === 'transfer' ? payload.destination_warehouse_id || null : null,
      movement_type: payload.movement_type,
      reason: payload.reason.trim() || null,
      reference: payload.reference.trim() || null,
      notes: payload.notes.trim() || null,
      created_by: user?.id ?? null,
      created_by_email: user?.email ?? null,
    })
    .select()
    .single();

  if (batchError) throw normalizeInventoryError(batchError);

  const movementRows = payload.items.map((item) => ({
    batch_id: batch.id,
    product_id: item.product_id,
    warehouse_id: payload.movement_type === 'transfer' ? null : payload.warehouse_id || null,
    source_warehouse_id: payload.movement_type === 'transfer' ? payload.source_warehouse_id || null : null,
    destination_warehouse_id: payload.movement_type === 'transfer' ? payload.destination_warehouse_id || null : null,
    movement_type: payload.movement_type,
    quantity: Number(item.quantity),
    reason: payload.reason.trim() || null,
    reference: payload.reference.trim() || null,
    notes: payload.notes.trim() || null,
    created_by: user?.id ?? null,
    created_by_email: user?.email ?? null,
  }));

  const { error: itemsError } = await supabase.from('inventory_movements').insert(movementRows);
  if (itemsError) {
    await supabase.from('inventory_movement_batches').delete().eq('id', batch.id);
    throw normalizeInventoryError(itemsError);
  }

  return batch as InventoryMovementBatch;
}

export async function createInventoryProductsFromTemplate(rows: InventoryTemplateRow[], defaultWarehouseId: string) {
  const createdProducts: InventoryProduct[] = [];

  for (const row of rows) {
    const name = row.name?.trim() ?? '';
    const barcode = row.barcode?.trim() ?? '';
    if (!name || !barcode) continue;

    const product = await createInventoryProduct({
      barcode,
      name,
      category: row.category || 'Otro',
      brand: row.brand ?? '',
      unit: normalizeTemplateUnit(row.unit),
      minimum_stock: row.minimum_stock || '0',
      required_quantity: row.required_quantity || '0',
      notes: row.notes ?? '',
    });
    createdProducts.push(product);

    const initialQuantity = Number(row.initial_quantity || 0);
    if (initialQuantity > 0) {
      await createInventoryMovementBatch({
        warehouse_id: defaultWarehouseId,
        source_warehouse_id: '',
        destination_warehouse_id: '',
        movement_type: 'input',
        items: [{ product_id: product.id, quantity: String(initialQuantity) }],
        reason: 'Carga inicial por plantilla',
        reference: row.reference ?? '',
        notes: row.notes ?? '',
      });
    }
  }

  return createdProducts;
}

function toProductPayload(payload: InventoryProductDraft) {
  const barcode = payload.barcode.trim();
  if (!barcode) {
    throw new Error('Indica el código de barras/SKU del producto.');
  }

  return {
    sku: barcode || null,
    barcode: barcode || null,
    name: payload.name.trim(),
    category: payload.category.trim(),
    brand: payload.brand.trim() || null,
    model: null,
    serial_number: null,
    warehouse_id: null,
    unit: payload.unit,
    condition: 'active' as InventoryProduct['condition'],
    minimum_stock: Number(payload.minimum_stock) || 0,
    required_quantity: Number(payload.required_quantity) || 0,
    notes: payload.notes.trim() || null,
    is_active: true,
  };
}

async function assertInventoryMovementIsAllowed(payload: InventoryMovementDraft) {
  const { count: warehouseCount, error: warehouseError } = await supabase
    .from('inventory_warehouses')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true);

  if (warehouseError) throw warehouseError;
  if (!warehouseCount) {
    throw new Error('Crea al menos un almacén antes de registrar movimientos.');
  }

  const { count: productCount, error: productError } = await supabase
    .from('inventory_products')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true);

  if (productError) throw productError;
  if (!productCount) {
    throw new Error('Registra al menos un producto antes de agregar stock a un almacén.');
  }

  if (payload.items.length === 0) {
    throw new Error('Agrega al menos un producto al movimiento.');
  }

  for (const item of payload.items) {
    if (!item.product_id) {
      throw new Error('Selecciona un producto para registrar el movimiento.');
    }
    if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) {
      throw new Error('Todas las cantidades del movimiento deben ser mayores a cero.');
    }
  }

  if (payload.movement_type === 'transfer') {
    if (!payload.source_warehouse_id || !payload.destination_warehouse_id) {
      throw new Error('Selecciona almacén de origen y almacén de destino.');
    }
    if (payload.source_warehouse_id === payload.destination_warehouse_id) {
      throw new Error('El almacén de origen y destino deben ser diferentes.');
    }
    return;
  }

  if (!payload.warehouse_id) {
    throw new Error('Selecciona un almacén para registrar el movimiento.');
  }
}

export function parseInventoryCsvTemplate(csvText: string) {
  const [headerLine, ...lines] = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (!headerLine) return [];

  const headers = splitCsvLine(headerLine).map((header) => normalizeHeader(header));
  return lines.map((line) => {
    const values = splitCsvLine(line);
    return headers.reduce<InventoryTemplateRow>((row, header, index) => {
      return { ...row, [header]: values[index]?.trim() ?? '' };
    }, {});
  });
}

export function buildInventoryTemplateCsv() {
  return [
    'barcode,name,category,brand,unit,minimum_stock,required_quantity,initial_quantity,reference,notes',
    'CBL-USB-001,Cable USB,Cables,,metro,5,20,10,COMPRA-001,Carga inicial',
    'IMP-RIB-001,Impresora térmica,Impresoras,Ribetec,equipo,1,1,1,COMPRA-001,Equipo activo',
  ].join('\n');
}

function splitCsvLine(line: string) {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }
    current += char;
  }

  values.push(current);
  return values;
}

function normalizeHeader(header: string) {
  return header
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]+/g, '_') as keyof InventoryTemplateRow;
}

function normalizeTemplateUnit(value: string | undefined): InventoryProduct['unit'] {
  const normalized = value?.trim().toLowerCase();
  return inventoryUnits.includes(normalized as InventoryProduct['unit']) ? (normalized as InventoryProduct['unit']) : 'pieza';
}

function normalizeInventoryError(error: { message?: string }) {
  const message = error.message ?? '';

  if (message.includes('Could not find the table') || message.includes('schema cache')) {
    return new Error(
      'Faltan las tablas de inventario en Supabase. Ejecuta el archivo supabase/manual_apply_inventory_module.sql en el SQL Editor del proyecto soporte_tectronic y vuelve a intentar.',
    );
  }

  return error;
}

function normalizeCode(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export type InventoryProductDraft = {
  barcode: string;
  name: string;
  category: string;
  brand: string;
  unit: InventoryProduct['unit'];
  minimum_stock: string;
  required_quantity: string;
  notes: string;
};

export type InventoryMovementItemDraft = {
  product_id: string;
  quantity: string;
  product?: InventoryProduct;
};

export type InventoryMovementDraft = {
  warehouse_id: string;
  source_warehouse_id: string;
  destination_warehouse_id: string;
  movement_type: InventoryMovement['movement_type'];
  items: InventoryMovementItemDraft[];
  reason: string;
  reference: string;
  notes: string;
};

export type InventoryWarehouseDraft = {
  name: string;
  code: string;
  location: string;
};

export type InventoryTemplateRow = Partial<{
  barcode: string;
  name: string;
  category: string;
  brand: string;
  unit: InventoryProduct['unit'];
  minimum_stock: string;
  required_quantity: string;
  initial_quantity: string;
  reference: string;
  notes: string;
}>;

export type InventoryStockOverviewRow = {
  warehouse_id: string;
  quantity: number;
  inventory_products?: Pick<InventoryProduct, 'id' | 'name' | 'required_quantity' | 'is_active' | 'created_by'> | null;
};
