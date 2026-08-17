import { useMemo, useState, type FormEvent } from 'react';
import type { ShippingBox, ShippingMode, ShippingProductProfile, ShippingQuoteSettings } from '../../lib/types';
import type { ShippingBoxDraft, ShippingProductProfileDraft, ShippingQuoteSettingsDraft } from './settingsService';
import { EmptyState } from '../../components/EmptyState';

type ShippingQuoteSettingsPanelProps = {
  settings: ShippingQuoteSettings | null;
  productProfiles: ShippingProductProfile[];
  boxes: ShippingBox[];
  isLoading: boolean;
  isCatalogLoading: boolean;
  isSaving: boolean;
  isSavingProfile: boolean;
  isSavingBox: boolean;
  error?: string | null;
  onSave: (payload: ShippingQuoteSettingsDraft) => void;
  onSaveProductProfile: (payload: ShippingProductProfileDraft, id?: string | null) => void;
  onSaveBox: (payload: ShippingBoxDraft, id?: string | null) => void;
};

const shippingModes: Array<{ value: ShippingMode; label: string }> = [
  { value: 'FACTORY_PACKAGE', label: 'Caja original' },
  { value: 'LOOSE_ITEM', label: 'Combinable' },
  { value: 'MASTER_CARTON', label: 'Caja máster' },
  { value: 'SHIP_SEPARATELY', label: 'Envío separado' },
];

const defaultDraft: ShippingQuoteSettingsDraft = {
  fedex_base_url: 'https://apis.fedex.com',
  fedex_origin_postal_code: '',
  fedex_client_id: '',
  fedex_client_secret: '',
  fedex_account_number: '',
  fedex_child_key: '',
  fedex_child_secret: '',
  is_active: true,
};

const defaultProfileDraft: ShippingProductProfileDraft = {
  odoo_product_id: 0,
  sku: '',
  product_name: '',
  unit_weight_kg: 0,
  length_cm: 0,
  width_cm: 0,
  height_cm: 0,
  shipping_mode: 'LOOSE_ITEM',
  packed_weight_kg: null,
  packed_length_cm: null,
  packed_width_cm: null,
  packed_height_cm: null,
  units_per_master_carton: null,
  can_rotate: true,
  stackable: true,
  fragile: false,
  can_combine: true,
  product_family: '',
  packaging_group: '',
  max_units_per_package: null,
  enabled: true,
};

const defaultBoxDraft: ShippingBoxDraft = {
  name: '',
  inner_length_cm: 0,
  inner_width_cm: 0,
  inner_height_cm: 0,
  outer_length_cm: 0,
  outer_width_cm: 0,
  outer_height_cm: 0,
  empty_weight_kg: 0,
  padding_weight_kg: 0,
  max_weight_kg: 30,
  enabled: true,
};

