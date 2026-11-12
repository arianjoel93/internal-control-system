import { type FormEvent, type ReactNode, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Boxes,
  Download,
  Edit2,
  Grid2X2,
  LayoutDashboard,
  List,
  PackageCheck,
  PackagePlus,
  Plus,
  ScanLine,
  Search,
  Trash2,
  Upload,
  Warehouse,
  X,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { EmptyState } from '../../components/EmptyState';
import { formatDate, formatTime } from '../../lib/dates';
import { supabase } from '../../lib/supabase';
import { SidebarUserFooter } from './SidebarUserFooter';
import type { InventoryMovement, InventoryMovementBatchWithItems, InventoryProduct, InventoryWarehouse } from '../../lib/types';
import {
  buildInventoryTemplateCsv,
  createInventoryMovementBatch,
  createInventoryProduct,
  createInventoryProductsFromTemplate,
  createInventoryWarehouse,
  deactivateInventoryProduct,
  deactivateInventoryProducts,
  deactivateInventoryWarehouse,
  getInventoryMovementBatches,
  getInventoryProducts,
  getInventoryStockOverview,
  getInventoryWarehouses,
  inventoryCategories,
  inventoryUnits,
  parseInventoryCsvTemplate,
  updateInventoryProduct,
  updateInventoryWarehouse,
  type InventoryMovementDraft,
  type InventoryProductDraft,
  type InventoryStockOverviewRow,
  type InventoryWarehouseDraft,
} from './inventoryService';

type InventorySection = 'dashboard' | 'products' | 'movements' | 'warehouses';
type ProductModalState = InventoryProduct | 'new' | null;
type WarehouseModalState = InventoryWarehouse | 'new' | null;
type ProductViewMode = 'cards' | 'list';
type InventoryWarehouseSummary = InventoryWarehouse & {
  current_quantity: number;
  required_quantity: number;
  product_count: number;
};
type MovementLineItem = {
  product_id: string;
  product: InventoryProduct;
  quantity: string;
};

type InventoryDashboardProps = {
  session: Session;
  onOpenHub: () => void;
};

const inventorySections: Array<{ id: InventorySection; label: string; icon: ReactNode }> = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { id: 'products', label: 'Productos', icon: <Boxes size={18} /> },
  { id: 'movements', label: 'Movimientos', icon: <ScanLine size={18} /> },
  { id: 'warehouses', label: 'Almacenes', icon: <Warehouse size={18} /> },
];

const defaultProductDraft: InventoryProductDraft = {
  barcode: '',
  name: '',
  category: 'Sistemas',
  brand: '',
  unit: 'pieza',
  minimum_stock: '0',
  required_quantity: '0',
  notes: '',
};

const emptyProducts: InventoryProduct[] = [];
const emptyWarehouses: InventoryWarehouse[] = [];
const emptyMovements: InventoryMovementBatchWithItems[] = [];
const emptyStockOverview: InventoryStockOverviewRow[] = [];

export function InventoryDashboard({ session, onOpenHub }: InventoryDashboardProps) {
  const [activeSection, setActiveSection] = useState<InventorySection>('dashboard');
  const [search, setSearch] = useState('');
  const [productViewMode, setProductViewMode] = useState<ProductViewMode>('cards');
  const [productModal, setProductModal] = useState<ProductModalState>(null);
  const [warehouseModal, setWarehouseModal] = useState<WarehouseModalState>(null);
  const [movementModal, setMovementModal] = useState<InventoryMovement['movement_type'] | null>(null);
  const [movementDetail, setMovementDetail] = useState<InventoryMovementBatchWithItems | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const productsQuery = useQuery({
    queryKey: ['inventory-products', search],
    queryFn: () => getInventoryProducts(search),
  });
  const allProductsQuery = useQuery({
    queryKey: ['inventory-products', ''],
    queryFn: () => getInventoryProducts(''),
  });
  const warehousesQuery = useQuery({
    queryKey: ['inventory-warehouses'],
    queryFn: getInventoryWarehouses,
  });
  const stockOverviewQuery = useQuery({
    queryKey: ['inventory-stock-overview'],
    queryFn: getInventoryStockOverview,
  });
  const movementsQuery = useQuery({
    queryKey: ['inventory-movements'],
    queryFn: () => getInventoryMovementBatches(80),
  });

  const products = productsQuery.data ?? emptyProducts;
  const allProducts = allProductsQuery.data ?? emptyProducts;
  const warehouses = warehousesQuery.data ?? emptyWarehouses;
  const stockOverview = stockOverviewQuery.data ?? emptyStockOverview;
  const movements = movementsQuery.data ?? emptyMovements;
  const warehouseSummaries = useMemo(
    () => buildWarehouseSummaries(warehouses, stockOverview),
    [warehouses, stockOverview],
  );
  const stats = useMemo(() => buildInventoryStats(allProducts, movements.length), [allProducts, movements.length]);
  const movementLockMessage = getMovementLockMessage(allProducts, warehouses);

  const saveProductMutation = useMutation({
    mutationFn: (payload: InventoryProductDraft & { id?: string }) =>
      payload.id ? updateInventoryProduct({ ...payload, id: payload.id }) : createInventoryProduct(payload),
    onSuccess: () => {
      invalidateInventory(queryClient);
      setProductModal(null);
    },
  });

  const importProductsMutation = useMutation({
    mutationFn: (rows: ReturnType<typeof parseInventoryCsvTemplate>) =>
      createInventoryProductsFromTemplate(rows, warehouses[0]?.id ?? ''),
    onSuccess: () => {
      invalidateInventory(queryClient);
      setImportModalOpen(false);
    },
  });

  const deleteProductMutation = useMutation({
    mutationFn: deactivateInventoryProduct,
    onSuccess: () => invalidateInventory(queryClient),
  });
  const deleteProductsMutation = useMutation({
    mutationFn: deactivateInventoryProducts,
    onSuccess: () => invalidateInventory(queryClient),
  });

  const saveWarehouseMutation = useMutation({
    mutationFn: (payload: InventoryWarehouseDraft & { id?: string }) =>
      payload.id ? updateInventoryWarehouse({ ...payload, id: payload.id }) : createInventoryWarehouse(payload),
    onSuccess: () => {
      invalidateInventory(queryClient);
      setWarehouseModal(null);
    },
  });

  const deleteWarehouseMutation = useMutation({
    mutationFn: deactivateInventoryWarehouse,
    onSuccess: () => invalidateInventory(queryClient),
  });

  const movementMutation = useMutation({
    mutationFn: createInventoryMovementBatch,
    onSuccess: () => {
      invalidateInventory(queryClient);
      setMovementModal(null);
    },
  });

  function requestDeleteProduct(product: InventoryProduct) {
    const ok = window.confirm(`Desactivar producto "${product.name}"?`);
    if (ok) deleteProductMutation.mutate(product.id);
  }

  function requestDeleteProducts(productsToDelete: InventoryProduct[]) {
    if (productsToDelete.length === 0) return;
    const ok = window.confirm(`Desactivar ${productsToDelete.length} productos seleccionados?`);
    if (ok) deleteProductsMutation.mutate(productsToDelete.map((product) => product.id));
  }

  function requestDeleteWarehouse(warehouse: InventoryWarehouse) {
    const ok = window.confirm(`Desactivar almacén "${warehouse.name}"?`);
    if (ok) deleteWarehouseMutation.mutate(warehouse.id);
  }

  function openMovement(type: InventoryMovement['movement_type']) {
    if (movementLockMessage) {
      window.alert(movementLockMessage);
      return;
    }
    if (type === 'transfer' && warehouses.length < 2) {
      window.alert('Para transferir entre almacenes necesitas al menos dos almacenes activos.');
      return;
    }
    setMovementModal(type);
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div>
          <button type="button" className="admin-module-back" onClick={onOpenHub}>
            <i className="bi bi-arrow-left"></i>
            <span className="admin-module-back-label">Inventarios</span>
          </button>
        </div>
        <nav className="admin-nav" aria-label="Secciones de inventario">
          {inventorySections.map((section) => (
            <button
              key={section.id}
              className={activeSection === section.id ? 'active' : undefined}
              type="button"
              onClick={() => setActiveSection(section.id)}
            >
              {section.icon}
              {section.label}
            </button>
          ))}
        </nav>
        <SidebarUserFooter
          email={session.user.email}
          statusLabel="Sesión activa"
          onSignOut={() => {
            void supabase.auth.signOut();
          }}
        />
      </aside>

      <main className="admin-workspace">
        {activeSection === 'dashboard' ? (
          <InventoryDashboardSection
            stats={stats}
            onAddProduct={() => setProductModal('new')}
            onOpenMovement={openMovement}
          />
        ) : null}

        {activeSection === 'products' ? (
          <ProductsSection
            products={products}
            search={search}
            setSearch={setSearch}
            viewMode={productViewMode}
            setViewMode={setProductViewMode}
            isLoading={productsQuery.isLoading}
            onAdd={() => setProductModal('new')}
            onImport={() => setImportModalOpen(true)}
            onEdit={setProductModal}
            onDelete={requestDeleteProduct}
            onDeleteMany={requestDeleteProducts}
            isDeletingMany={deleteProductsMutation.isPending}
          />
        ) : null}

        {activeSection === 'movements' ? (
          <MovementsSection
            warehouses={warehouses}
            movements={movements}
            movementLockMessage={movementLockMessage}
            isLoading={movementsQuery.isLoading}
            isSaving={movementMutation.isPending}
            error={movementMutation.error?.message}
            onOpenMovement={openMovement}
            onOpenDetail={setMovementDetail}
          />
        ) : null}

        {activeSection === 'warehouses' ? (
          <WarehousesSection
            warehouseSummaries={warehouseSummaries}
            products={allProducts}
            isLoading={warehousesQuery.isLoading || stockOverviewQuery.isLoading}
            onAdd={() => setWarehouseModal('new')}
            onEdit={setWarehouseModal}
            onDelete={requestDeleteWarehouse}
            onTransfer={() => openMovement('transfer')}
          />
        ) : null}
      </main>

      {productModal ? (
        <InventoryModal
          title={productModal === 'new' ? 'Agregar producto' : 'Editar producto'}
          onClose={() => setProductModal(null)}
        >
          <InventoryProductForm
            product={productModal === 'new' ? undefined : productModal}
            isSaving={saveProductMutation.isPending}
            error={saveProductMutation.error?.message}
            onSave={(payload) =>
              saveProductMutation.mutate(productModal === 'new' ? payload : { ...payload, id: productModal.id })
            }
          />
        </InventoryModal>
      ) : null}

      {movementModal ? (
        <InventoryModal title={movementTitle(movementModal)} onClose={() => setMovementModal(null)}>
          <InventoryMovementForm
            products={allProducts}
            warehouses={warehouses}
            movementType={movementModal}
            isSaving={movementMutation.isPending}
            error={movementMutation.error?.message}
            onSave={(payload) => movementMutation.mutate(payload)}
          />
        </InventoryModal>
      ) : null}

      {movementDetail ? (
        <InventoryModal title="Detalle del movimiento" onClose={() => setMovementDetail(null)}>
          <MovementDetail movement={movementDetail} warehouses={warehouses} />
        </InventoryModal>
      ) : null}

      {warehouseModal ? (
        <InventoryModal
          title={warehouseModal === 'new' ? 'Agregar almacén' : 'Editar almacén'}
          onClose={() => setWarehouseModal(null)}
        >
          <WarehouseForm
            warehouse={warehouseModal === 'new' ? undefined : warehouseModal}
            isSaving={saveWarehouseMutation.isPending}
            error={saveWarehouseMutation.error?.message}
            onSave={(payload) =>
              saveWarehouseMutation.mutate(warehouseModal === 'new' ? payload : { ...payload, id: warehouseModal.id })
            }
          />
        </InventoryModal>
      ) : null}

      {importModalOpen ? (
        <InventoryModal title="Cargar productos por plantilla" onClose={() => setImportModalOpen(false)}>
          <InventoryImportForm
            warehouses={warehouses}
            isSaving={importProductsMutation.isPending}
            error={importProductsMutation.error?.message}
            onImport={(rows) => importProductsMutation.mutate(rows)}
          />
        </InventoryModal>
      ) : null}
    </div>
  );
}