export function ShippingQuoteSettingsPanel({
  settings,
  productProfiles,
  boxes,
  isLoading,
  isCatalogLoading,
  isSaving,
  isSavingProfile,
  isSavingBox,
  error,
  onSave,
  onSaveProductProfile,
  onSaveBox,
}: ShippingQuoteSettingsPanelProps) {
  const [draft, setDraft] = useState<ShippingQuoteSettingsDraft>(() => buildDraft(settings));
  const [profileDraft, setProfileDraft] = useState<ShippingProductProfileDraft>(defaultProfileDraft);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [boxDraft, setBoxDraft] = useState<ShippingBoxDraft>(defaultBoxDraft);
  const [editingBoxId, setEditingBoxId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const visibleProfiles = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return productProfiles.slice(0, 12);
    return productProfiles
      .filter((profile) =>
        `${profile.sku} ${profile.product_name} ${profile.odoo_product_id}`.toLowerCase().includes(normalized),
      )
      .slice(0, 20);
  }, [productProfiles, search]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({
      fedex_base_url: draft.fedex_base_url.trim() || defaultDraft.fedex_base_url,
      fedex_origin_postal_code: emptyToNull(draft.fedex_origin_postal_code),
      fedex_client_id: emptyToNull(draft.fedex_client_id),
      fedex_client_secret: emptyToNull(draft.fedex_client_secret),
      fedex_account_number: emptyToNull(draft.fedex_account_number),
      fedex_child_key: emptyToNull(draft.fedex_child_key),
      fedex_child_secret: emptyToNull(draft.fedex_child_secret),
      is_active: draft.is_active,
    });
  }

  function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSaveProductProfile(profileDraft, editingProfileId);
    setProfileDraft(defaultProfileDraft);
    setEditingProfileId(null);
  }

  function submitBox(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSaveBox(boxDraft, editingBoxId);
    setBoxDraft(defaultBoxDraft);
    setEditingBoxId(null);
  }

  if (isLoading) {
    return <EmptyState title="Cargando">Consultando la configuración del cotizador...</EmptyState>;
  }

  return (
    <div className="shipping-settings-stack">
      <article className="panel">
        <div className="catalog-note">
          Aquí se guardan credenciales de FedEx y reglas logísticas. El cotizador lee Odoo en modo solo lectura,
          construye paquetes finales en Supabase y después consulta tarifas de FedEx.
        </div>
        <form className="compact-form" onSubmit={submit}>
          <div className="form-grid">
            <TextField label="Base URL FedEx" value={draft.fedex_base_url} onChange={(value) => updateDraft('fedex_base_url', value)} />
            <TextField label="FEDEX_ORIGIN_POSTAL_CODE" value={draft.fedex_origin_postal_code ?? ''} onChange={(value) => updateDraft('fedex_origin_postal_code', value)} />
            <TextField label="Client ID" value={draft.fedex_client_id ?? ''} onChange={(value) => updateDraft('fedex_client_id', value)} />
            <TextField label="Client Secret" value={draft.fedex_client_secret ?? ''} onChange={(value) => updateDraft('fedex_client_secret', value)} />
            <TextField label="Account Number" value={draft.fedex_account_number ?? ''} onChange={(value) => updateDraft('fedex_account_number', value)} />
            <TextField label="Child Key" value={draft.fedex_child_key ?? ''} onChange={(value) => updateDraft('fedex_child_key', value)} />
            <TextField label="Child Secret" value={draft.fedex_child_secret ?? ''} onChange={(value) => updateDraft('fedex_child_secret', value)} />
          </div>

          <label className="check-field">
            <input
              type="checkbox"
              checked={draft.is_active}
              onChange={(event) => setDraft((current) => ({ ...current, is_active: event.target.checked }))}
            />
            Cotizador activo
          </label>

          {error ? <p className="form-error">{error}</p> : null}

          <div className="form-actions">
            <button type="submit" disabled={isSaving}>
              {isSaving ? 'Guardando...' : 'Guardar configuración'}
            </button>
          </div>
        </form>
      </article>

      <article className="panel">
        <div className="panel-header">
          <h2>Perfiles logísticos de productos</h2>
          <span>{productProfiles.length} configurados</span>
        </div>
        <form className="compact-form" onSubmit={submitProfile}>
          <div className="form-grid">
            <NumberField label="ID producto Odoo" value={profileDraft.odoo_product_id} onChange={(value) => updateProfile('odoo_product_id', value)} />
            <TextField label="SKU" value={profileDraft.sku} onChange={(value) => updateProfile('sku', value)} />
            <TextField label="Producto" value={profileDraft.product_name} onChange={(value) => updateProfile('product_name', value)} />
            <NumberField label="Peso unitario kg" value={profileDraft.unit_weight_kg} onChange={(value) => updateProfile('unit_weight_kg', value)} />
            <NumberField label="Largo cm" value={profileDraft.length_cm} onChange={(value) => updateProfile('length_cm', value)} />
            <NumberField label="Ancho cm" value={profileDraft.width_cm} onChange={(value) => updateProfile('width_cm', value)} />
            <NumberField label="Alto cm" value={profileDraft.height_cm} onChange={(value) => updateProfile('height_cm', value)} />
            <label className="field">
              <span>Modo de envío</span>
              <select
                value={profileDraft.shipping_mode}
                onChange={(event) => updateProfile('shipping_mode', event.target.value as ShippingMode)}
              >
                {shippingModes.map((mode) => (
                  <option key={mode.value} value={mode.value}>{mode.label}</option>
                ))}
              </select>
            </label>
            <NumberField label="Peso empacado kg" value={profileDraft.packed_weight_kg ?? ''} onChange={(value) => updateProfile('packed_weight_kg', value || null)} />
            <NumberField label="Largo empacado cm" value={profileDraft.packed_length_cm ?? ''} onChange={(value) => updateProfile('packed_length_cm', value || null)} />
            <NumberField label="Ancho empacado cm" value={profileDraft.packed_width_cm ?? ''} onChange={(value) => updateProfile('packed_width_cm', value || null)} />
            <NumberField label="Alto empacado cm" value={profileDraft.packed_height_cm ?? ''} onChange={(value) => updateProfile('packed_height_cm', value || null)} />
            <TextField label="Familia" value={profileDraft.product_family ?? ''} onChange={(value) => updateProfile('product_family', value)} />
            <TextField label="Grupo compatible" value={profileDraft.packaging_group ?? ''} onChange={(value) => updateProfile('packaging_group', value)} />
          </div>
          <div className="shipping-check-grid">
            {[
              ['can_rotate', 'Puede rotarse'],
              ['stackable', 'Apilable'],
              ['fragile', 'Frágil'],
              ['can_combine', 'Puede combinarse'],
              ['enabled', 'Activo'],
            ].map(([key, label]) => (
              <label className="check-field" key={key}>
                <input
                  type="checkbox"
                  checked={Boolean(profileDraft[key as keyof ShippingProductProfileDraft])}
                  onChange={(event) => updateProfile(key as keyof ShippingProductProfileDraft, event.target.checked)}
                />
                {label}
              </label>
            ))}
          </div>
          <div className="form-actions">
            <button type="submit" disabled={isSavingProfile}>
              {isSavingProfile ? 'Guardando...' : editingProfileId ? 'Actualizar perfil' : 'Agregar perfil'}
            </button>
            {editingProfileId ? (
              <button type="button" className="secondary-button" onClick={() => {
                setEditingProfileId(null);
                setProfileDraft(defaultProfileDraft);
              }}>
                Cancelar
              </button>
            ) : null}
          </div>
        </form>

        <div className="shipping-catalog-tools">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar perfil por SKU, nombre o ID Odoo" />
        </div>
        {isCatalogLoading ? (
          <EmptyState title="Cargando catálogo">Consultando perfiles y cajas...</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="records-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Modo</th>
                  <th>Peso</th>
                  <th>Medidas</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {visibleProfiles.map((profile) => (
                  <tr key={profile.id}>
                    <td>
                      <strong>{profile.sku}</strong>
                      <small>{profile.product_name} · Odoo {profile.odoo_product_id}</small>
                    </td>
                    <td>{shippingModes.find((mode) => mode.value === profile.shipping_mode)?.label ?? profile.shipping_mode}</td>
                    <td>{formatNumber(profile.unit_weight_kg)} kg</td>
                    <td>{formatNumber(profile.length_cm)} × {formatNumber(profile.width_cm)} × {formatNumber(profile.height_cm)} cm</td>
                    <td>
                      <button type="button" className="table-action" onClick={() => editProfile(profile)}>Editar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="panel">
        <div className="panel-header">
          <h2>Catálogo de cajas</h2>
          <span>{boxes.length} cajas</span>
        </div>
        <form className="compact-form" onSubmit={submitBox}>
          <div className="form-grid">
            <TextField label="Nombre" value={boxDraft.name} onChange={(value) => updateBox('name', value)} />
            <NumberField label="Largo interno cm" value={boxDraft.inner_length_cm} onChange={(value) => updateBox('inner_length_cm', value)} />
            <NumberField label="Ancho interno cm" value={boxDraft.inner_width_cm} onChange={(value) => updateBox('inner_width_cm', value)} />
            <NumberField label="Alto interno cm" value={boxDraft.inner_height_cm} onChange={(value) => updateBox('inner_height_cm', value)} />
            <NumberField label="Largo externo cm" value={boxDraft.outer_length_cm} onChange={(value) => updateBox('outer_length_cm', value)} />
            <NumberField label="Ancho externo cm" value={boxDraft.outer_width_cm} onChange={(value) => updateBox('outer_width_cm', value)} />
            <NumberField label="Alto externo cm" value={boxDraft.outer_height_cm} onChange={(value) => updateBox('outer_height_cm', value)} />
            <NumberField label="Peso caja kg" value={boxDraft.empty_weight_kg} onChange={(value) => updateBox('empty_weight_kg', value)} />
            <NumberField label="Protección kg" value={boxDraft.padding_weight_kg} onChange={(value) => updateBox('padding_weight_kg', value)} />
            <NumberField label="Peso máximo kg" value={boxDraft.max_weight_kg} onChange={(value) => updateBox('max_weight_kg', value)} />
          </div>
          <label className="check-field">
            <input
              type="checkbox"
              checked={boxDraft.enabled}
              onChange={(event) => updateBox('enabled', event.target.checked)}
            />
            Caja activa
          </label>
          <div className="form-actions">
            <button type="submit" disabled={isSavingBox}>
              {isSavingBox ? 'Guardando...' : editingBoxId ? 'Actualizar caja' : 'Agregar caja'}
            </button>
            {editingBoxId ? (
              <button type="button" className="secondary-button" onClick={() => {
                setEditingBoxId(null);
                setBoxDraft(defaultBoxDraft);
              }}>
                Cancelar
              </button>
            ) : null}
          </div>
        </form>

        <div className="shipping-box-grid">
          {boxes.map((box) => (
            <button type="button" className="shipping-box-card" key={box.id} onClick={() => editBox(box)}>
              <strong>{box.name}</strong>
              <span>Interior {formatNumber(box.inner_length_cm)} × {formatNumber(box.inner_width_cm)} × {formatNumber(box.inner_height_cm)} cm</span>
              <span>Exterior {formatNumber(box.outer_length_cm)} × {formatNumber(box.outer_width_cm)} × {formatNumber(box.outer_height_cm)} cm</span>
              <span>{formatNumber(box.empty_weight_kg + box.padding_weight_kg)} kg caja + protección · máx. {formatNumber(box.max_weight_kg)} kg</span>
            </button>
          ))}
        </div>
      </article>
    </div>
  );

  function updateDraft<Key extends keyof ShippingQuoteSettingsDraft>(key: Key, value: ShippingQuoteSettingsDraft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateProfile<Key extends keyof ShippingProductProfileDraft>(key: Key, value: ShippingProductProfileDraft[Key]) {
    setProfileDraft((current) => ({ ...current, [key]: value }));
  }

  function updateBox<Key extends keyof ShippingBoxDraft>(key: Key, value: ShippingBoxDraft[Key]) {
    setBoxDraft((current) => ({ ...current, [key]: value }));
  }

  function editProfile(profile: ShippingProductProfile) {
    setEditingProfileId(profile.id);
    setProfileDraft({
      odoo_product_id: profile.odoo_product_id,
      sku: profile.sku,
      product_name: profile.product_name,
      unit_weight_kg: profile.unit_weight_kg,
      length_cm: profile.length_cm,
      width_cm: profile.width_cm,
      height_cm: profile.height_cm,
      shipping_mode: profile.shipping_mode,
      packed_weight_kg: profile.packed_weight_kg,
      packed_length_cm: profile.packed_length_cm,
      packed_width_cm: profile.packed_width_cm,
      packed_height_cm: profile.packed_height_cm,
      units_per_master_carton: profile.units_per_master_carton,
      can_rotate: profile.can_rotate,
      stackable: profile.stackable,
      fragile: profile.fragile,
      can_combine: profile.can_combine,
      product_family: profile.product_family ?? '',
      packaging_group: profile.packaging_group ?? '',
      max_units_per_package: profile.max_units_per_package,
      enabled: profile.enabled,
    });
  }

  function editBox(box: ShippingBox) {
    setEditingBoxId(box.id);
    setBoxDraft({
      name: box.name,
      inner_length_cm: box.inner_length_cm,
      inner_width_cm: box.inner_width_cm,
      inner_height_cm: box.inner_height_cm,
      outer_length_cm: box.outer_length_cm,
      outer_width_cm: box.outer_width_cm,
      outer_height_cm: box.outer_height_cm,
      empty_weight_kg: box.empty_weight_kg,
      padding_weight_kg: box.padding_weight_kg,
      max_weight_kg: box.max_weight_kg,
      enabled: box.enabled,
    });
  }
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        min="0"
        step="0.01"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function buildDraft(settings: ShippingQuoteSettings | null): ShippingQuoteSettingsDraft {
  if (!settings) {
    return defaultDraft;
  }

  return {
    fedex_base_url: settings.fedex_base_url || defaultDraft.fedex_base_url,
    fedex_origin_postal_code: settings.fedex_origin_postal_code ?? '',
    fedex_client_id: settings.fedex_client_id ?? '',
    fedex_client_secret: settings.fedex_client_secret ?? '',
    fedex_account_number: settings.fedex_account_number ?? '',
    fedex_child_key: settings.fedex_child_key ?? '',
    fedex_child_secret: settings.fedex_child_secret ?? '',
    is_active: settings.is_active,
  };
}

function emptyToNull(value: string | null | undefined) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('es-MX', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}