function InventoryDashboardSection({
  stats,
  onAddProduct,
  onOpenMovement,
}: {
  stats: ReturnType<typeof buildInventoryStats>;
  onAddProduct: () => void;
  onOpenMovement: (type: InventoryMovement['movement_type']) => void;
}) {
  return (
    <section className="admin-section">
      <div className="admin-section-head">
        <div>
          <p className="eyebrow">Almacén</p>
          <h2>Dashboard de inventario</h2>
        </div>
        <div className="header-actions">
          <button type="button" onClick={() => onOpenMovement('input')}>
            <ArrowDownToLine size={18} />
            Entrada
          </button>
          <button type="button" onClick={() => onOpenMovement('output')}>
            <ArrowUpFromLine size={18} />
            Salida
          </button>
          <button type="button" onClick={onAddProduct}>
            <PackagePlus size={18} />
            Agregar producto
          </button>
        </div>
      </div>

      <div className="inventory-stats">
        <InventoryStat icon={<Boxes />} label="KPI Activos" value={String(stats.products)} />
        <InventoryStat icon={<PackageCheck />} label="Existencias" value={formatQuantity(stats.totalStock)} />
        <InventoryStat icon={<ArrowDownToLine />} label="Movimientos" value={String(stats.movements)} />
        <InventoryStat icon={<AlertTriangle />} label="Alertas de stock" value={String(stats.lowStock)} />
      </div>

    </section>
  );
}

function ProductsSection({
  products,
  search,
  setSearch,
  viewMode,
  setViewMode,
  isLoading,
  onAdd,
  onImport,
  onEdit,
  onDelete,
  onDeleteMany,
  isDeletingMany,
}: {
  products: InventoryProduct[];
  search: string;
  setSearch: (value: string) => void;
  viewMode: ProductViewMode;
  setViewMode: (mode: ProductViewMode) => void;
  isLoading: boolean;
  onAdd: () => void;
  onImport: () => void;
  onEdit: (product: InventoryProduct) => void;
  onDelete: (product: InventoryProduct) => void;
  onDeleteMany: (products: InventoryProduct[]) => void;
  isDeletingMany: boolean;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedProducts = products.filter((product) => selectedIds.includes(product.id));
  const allVisibleSelected = products.length > 0 && products.every((product) => selectedIds.includes(product.id));

  function toggleProduct(productId: string) {
    setSelectedIds((current) =>
      current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId],
    );
  }

  function toggleVisibleProducts() {
    if (allVisibleSelected) {
      setSelectedIds((current) => current.filter((id) => !products.some((product) => product.id === id)));
      return;
    }

    setSelectedIds((current) => Array.from(new Set([...current, ...products.map((product) => product.id)])));
  }

  function exportSelected() {
    exportProductsCsv(selectedProducts.length > 0 ? selectedProducts : products);
  }

  return (
    <section className="admin-section">
      <div className="admin-section-head">
        <div>
          <p className="eyebrow">Catálogo</p>
          <h2>Productos</h2>
        </div>
        <div className="header-actions">
          <button type="button" className="secondary-button" onClick={onImport}>
            <Upload size={18} />
            Cargar plantilla
          </button>
          <button type="button" onClick={onAdd}>
            <Plus size={18} />
            Agregar producto
          </button>
        </div>
      </div>

      <article className="panel">
        <div className="table-toolbar">
          <label className="inline-search">
            <Search size={18} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por producto, categoría, código de barras o marca"
            />
          </label>
          <div className="segmented-control" aria-label="Vista de productos">
            <button type="button" className={viewMode === 'cards' ? 'active' : undefined} onClick={() => setViewMode('cards')}>
              <Grid2X2 size={16} />
              Contenedor
            </button>
            <button type="button" className={viewMode === 'list' ? 'active' : undefined} onClick={() => setViewMode('list')}>
              <List size={16} />
              Lista
            </button>
          </div>
          <span>{products.length} productos</span>
        </div>
        {viewMode === 'cards' ? (
          <ProductCards products={products} isLoading={isLoading} onEdit={onEdit} onDelete={onDelete} />
        ) : (
          <>
            <div className="selection-toolbar">
              <span>{selectedProducts.length} seleccionados</span>
              <button type="button" className="secondary-button" onClick={exportSelected}>
                <Download size={16} />
                Exportar
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={() => onDeleteMany(selectedProducts)}
                disabled={selectedProducts.length === 0 || isDeletingMany}
              >
                <Trash2 size={16} />
                {isDeletingMany ? 'Eliminando...' : 'Borrar seleccionados'}
              </button>
            </div>
            <InventoryProductsTable
              products={products}
              isLoading={isLoading}
              onEdit={onEdit}
              onDelete={onDelete}
              selectedIds={selectedIds}
              allSelected={allVisibleSelected}
              onToggle={toggleProduct}
              onToggleAll={toggleVisibleProducts}
            />
          </>
        )}
      </article>
    </section>
  );
}

function MovementsSection({
  warehouses,
  movements,
  movementLockMessage,
  isLoading,
  isSaving,
  error,
  onOpenMovement,
  onOpenDetail,
}: {
  warehouses: InventoryWarehouse[];
  movements: InventoryMovementBatchWithItems[];
  movementLockMessage: string;
  isLoading: boolean;
  isSaving: boolean;
  error?: string;
  onOpenMovement: (type: InventoryMovement['movement_type']) => void;
  onOpenDetail: (movement: InventoryMovementBatchWithItems) => void;
}) {
  return (
    <section className="admin-section">
      <div className="admin-section-head">
        <div>
          <p className="eyebrow">Operación</p>
          <h2>Movimientos</h2>
        </div>
        <div className="header-actions">
          <button type="button" onClick={() => onOpenMovement('input')} disabled={Boolean(movementLockMessage)}>
            <ArrowDownToLine size={18} />
            Entrada manual
          </button>
          <button type="button" onClick={() => onOpenMovement('output')} disabled={Boolean(movementLockMessage)}>
            <ArrowUpFromLine size={18} />
            Salida manual
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => onOpenMovement('adjustment')}
            disabled={Boolean(movementLockMessage)}
          >
            <PackageCheck size={18} />
            Ajuste
          </button>
        </div>
      </div>

      <MovementCapturePanel
        movementLockMessage={movementLockMessage}
        isSaving={isSaving}
        error={error}
        onOpenMovement={onOpenMovement}
      />

      <article className="panel">
        <div className="panel-header">
          <h2>Movimientos recientes</h2>
          <span>{movements.length} registros</span>
        </div>
        <InventoryMovementBatchesTable movements={movements} isLoading={isLoading} warehouses={warehouses} onOpenDetail={onOpenDetail} />
      </article>
    </section>
  );
}

function WarehousesSection({
  warehouseSummaries,
  products,
  isLoading,
  onAdd,
  onEdit,
  onDelete,
  onTransfer,
}: {
  warehouseSummaries: InventoryWarehouseSummary[];
  products: InventoryProduct[];
  isLoading: boolean;
  onAdd: () => void;
  onEdit: (warehouse: InventoryWarehouse) => void;
  onDelete: (warehouse: InventoryWarehouse) => void;
  onTransfer: () => void;
}) {
  const warehouses = warehouseSummaries;

  return (
    <section className="admin-section">
      <div className="admin-section-head">
        <div>
          <p className="eyebrow">Ubicaciones</p>
          <h2>Almacenes</h2>
        </div>
        <div className="header-actions">
          <button type="button" className="secondary-button" onClick={onTransfer} disabled={warehouses.length < 2 || products.length === 0}>
            <ArrowLeftRight size={18} />
            Transferencia
          </button>
          <button type="button" onClick={onAdd}>
            <Plus size={18} />
            Agregar almacén
          </button>
        </div>
      </div>

      <article className="panel">
        <div className="table-toolbar">
          <span>{warehouses.length} almacenes activos</span>
          <span>{products.length} productos administrados</span>
        </div>
        <WarehouseCards warehouses={warehouses} isLoading={isLoading} onEdit={onEdit} onDelete={onDelete} />
      </article>
    </section>
  );
}

function MovementCapturePanel({
  movementLockMessage,
  isSaving,
  error,
  onOpenMovement,
}: {
  movementLockMessage: string;
  isSaving: boolean;
  error?: string;
  onOpenMovement: (type: InventoryMovement['movement_type']) => void;
}) {
  return (
    <article className="panel scanner-panel">
      <div className="panel-header">
        <div>
          <h2>Captura por lote</h2>
          <span>Escanea o agrega varios productos y guarda todo como un solo movimiento.</span>
        </div>
        <ScanLine size={22} />
      </div>
      <div className="movement-start-actions">
        <button type="button" onClick={() => onOpenMovement('input')} disabled={Boolean(movementLockMessage) || isSaving}>
          <ArrowDownToLine size={18} />
          Nueva entrada
        </button>
        <button type="button" onClick={() => onOpenMovement('output')} disabled={Boolean(movementLockMessage) || isSaving}>
          <ArrowUpFromLine size={18} />
          Nueva salida
        </button>
        <button type="button" className="secondary-button" onClick={() => onOpenMovement('adjustment')} disabled={Boolean(movementLockMessage) || isSaving}>
          <PackageCheck size={18} />
          Nuevo ajuste
        </button>
      </div>
      {movementLockMessage ? <p className="form-error">{movementLockMessage}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
    </article>
  );
}

function ProductCards({
  products,
  isLoading,
  onEdit,
  onDelete,
}: {
  products: InventoryProduct[];
  isLoading: boolean;
  onEdit: (product: InventoryProduct) => void;
  onDelete: (product: InventoryProduct) => void;
}) {
  if (isLoading) {
    return <EmptyState title="Cargando">Consultando productos...</EmptyState>;
  }

  if (products.length === 0) {
    return <EmptyState title="Sin productos">Agrega productos uno a uno o desde una plantilla.</EmptyState>;
  }

  return (
    <div className="inventory-card-grid">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

function ProductCard({
  product,
  onEdit,
  onDelete,
  readonly,
}: {
  product: InventoryProduct;
  onEdit: (product: InventoryProduct) => void;
  onDelete: (product: InventoryProduct) => void;
  readonly?: boolean;
}) {
  return (
    <article className="inventory-product-card">
      <div>
        <span className="inventory-category">{product.category}</span>
        <h3>{product.name}</h3>
        <p>{product.brand ?? 'Sin marca'}</p>
      </div>
      <dl>
        <div>
          <dt>Existencia</dt>
          <dd className={isLowStock(product) ? 'stock-warning' : undefined}>
            {formatQuantity(product.quantity)} {product.unit}
          </dd>
        </div>
        <div>
          <dt>Código</dt>
          <dd>{product.barcode ?? product.sku ?? '-'}</dd>
        </div>
        <div>
          <dt>Cantidad necesaria</dt>
          <dd>{formatQuantity(product.required_quantity)}</dd>
        </div>
      </dl>
      {!readonly ? (
        <div className="row-actions">
          <button className="icon-button" type="button" onClick={() => onEdit(product)} aria-label="Editar">
            <Edit2 size={16} />
          </button>
          <button className="icon-button danger-action" type="button" onClick={() => onDelete(product)} aria-label="Desactivar">
            <Trash2 size={16} />
          </button>
        </div>
      ) : null}
    </article>
  );
}

function InventoryProductsTable({
  products,
  isLoading,
  onEdit,
  onDelete,
  compact,
  selectedIds = [],
  allSelected,
  onToggle,
  onToggleAll,
}: {
  products: InventoryProduct[];
  isLoading: boolean;
  onEdit: (product: InventoryProduct) => void;
  onDelete: (product: InventoryProduct) => void;
  compact?: boolean;
  selectedIds?: string[];
  allSelected?: boolean;
  onToggle?: (productId: string) => void;
  onToggleAll?: () => void;
}) {
  const selectable = Boolean(onToggle && onToggleAll && !compact);

  if (isLoading) {
    return <EmptyState title="Cargando">Consultando inventario...</EmptyState>;
  }

  if (products.length === 0) {
    return <EmptyState title="Sin productos">Agrega el primer producto para controlar entradas y salidas.</EmptyState>;
  }

  return (
    <div className="table-wrap">
      <table className="records-table inventory-table">
        <thead>
          <tr>
            {selectable ? (
              <th className="select-column">
                <input type="checkbox" checked={Boolean(allSelected)} onChange={onToggleAll} aria-label="Seleccionar productos visibles" />
              </th>
            ) : null}
            <th>Producto</th>
            <th>Categoría</th>
            <th>Código</th>
            <th>Marca</th>
            <th>Existencia</th>
            <th>Necesaria</th>
            {!compact ? <th>Acciones</th> : null}
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id}>
              {selectable ? (
                <td className="select-column">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(product.id)}
                    onChange={() => onToggle?.(product.id)}
                    aria-label={`Seleccionar ${product.name}`}
                  />
                </td>
              ) : null}
              <td>
                <strong>{product.name}</strong>
                {Number(product.minimum_stock) > 0 ? <small>Mínimo: {formatQuantity(product.minimum_stock)}</small> : null}
              </td>
              <td>{product.category}</td>
              <td>{product.barcode ?? product.sku ?? '-'}</td>
              <td>{product.brand ?? '-'}</td>
              <td>
                <span className={isLowStock(product) ? 'stock-warning' : undefined}>
                  {formatQuantity(product.quantity)} {product.unit}
                </span>
              </td>
              <td>{formatQuantity(product.required_quantity)}</td>
              {!compact ? (
                <td>
                  <div className="row-actions">
                    <button className="icon-button" type="button" onClick={() => onEdit(product)} aria-label="Editar">
                      <Edit2 size={16} />
                    </button>
                    <button className="icon-button danger-action" type="button" onClick={() => onDelete(product)} aria-label="Desactivar">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InventoryMovementBatchesTable({
  movements,
  isLoading,
  warehouses,
  onOpenDetail,
}: {
  movements: InventoryMovementBatchWithItems[];
  isLoading: boolean;
  warehouses: InventoryWarehouse[];
  onOpenDetail: (movement: InventoryMovementBatchWithItems) => void;
}) {
  if (isLoading) {
    return <EmptyState title="Cargando">Consultando movimientos...</EmptyState>;
  }

  if (movements.length === 0) {
    return <EmptyState title="Sin movimientos">Las entradas, salidas y transferencias aparecerán aquí.</EmptyState>;
  }

  return (
    <div className="table-wrap">
      <table className="records-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Tipo</th>
            <th>Productos</th>
            <th>Total</th>
            <th>Almacén</th>
            <th>Motivo</th>
            <th>Usuario</th>
          </tr>
        </thead>
        <tbody>
          {movements.map((movement) => (
            <tr key={movement.id} className="clickable-row" onClick={() => onOpenDetail(movement)}>
              <td>
                {formatDate(movement.created_at)}
                <small>{formatTime(movement.created_at)}</small>
              </td>
              <td>
                <span className={`movement-chip ${movement.movement_type}`}>{movementLabel(movement.movement_type)}</span>
              </td>
              <td>{movement.item_count} productos</td>
              <td>{formatQuantity(movement.total_quantity)}</td>
              <td>{movementWarehouseLabel(movement, warehouses)}</td>
              <td>{movement.reason ?? movement.reference ?? '-'}</td>
              <td>{movement.created_by_email ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MovementDetail({
  movement,
  warehouses,
}: {
  movement: InventoryMovementBatchWithItems;
  warehouses: InventoryWarehouse[];
}) {
  const items = movement.inventory_movements ?? [];

  return (
    <div className="movement-detail">
      <div className="detail-grid">
        <div>
          <span>Tipo</span>
          <strong>{movementLabel(movement.movement_type)}</strong>
        </div>
        <div>
          <span>Almacén</span>
          <strong>{movementWarehouseLabel(movement, warehouses)}</strong>
        </div>
        <div>
          <span>Fecha</span>
          <strong>{formatDate(movement.created_at)} {formatTime(movement.created_at)}</strong>
        </div>
        <div>
          <span>Total</span>
          <strong>{formatQuantity(movement.total_quantity)}</strong>
        </div>
      </div>
      <div className="table-wrap">
        <table className="records-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Código</th>
              <th>Cantidad</th>
              <th>Antes</th>
              <th>Después</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.inventory_products?.name ?? 'Producto eliminado'}</strong>
                  <small>{item.inventory_products?.category ?? '-'}</small>
                </td>
                <td>{item.inventory_products?.barcode ?? item.inventory_products?.sku ?? '-'}</td>
                <td>{formatQuantity(item.quantity)} {item.inventory_products?.unit ?? ''}</td>
                <td>{item.previous_quantity === null ? '-' : formatQuantity(item.previous_quantity)}</td>
                <td>{item.next_quantity === null ? '-' : formatQuantity(item.next_quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {movement.notes ? <p className="muted-text">{movement.notes}</p> : null}
    </div>
  );
}

function WarehouseCards({
  warehouses,
  isLoading,
  onEdit,
  onDelete,
}: {
  warehouses: InventoryWarehouseSummary[];
  isLoading: boolean;
  onEdit: (warehouse: InventoryWarehouse) => void;
  onDelete: (warehouse: InventoryWarehouse) => void;
}) {
  if (isLoading) {
    return <EmptyState title="Cargando">Consultando almacenes...</EmptyState>;
  }

  if (warehouses.length === 0) {
    return <EmptyState title="Sin almacenes">Crea al menos un almacén para registrar movimientos.</EmptyState>;
  }

  return (
    <div className="warehouse-card-grid">
      {warehouses.map((warehouse) => {
        const progress =
          warehouse.required_quantity > 0 ? Math.min((warehouse.current_quantity / warehouse.required_quantity) * 100, 100) : 0;

        return (
          <article className="warehouse-card" key={warehouse.id}>
            <div className="warehouse-card-head">
              <div>
                <span className="inventory-category">{warehouse.code}</span>
                <h3>{warehouse.name}</h3>
                <p>{warehouse.location ?? 'Sin ubicación'}</p>
              </div>
              <div className="row-actions">
                <button className="icon-button" type="button" onClick={() => onEdit(warehouse)} aria-label="Editar">
                  <Edit2 size={16} />
                </button>
                <button className="icon-button danger-action" type="button" onClick={() => onDelete(warehouse)} aria-label="Desactivar">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            <dl>
              <div>
                <dt>Existencia actual</dt>
                <dd>{formatQuantity(warehouse.current_quantity)}</dd>
              </div>
              <div>
                <dt>Número ideal</dt>
                <dd>{formatQuantity(warehouse.required_quantity)}</dd>
              </div>
              <div>
                <dt>Productos</dt>
                <dd>{warehouse.product_count}</dd>
              </div>
            </dl>
            <div className="warehouse-progress" aria-label="Cobertura del almacén">
              <span style={{ width: `${progress}%` }} />
            </div>
          </article>
        );
      })}
    </div>
  );
}

function InventoryProductForm({
  product,
  isSaving,
  error,
  onSave,
}: {
  product?: InventoryProduct;
  isSaving: boolean;
  error?: string;
  onSave: (payload: InventoryProductDraft) => void;
}) {
  const knownCategory = product ? inventoryCategories.includes(product.category as (typeof inventoryCategories)[number]) : true;
  const [draft, setDraft] = useState<InventoryProductDraft>({
    ...defaultProductDraft,
    ...(product
      ? {
          barcode: product.barcode ?? '',
          name: product.name,
          category: knownCategory ? product.category : 'Otro',
          brand: product.brand ?? '',
          unit: product.unit,
          minimum_stock: String(product.minimum_stock ?? 0),
          required_quantity: String(product.required_quantity ?? 0),
          notes: product.notes ?? '',
        }
      : {}),
  });
  const [customCategory, setCustomCategory] = useState(knownCategory ? '' : product?.category ?? '');
  const [localError, setLocalError] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const category = draft.category === 'Otro' ? customCategory.trim() : draft.category;
    if (!draft.name.trim()) {
      setLocalError('Indica el nombre del producto.');
      return;
    }
    if (!draft.barcode.trim()) {
      setLocalError('Indica el código de barras/SKU del producto.');
      return;
    }
    if (!category) {
      setLocalError('Indica la categoría del producto.');
      return;
    }

    setLocalError('');
    onSave({ ...draft, category });
  }

  return (
    <form className="compact-form" onSubmit={submit}>
      <div className="form-grid">
        <Field label="Nombre del producto">
          <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </Field>
        <Field label="Código de barras / SKU">
          <input value={draft.barcode} onChange={(event) => setDraft({ ...draft, barcode: event.target.value })} placeholder="Ej. CAB-TERM-001" />
        </Field>
        <Field label="Categoría">
          <select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>
            {inventoryCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </Field>
        {draft.category === 'Otro' ? (
          <Field label="Nueva categoría">
            <input value={customCategory} onChange={(event) => setCustomCategory(event.target.value)} placeholder="Ej. Consumibles" />
          </Field>
        ) : null}
        <Field label="Marca">
          <input value={draft.brand} onChange={(event) => setDraft({ ...draft, brand: event.target.value })} placeholder="Ej. Zebra, TSC, Ribetec" />
        </Field>
        <Field label="Unidad">
          <select value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value as InventoryProduct['unit'] })}>
            {inventoryUnits.map((unit) => (
              <option key={unit} value={unit}>
                {unitLabel(unit)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Stock mínimo">
          <input
            type="number"
            min="0"
            step="0.01"
            value={draft.minimum_stock}
            onChange={(event) => setDraft({ ...draft, minimum_stock: event.target.value })}
          />
        </Field>
        <Field label="Cantidad necesaria">
          <input
            type="number"
            min="0"
            step="0.01"
            value={draft.required_quantity}
            onChange={(event) => setDraft({ ...draft, required_quantity: event.target.value })}
          />
        </Field>
      </div>
      <Field label="Notas">
        <textarea rows={3} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
      </Field>
      {localError || error ? <p className="form-error">{localError || error}</p> : null}
      <button type="submit" disabled={isSaving}>
        {isSaving ? 'Guardando...' : 'Guardar producto'}
      </button>
    </form>
  );
}

function InventoryMovementForm({
  products,
  warehouses,
  movementType,
  isSaving,
  error,
  onSave,
}: {
  products: InventoryProduct[];
  warehouses: InventoryWarehouse[];
  movementType: InventoryMovement['movement_type'];
  isSaving: boolean;
  error?: string;
  onSave: (payload: InventoryMovementDraft) => void;
}) {
  const [draft, setDraft] = useState<Omit<InventoryMovementDraft, 'items'> & { items: MovementLineItem[] }>({
    warehouse_id: warehouses[0]?.id ?? '',
    source_warehouse_id: warehouses[0]?.id ?? '',
    destination_warehouse_id: warehouses[1]?.id ?? '',
    movement_type: movementType,
    items: [],
    reason: '',
    reference: '',
    notes: '',
  });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id ?? '');
  const [scanCode, setScanCode] = useState('');
  const [localError, setLocalError] = useState('');
  const selectedProduct = products.find((product) => product.id === selectedProductId) ?? null;
  const hasItems = draft.items.length > 0;

  function addProductToMovement(product: InventoryProduct | null, quantity: string) {
    const numericQuantity = Number(quantity);
    if (!product) {
      setLocalError('Selecciona o escanea un producto válido.');
      return;
    }
    if (!Number.isFinite(numericQuantity) || numericQuantity <= 0) {
      setLocalError('Indica una cantidad válida.');
      return;
    }

    setDraft((current) => {
      const existing = current.items.find((item) => item.product_id === product.id);
      const nextItems = existing
        ? current.items.map((item) =>
            item.product_id === product.id
              ? { ...item, quantity: String(Number(item.quantity) + numericQuantity) }
              : item,
          )
        : [...current.items, { product_id: product.id, product, quantity: String(numericQuantity) }];

      return { ...current, items: nextItems };
    });
    setScanCode('');
    setLocalError('');
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function addScannedProduct(code = scanCode) {
    const product = findProductByCode(products, code);
    addProductToMovement(product ?? null, '1');
  }

  function updateItemQuantity(productId: string, quantity: string) {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) => (item.product_id === productId ? { ...item, quantity } : item)),
    }));
  }

  function removeItem(productId: string) {
    setDraft((current) => ({ ...current, items: current.items.filter((item) => item.product_id !== productId) }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.movement_type === 'transfer' && (!draft.source_warehouse_id || !draft.destination_warehouse_id)) {
      setLocalError('Selecciona almacén de origen y destino.');
      return;
    }
    if (draft.movement_type !== 'transfer' && !draft.warehouse_id) {
      setLocalError('Selecciona un almacén.');
      return;
    }
    if (draft.items.length === 0) {
      setLocalError('Agrega al menos un producto al movimiento.');
      return;
    }
    if (draft.items.some((item) => !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0)) {
      setLocalError('Todas las cantidades deben ser mayores a cero.');
      return;
    }

    setLocalError('');
    onSave(draft);
  }

  return (
    <form className="compact-form" onSubmit={submit}>
      <div className="form-grid">
        <Field label="Tipo de movimiento">
          <select
            value={draft.movement_type}
            onChange={(event) =>
              setDraft({ ...draft, movement_type: event.target.value as InventoryMovement['movement_type'] })
            }
            disabled={hasItems}
          >
            <option value="input">Entrada</option>
            <option value="output">Salida</option>
            <option value="adjustment">Ajuste</option>
            <option value="transfer">Transferencia</option>
          </select>
        </Field>
        {draft.movement_type === 'transfer' ? (
          <>
            <Field label="Almacén origen">
              <select
                value={draft.source_warehouse_id}
                onChange={(event) => setDraft({ ...draft, source_warehouse_id: event.target.value })}
                disabled={hasItems}
              >
                <option value="">Selecciona origen</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Almacén destino">
              <select
                value={draft.destination_warehouse_id}
                onChange={(event) => setDraft({ ...draft, destination_warehouse_id: event.target.value })}
                disabled={hasItems}
              >
                <option value="">Selecciona destino</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : (
          <Field label="Almacén">
            <select value={draft.warehouse_id} onChange={(event) => setDraft({ ...draft, warehouse_id: event.target.value })} disabled={hasItems}>
              <option value="">Selecciona almacén</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Motivo">
          <input value={draft.reason} onChange={(event) => setDraft({ ...draft, reason: event.target.value })} />
        </Field>
        <Field label="Referencia">
          <input value={draft.reference} onChange={(event) => setDraft({ ...draft, reference: event.target.value })} placeholder="Factura, folio o nota" />
        </Field>
      </div>
      {hasItems ? <p className="muted-text">El almacén queda bloqueado hasta guardar este movimiento.</p> : null}
      <div className="movement-builder">
        <div className="movement-builder-controls">
          <Field label="Escanear código">
            <input
              ref={inputRef}
              value={scanCode}
              onChange={(event) => setScanCode(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  const code = event.currentTarget.value;
                  if (code.trim()) {
                    addScannedProduct(code);
                  }
                }
              }}
              placeholder="Escanea y presiona Enter"
              autoComplete="off"
            />
          </Field>
          <Field label="Producto">
            <select value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)}>
              <option value="">Selecciona producto</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} - {formatQuantity(product.quantity)} {product.unit}
                </option>
              ))}
            </select>
          </Field>
          <div className="movement-builder-actions">
            <button type="button" className="secondary-button" onClick={() => addScannedProduct()} disabled={!scanCode.trim()}>
              Agregar escaneo
            </button>
            <button type="button" onClick={() => addProductToMovement(selectedProduct, '1')} disabled={!selectedProductId}>
              Agregar producto
            </button>
          </div>
        </div>
        <p className="muted-text compact-hint">Cada lectura agrega una unidad. La cantidad solo se edita desde la lista del movimiento.</p>
        <MovementItemsEditor items={draft.items} onQuantityChange={updateItemQuantity} onRemove={removeItem} />
      </div>
      <Field label="Notas">
        <textarea rows={3} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
      </Field>
      {localError || error ? <p className="form-error">{localError || error}</p> : null}
      <button type="submit" disabled={isSaving || products.length === 0 || draft.items.length === 0}>
        {isSaving ? 'Guardando...' : 'Guardar movimiento'}
      </button>
    </form>
  );
}

function MovementItemsEditor({
  items,
  onQuantityChange,
  onRemove,
}: {
  items: MovementLineItem[];
  onQuantityChange: (productId: string, quantity: string) => void;
  onRemove: (productId: string) => void;
}) {
  if (items.length === 0) {
    return <EmptyState title="Sin productos">Agrega productos con el lector o desde el selector.</EmptyState>;
  }

  return (
    <div className="table-wrap movement-items-table">
      <table className="records-table">
        <thead>
          <tr>
            <th>Producto</th>
            <th>Código</th>
            <th>Cantidad</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.product_id}>
              <td>
                <strong>{item.product.name}</strong>
                <small>{item.product.category}</small>
              </td>
              <td>{item.product.barcode ?? item.product.sku ?? '-'}</td>
              <td>
                <input
                  className="quantity-input"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={item.quantity}
                  onChange={(event) => onQuantityChange(item.product_id, event.target.value)}
                  aria-label={`Cantidad para ${item.product.name}`}
                />
              </td>
              <td>
                <button className="icon-button danger-action" type="button" onClick={() => onRemove(item.product_id)} aria-label="Quitar">
                  <Trash2 size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WarehouseForm({
  warehouse,
  isSaving,
  error,
  onSave,
}: {
  warehouse?: InventoryWarehouse;
  isSaving: boolean;
  error?: string;
  onSave: (payload: InventoryWarehouseDraft) => void;
}) {
  const [draft, setDraft] = useState<InventoryWarehouseDraft>({
    name: warehouse?.name ?? '',
    code: warehouse?.code ?? '',
    location: warehouse?.location ?? '',
  });
  const [localError, setLocalError] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.name.trim()) {
      setLocalError('Indica el nombre del almacén.');
      return;
    }
    setLocalError('');
    onSave(draft);
  }

  return (
    <form className="compact-form" onSubmit={submit}>
      <div className="form-grid">
        <Field label="Nombre">
          <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </Field>
        <Field label="Código">
          <input value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} placeholder="Ej. principal" />
        </Field>
      </div>
      <Field label="Ubicación">
        <input value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} />
      </Field>
      {localError || error ? <p className="form-error">{localError || error}</p> : null}
      <button type="submit" disabled={isSaving}>
        {isSaving ? 'Guardando...' : 'Guardar almacén'}
      </button>
    </form>
  );
}

function InventoryImportForm({
  warehouses,
  isSaving,
  error,
  onImport,
}: {
  warehouses: InventoryWarehouse[];
  isSaving: boolean;
  error?: string;
  onImport: (rows: ReturnType<typeof parseInventoryCsvTemplate>) => void;
}) {
  const [localError, setLocalError] = useState('');
  const [fileName, setFileName] = useState('');

  function downloadTemplate() {
    const blob = new Blob([buildInventoryTemplateCsv()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plantilla-inventario-tectronic.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    const rows = parseInventoryCsvTemplate(text);
    if (rows.length === 0) {
      setLocalError('La plantilla no contiene productos válidos.');
      return;
    }
    if (warehouses.length === 0) {
      setLocalError('Crea al menos un almacén antes de importar productos.');
      return;
    }

    setLocalError('');
    onImport(rows);
  }

  return (
    <div className="compact-form">
      <div className="template-box">
        <p>
          Descarga la plantilla, complétala en Excel y vuelve a cargarla como CSV. Puedes incluir código de barras/SKU,
          categoría, marca, unidad, stock mínimo, cantidad necesaria y existencia inicial.
        </p>
        <button type="button" className="secondary-button" onClick={downloadTemplate}>
          <Download size={18} />
          Descargar plantilla
        </button>
      </div>
      <label className="image-input-label">
        <Upload size={18} />
        Seleccionar plantilla
        <input type="file" accept=".csv,text/csv" onChange={(event) => handleFile(event.target.files?.[0])} />
      </label>
      {fileName ? <p className="success-text">Archivo seleccionado: {fileName}</p> : null}
      {localError || error ? <p className="form-error">{localError || error}</p> : null}
      <button type="button" disabled={isSaving}>
        {isSaving ? 'Importando...' : 'Esperando plantilla'}
      </button>
    </div>
  );
}

function InventoryModal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <section className="modal-card modal-wide">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function InventoryStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="stat-card">
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function invalidateInventory(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['inventory-products'] });
  queryClient.invalidateQueries({ queryKey: ['inventory-warehouses'] });
  queryClient.invalidateQueries({ queryKey: ['inventory-stock-overview'] });
  queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
}

function buildInventoryStats(products: InventoryProduct[], movementCount: number) {
  return products.reduce(
    (stats, product) => ({
      products: stats.products + 1,
      totalStock: stats.totalStock + Number(product.quantity),
      lowStock: stats.lowStock + (isLowStock(product) ? 1 : 0),
      movements: movementCount,
    }),
    { products: 0, totalStock: 0, lowStock: 0, movements: movementCount },
  );
}

function buildWarehouseSummaries(
  warehouses: InventoryWarehouse[],
  stockOverview: InventoryStockOverviewRow[],
): InventoryWarehouseSummary[] {
  return warehouses.map((warehouse) => {
    const warehouseRows = stockOverview.filter((row) => row.warehouse_id === warehouse.id && row.inventory_products?.is_active);
    const productIds = new Set(warehouseRows.map((row) => row.inventory_products?.id).filter(Boolean));

    return {
      ...warehouse,
      current_quantity: warehouseRows.reduce((total, row) => total + Number(row.quantity), 0),
      required_quantity: warehouseRows.reduce((total, row) => total + Number(row.inventory_products?.required_quantity ?? 0), 0),
      product_count: productIds.size,
    };
  });
}

function findProductByCode(products: InventoryProduct[], code: string) {
  const normalizedCode = normalizeLookup(code);
  return products.find((product) =>
    [product.barcode, product.sku, product.name].some((value) => normalizeLookup(value ?? '') === normalizedCode),
  );
}

function exportProductsCsv(products: InventoryProduct[]) {
  const rows = [
    ['Nombre', 'Código de barras / SKU', 'Categoría', 'Marca', 'Unidad', 'Existencia', 'Stock mínimo', 'Cantidad necesaria', 'Notas'],
    ...products.map((product) => [
      product.name,
      product.barcode ?? product.sku ?? '',
      product.category,
      product.brand ?? '',
      unitLabel(product.unit),
      String(product.quantity),
      String(product.minimum_stock),
      String(product.required_quantity),
      product.notes ?? '',
    ]),
  ];
  const csv = rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'productos-inventario-tectronic.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function escapeCsvValue(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function getMovementLockMessage(products: InventoryProduct[], warehouses: InventoryWarehouse[]) {
  if (warehouses.length === 0) {
    return 'Crea al menos un almacén antes de registrar movimientos.';
  }
  if (products.length === 0) {
    return 'Registra al menos un producto antes de agregar stock a un almacén.';
  }
  return '';
}

function normalizeLookup(value: string) {
  return value.trim().toLowerCase();
}

function isLowStock(product: InventoryProduct) {
  return Number(product.minimum_stock) > 0 && Number(product.quantity) <= Number(product.minimum_stock);
}

function formatQuantity(value: number | string) {
  const numericValue = Number(value);
  return new Intl.NumberFormat('es-MX', {
    maximumFractionDigits: 2,
  }).format(Number.isFinite(numericValue) ? numericValue : 0);
}

function movementWarehouseLabel(
  movement: Pick<InventoryMovement, 'movement_type' | 'warehouse_id' | 'source_warehouse_id' | 'destination_warehouse_id'>,
  warehouses: InventoryWarehouse[],
) {
  const getName = (id: string | null) => warehouses.find((warehouse) => warehouse.id === id)?.name ?? '-';
  if (movement.movement_type === 'transfer') {
    return `${getName(movement.source_warehouse_id)} → ${getName(movement.destination_warehouse_id)}`;
  }
  return getName(movement.warehouse_id);
}

function movementLabel(type: InventoryMovement['movement_type']) {
  const labels: Record<InventoryMovement['movement_type'], string> = {
    input: 'Entrada',
    output: 'Salida',
    adjustment: 'Ajuste',
    transfer: 'Transferencia',
  };

  return labels[type];
}

function movementTitle(type: InventoryMovement['movement_type']) {
  const labels: Record<InventoryMovement['movement_type'], string> = {
    input: 'Registrar entrada',
    output: 'Registrar salida',
    adjustment: 'Ajustar existencia',
    transfer: 'Transferir entre almacenes',
  };

  return labels[type];
}

function unitLabel(unit: InventoryProduct['unit']) {
  const labels: Record<InventoryProduct['unit'], string> = {
    pieza: 'Pieza',
    metro: 'Metro',
    equipo: 'Equipo',
    caja: 'Caja',
  };

  return labels[unit];
}
