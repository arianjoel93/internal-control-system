import { type ChangeEvent, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileJson,
  FileText,
  GripVertical,
  Printer,
  Save,
  Send,
  UploadCloud,
} from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { EmptyState } from '../../components/EmptyState';
import {
  getPublicForm,
  REQUIREMENT_FORM_TITLE,
  submitFormResponse,
  uploadRequirementFiles,
  type RequirementAttachment,
} from './formsService';

type Answers = Record<string, unknown>;
type RequirementInlineImage = {
  name: string;
  size: number;
  type: 'image/webp';
  width: number;
  height: number;
  data_url: string;
  processed_at: string;
};

type FieldType =
  | 'texto_corto'
  | 'texto_largo'
  | 'numero_entero'
  | 'numero_decimal'
  | 'moneda'
  | 'si_no'
  | 'opcion_unica'
  | 'opcion_multiple'
  | 'fecha'
  | 'hora'
  | 'dimensiones'
  | 'tabla_campos'
  | 'tabla_columnas_csv'
  | 'tabla_simple'
  | 'archivo'
  | 'imagenes_multiples'
  | 'cadena_ejemplo'
  | 'ordenable'
  | 'firma_aprobacion';

type TableColumn = {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'checkbox' | 'select';
  options?: string[];
};

type RequirementField = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  help?: string;
  example?: string;
  options?: string[];
  maxLength?: number;
  min?: number;
  max?: number;
  precision?: number;
  unit?: string;
  multiple?: boolean;
  accept?: string;
  columns?: TableColumn[];
  suggestedItems?: string[];
  inlineImage?: boolean;
  condition?: (answers: Answers) => boolean;
};

type RequirementStep = {
  id: string;
  title: string;
  description: string;
  fields: RequirementField[];
  condition?: (answers: Answers) => boolean;
};

const YES_NO = ['Sí', 'No'];
const UNKNOWN = 'No lo sé / Requiero recomendación';
const currencyOptions = ['MXN', 'USD'];
const draftPrefix = 'tectronic-requirement-draft';
const defaultAnswers: Answers = {
  project_kind: 'Nueva programación',
  programming_target: 'Desarrollo para impresora',
};

const solutionOptions = [
  'Báscula / pesaje',
  'Etiqueta de producto',
  'Ticket',
  'Estacionamiento',
  'Exportación o producto agrícola',
  'Producción, empaque o trazabilidad',
  'Comedor o control de consumos',
  'Toma de turnos',
  'Control de acceso o brazaletes',
  'Reportes / consulta de bases de datos',
  'Otro',
];

const suggestedFields = [
  'usuario',
  'operador',
  'producto',
  'código',
  'descripción',
  'cliente',
  'lote',
  'orden',
  'partida',
  'turno',
  'línea',
  'máquina',
  'tara',
  'peso bruto',
  'peso neto',
  'cantidad',
  'piezas',
  'fecha',
  'hora',
  'caducidad',
  'observación',
  'leyenda',
  'GTIN',
  'PLU',
];

const fieldsTableColumns: TableColumn[] = [
  { key: 'visible_name', label: 'Nombre visible' },
  { key: 'variable_name', label: 'Variable sugerida' },
  { key: 'origin', label: 'Origen', type: 'select', options: ['teclado', 'escáner', 'báscula', 'reloj de impresora', 'calculado', 'CSV', 'fijo', UNKNOWN] },
  { key: 'required', label: 'Obligatorio', type: 'checkbox' },
  { key: 'data_type', label: 'Tipo', type: 'select', options: ['texto', 'entero', 'decimal', 'fecha', 'hora', 'moneda', 'código', UNKNOWN] },
  { key: 'max_length', label: 'Longitud máxima', type: 'number' },
  { key: 'decimals', label: 'Decimales', type: 'number' },
  { key: 'example', label: 'Valor de ejemplo' },
  { key: 'validation', label: 'Regla de validación' },
  { key: 'prints', label: 'Se imprime', type: 'checkbox' },
  { key: 'history', label: 'Historial', type: 'checkbox' },
  { key: 'csv_lookup', label: 'Busca en BD', type: 'checkbox' },
];

const csvColumns: TableColumn[] = [
  { key: 'file', label: 'Archivo' },
  { key: 'purpose', label: 'Propósito' },
  { key: 'header', label: 'Encabezado exacto' },
  { key: 'type', label: 'Tipo de dato', type: 'select', options: ['texto', 'entero', 'decimal', 'fecha', 'hora', 'moneda', 'código', UNKNOWN] },
  { key: 'search_key', label: 'Campo índice/búsqueda' },
  { key: 'prints', label: 'Campos que se imprimen' },
  { key: 'updates', label: 'Campos que se actualizan' },
  { key: 'example', label: 'Ejemplo real' },
];

const historyColumns: TableColumn[] = [
  { key: 'column', label: 'Columna' },
  { key: 'source', label: 'Origen' },
  { key: 'order', label: 'Orden', type: 'number' },
  { key: 'format', label: 'Formato' },
];

export function PublicFormPage() {
  const { slug = '' } = useParams();
  const draftKey = `${draftPrefix}-${slug || 'default'}`;
  const [answers, setAnswers] = useState<Answers>(() => ({ ...defaultAnswers, ...readDraft(draftKey).answers }));
  const [currentStepIndex, setCurrentStepIndex] = useState(() => readDraft(draftKey).currentStepIndex);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState(() => readDraft(draftKey).status);
  const [uploadingField, setUploadingField] = useState<string | null>(null);

  const formQuery = useQuery({
    queryKey: ['public-requirement-form', slug],
    queryFn: () => getPublicForm(slug),
    enabled: Boolean(slug),
    retry: false,
  });

  const form = formQuery.data ?? null;
  const steps = useMemo(() => buildSteps(answers), [answers]);
  const activeStepIndex = Math.min(currentStepIndex, Math.max(steps.length - 1, 0));
  const currentStep = steps[activeStepIndex] ?? steps[0];
  const isReviewStep = currentStep?.id === 'review';
  const isLastStep = activeStepIndex >= steps.length - 1;
  const progress = steps.length <= 1 ? 100 : Math.round(((activeStepIndex + 1) / steps.length) * 100);
  const finalIssues = useMemo(() => validateAll(answers, steps), [answers, steps]);

  const submitMutation = useMutation({
    mutationFn: () => {
      if (!form) throw new Error('Formulario no disponible.');
      const issues = validateAll(answers, steps);
      if (issues.length > 0) throw new Error(`Falta información para finalizar: ${issues[0]}`);
      return submitFormResponse({
        form_id: form.id,
        respondent_name: getString(answers.contact_name) || getString(answers.company_name) || null,
        respondent_email: getString(answers.contact_email) || null,
        answers: {
          ...answers,
          generated_at: new Date().toISOString(),
          technical_note:
            'No usar RECORDSET$. Resolver consultas CSV con OPEN, READ, SEEK, FSEARCH, MID$, INSTR y separación controlada de columnas según el firmware.',
        },
      });
    },
    onSuccess: () => {
      localStorage.removeItem(draftKey);
    },
    onError: (error) => {
      setValidationError(error instanceof Error ? error.message : 'Revisa la información capturada.');
    },
  });

  function updateAnswer(key: string, value: unknown) {
    setAnswers((current) => ({ ...current, [key]: value }));
    setDraftStatus('Cambios sin guardar');
  }

  function saveDraft() {
    localStorage.setItem(draftKey, JSON.stringify({ answers, currentStepIndex: activeStepIndex, savedAt: new Date().toISOString() }));
    setDraftStatus('Borrador guardado en este dispositivo');
  }

  function goNext() {
    setValidationError(null);
    const issue = validateStep(currentStep, answers);
    if (issue) {
      setValidationError(issue);
      return;
    }
    if (activeStepIndex < steps.length - 1) {
      setCurrentStepIndex((index) => index + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function goBack() {
    setValidationError(null);
    setCurrentStepIndex((index) => Math.max(0, index - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleFiles(field: RequirementField, files: FileList | null) {
    if (!files || files.length === 0 || !form) return;
    setUploadingField(field.key);
    setValidationError(null);
    try {
      if (field.inlineImage) {
        const processed = await Promise.all(Array.from(files).map((file) => processImageForDatabase(file)));
        const current = Array.isArray(answers[field.key]) ? (answers[field.key] as RequirementInlineImage[]) : [];
        updateAnswer(field.key, [...current, ...processed]);
        return;
      }

      const uploaded = await uploadRequirementFiles(form.id, field.key, Array.from(files));
      const current = Array.isArray(answers[field.key]) ? (answers[field.key] as RequirementAttachment[]) : [];
      updateAnswer(field.key, [...current, ...uploaded]);
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'No se pudieron subir los archivos.');
    } finally {
      setUploadingField(null);
    }
  }

  if (formQuery.isLoading) {
    return (
      <main className="requirement-public-page">
        <EmptyState title="Cargando formulario">Preparando el levantamiento técnico...</EmptyState>
      </main>
    );
  }

  if (!form) {
    return (
      <main className="requirement-public-page">
        <EmptyState title="Formulario no disponible">
          El link no existe, no está publicado o dejó de aceptar respuestas.
        </EmptyState>
      </main>
    );
  }

  if (submitMutation.isSuccess) {
    return (
      <main className="requirement-public-page">
        <section className="requirement-success-card">
          <CheckCircle2 size={52} />
          <h1>Levantamiento recibido</h1>
          <p>La información quedó guardada correctamente. Gracias por ayudarnos a definir el alcance técnico.</p>
          <div className="requirement-export-actions">
            <button type="button" onClick={() => downloadJson(answers)}>
              <FileJson size={18} />
              Descargar JSON
            </button>
            <button type="button" onClick={() => downloadCsv(answers)}>
              <Download size={18} />
              Descargar CSV
            </button>
            <button type="button" onClick={() => downloadTechnicalSpec(answers)}>
              <FileText size={18} />
              Especificación técnica
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="requirement-public-page">
      <section className="requirement-shell">
        <aside className="requirement-summary-panel">
          <div className="requirement-brand">
            <span>
              <Printer size={24} />
            </span>
            <div>
              <p>Corporación Tectronic</p>
              <h1>{REQUIREMENT_FORM_TITLE}</h1>
            </div>
          </div>
          <div className="requirement-progress">
            <div>
              <span>Avance</span>
              <strong>{progress}%</strong>
            </div>
            <meter min={0} max={100} value={progress} />
          </div>
          <ol className="requirement-step-list">
            {steps.map((step, index) => (
              <li key={step.id} className={index === activeStepIndex ? 'active' : index < activeStepIndex ? 'done' : undefined}>
                <button type="button" onClick={() => setCurrentStepIndex(index)}>
                  <span>{index + 1}</span>
                  {step.title}
                </button>
              </li>
            ))}
          </ol>
          <div className="requirement-draft-status">
            <Save size={16} />
            {draftStatus}
          </div>
        </aside>

        <section className="requirement-form-card">
          <header className="requirement-form-header">
            <p className="eyebrow">Paso {activeStepIndex + 1} de {steps.length}</p>
            <h2>{currentStep.title}</h2>
            <p>{currentStep.description}</p>
          </header>

          {isReviewStep ? (
            <ReviewStep
              answers={answers}
              steps={steps}
              issues={finalIssues}
              onEdit={(stepId) => {
                const index = steps.findIndex((step) => step.id === stepId);
                if (index >= 0) setCurrentStepIndex(index);
              }}
              onDownloadJson={() => downloadJson(answers)}
              onDownloadCsv={() => downloadCsv(answers)}
              onDownloadSpec={() => downloadTechnicalSpec(answers)}
              onDownloadPrompt={() => downloadCodexPrompt(answers)}
              onPrintPdf={() => printSummary(answers)}
            />
          ) : (
            <div className="requirement-fields">
              {currentStep.fields.map((field) =>
                isFieldVisible(field, answers) ? (
                  <RequirementFieldControl
                    key={field.key}
                    field={field}
                    value={answers[field.key]}
                    answers={answers}
                    uploading={uploadingField === field.key}
                    onChange={(value) => updateAnswer(field.key, value)}
                    onFiles={(files) => handleFiles(field, files)}
                  />
                ) : null,
              )}
            </div>
          )}

          {validationError ? <p className="form-error requirement-error">{validationError}</p> : null}

          <footer className="requirement-actions">
            <button type="button" className="secondary-button" onClick={goBack} disabled={activeStepIndex === 0}>
              <ArrowLeft size={18} />
              Anterior
            </button>
            <button type="button" className="secondary-button" onClick={saveDraft}>
              <Save size={18} />
              Guardar borrador
            </button>
            {isReviewStep || isLastStep ? (
              <button
                type="button"
                className="primary-button"
                onClick={() => submitMutation.mutate()}
                disabled={submitMutation.isPending || finalIssues.length > 0}
              >
                <Send size={18} />
                {submitMutation.isPending ? 'Finalizando...' : 'Finalizar'}
              </button>
            ) : (
              <button type="button" className="primary-button" onClick={goNext}>
                Siguiente
                <ArrowRight size={18} />
              </button>
            )}
          </footer>
        </section>
      </section>
    </main>
  );
}

function RequirementFieldControl({
  field,
  value,
  answers,
  uploading,
  onChange,
  onFiles,
}: {
  field: RequirementField;
  value: unknown;
  answers: Answers;
  uploading: boolean;
  onChange: (value: unknown) => void;
  onFiles: (files: FileList | null) => void;
}) {
  return (
    <fieldset className={`requirement-field requirement-field-${field.type}`}>
      <legend>
        {field.label}
        {field.required ? <strong>*</strong> : null}
      </legend>
      {field.help ? <p className="requirement-help">{field.help}</p> : null}
      {field.example ? <p className="requirement-example">Ejemplo: {field.example}</p> : null}
      {renderFieldInput(field, value, answers, onChange, onFiles, uploading)}
    </fieldset>
  );
}

function renderFieldInput(
  field: RequirementField,
  value: unknown,
  answers: Answers,
  onChange: (value: unknown) => void,
  onFiles: (files: FileList | null) => void,
  uploading: boolean,
) {
  if (field.type === 'texto_largo' || field.type === 'cadena_ejemplo') {
    return (
      <textarea
        className={field.type === 'cadena_ejemplo' ? 'requirement-monospace' : undefined}
        value={getString(value)}
        maxLength={field.maxLength}
        rows={field.type === 'cadena_ejemplo' ? 4 : 5}
        placeholder={field.type === 'cadena_ejemplo' ? 'Ej.: ST,GS,+ 001.235 kg' : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  if (field.type === 'texto_corto') {
    return (
      <input
        value={getString(value)}
        maxLength={field.maxLength}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  if (field.type === 'numero_entero' || field.type === 'numero_decimal') {
    return (
      <div className="requirement-unit-input">
        <input
          type="number"
          step={field.type === 'numero_decimal' ? 1 / 10 ** (field.precision ?? 2) : 1}
          min={field.min}
          max={field.max}
          value={getString(value)}
          onChange={(event) => onChange(event.target.value)}
        />
        {field.unit ? <span>{field.unit}</span> : null}
      </div>
    );
  }

  if (field.type === 'moneda') {
    const current = isRecord(value) ? value : {};
    return (
      <div className="requirement-money-input">
        <input type="number" step="0.01" value={getString(current.amount)} onChange={(event) => onChange({ ...current, amount: event.target.value })} />
        <select value={getString(current.currency) || 'MXN'} onChange={(event) => onChange({ ...current, currency: event.target.value })}>
          {currencyOptions.map((currency) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === 'si_no') {
    return <ChoiceButtons options={YES_NO} value={getString(value)} onChange={onChange} />;
  }

  if (field.type === 'opcion_unica') {
    return <ChoiceButtons options={field.options ?? []} value={getString(value)} onChange={onChange} />;
  }

  if (field.type === 'opcion_multiple') {
    const selected = Array.isArray(value) ? value.map(String) : [];
    return (
      <div className="requirement-check-grid">
        {(field.options ?? []).map((option) => (
          <label key={option}>
            <input
              type="checkbox"
              checked={selected.includes(option)}
              onChange={(event) => {
                const next = event.target.checked ? [...selected, option] : selected.filter((item) => item !== option);
                onChange(next);
              }}
            />
            {option}
          </label>
        ))}
      </div>
    );
  }

  if (field.type === 'fecha' || field.type === 'hora') {
    return <input type={field.type === 'fecha' ? 'date' : 'time'} value={getString(value)} onChange={(event) => onChange(event.target.value)} />;
  }

  if (field.type === 'dimensiones') {
    const current = isRecord(value) ? value : {};
    return (
      <div className="requirement-dimensions">
        {['ancho_mm', 'alto_mm', 'gap_mm'].map((key) => (
          <label key={key}>
            <span>{key === 'ancho_mm' ? 'Ancho' : key === 'alto_mm' ? 'Alto' : 'GAP'} mm</span>
            <input type="number" step="0.1" value={getString(current[key])} onChange={(event) => onChange({ ...current, [key]: event.target.value })} />
          </label>
        ))}
      </div>
    );
  }

  if (field.type === 'tabla_campos') {
    return (
      <EditableTable
        value={Array.isArray(value) ? value : []}
        columns={fieldsTableColumns}
        suggestedItems={suggestedFields}
        onChange={onChange}
      />
    );
  }

  if (field.type === 'tabla_columnas_csv') {
    return <EditableTable value={Array.isArray(value) ? value : []} columns={csvColumns} suggestedItems={['BDPROD.CSV', 'BDCLIENTE.CSV', 'BDUSER.CSV', 'BDLEYENDA.CSV', 'CONFIG.CSV', 'FOLIO.CSV', 'HISTO.CSV', 'LOG.CSV']} onChange={onChange} />;
  }

  if (field.type === 'tabla_simple') {
    return <EditableTable value={Array.isArray(value) ? value : []} columns={field.columns ?? []} onChange={onChange} />;
  }

  if (field.type === 'archivo' || field.type === 'imagenes_multiples') {
    const attachments = Array.isArray(value) ? (value as RequirementAttachment[]) : [];
    return (
      <div className="requirement-upload">
        <label>
          <UploadCloud size={20} />
          {uploading ? 'Subiendo...' : 'Adjuntar archivos'}
          <input
            type="file"
            multiple={field.type === 'imagenes_multiples' || field.multiple}
            accept={field.accept ?? '.pdf,.docx,.xlsx,.csv,.txt,.bmp,.png,.jpg,.jpeg'}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onFiles(event.target.files)}
          />
        </label>
        {attachments.length > 0 ? (
          <ul>
            {attachments.map((attachment) => (
              <li key={attachment.path}>{attachment.name}</li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  if (field.type === 'ordenable') {
    const items = Array.isArray(value) ? value.map(String) : [];
    return (
      <SortableList
        items={items}
        suggestions={field.suggestedItems ?? []}
        onChange={onChange}
      />
    );
  }

  if (field.type === 'firma_aprobacion') {
    const current = isRecord(value) ? value : {};
    return (
      <div className="requirement-signature">
        <input placeholder="Nombre" value={getString(current.name)} onChange={(event) => onChange({ ...current, name: event.target.value })} />
        <input placeholder="Cargo" value={getString(current.position)} onChange={(event) => onChange({ ...current, position: event.target.value })} />
        <input type="date" value={getString(current.date)} onChange={(event) => onChange({ ...current, date: event.target.value })} />
        <label>
          <input type="checkbox" checked={Boolean(current.confirmed)} onChange={(event) => onChange({ ...current, confirmed: event.target.checked })} />
          Confirmo que la información es correcta.
        </label>
      </div>
    );
  }

  return null;
}

function ChoiceButtons({ options, value, onChange }: { options: string[]; value: string; onChange: (value: unknown) => void }) {
  return (
    <div className="requirement-choice-buttons">
      {options.map((option) => (
        <button key={option} type="button" className={value === option ? 'active' : undefined} onClick={() => onChange(option)}>
          {option}
        </button>
      ))}
    </div>
  );
}

function EditableTable({
  value,
  columns,
  suggestedItems = [],
  onChange,
}: {
  value: unknown[];
  columns: TableColumn[];
  suggestedItems?: string[];
  onChange: (value: unknown) => void;
}) {
  const rows = value.map((row) => (isRecord(row) ? row : {}));

  function updateRow(index: number, key: string, nextValue: unknown) {
    onChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: nextValue } : row)));
  }

  function addRow(seed: Record<string, unknown> = {}) {
    onChange([...rows, seed]);
  }

  return (
    <div className="requirement-table-editor">
      <div className="requirement-table-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td key={column.key}>
                    {column.type === 'checkbox' ? (
                      <input type="checkbox" checked={Boolean(row[column.key])} onChange={(event) => updateRow(index, column.key, event.target.checked)} />
                    ) : column.type === 'select' ? (
                      <select value={getString(row[column.key])} onChange={(event) => updateRow(index, column.key, event.target.value)}>
                        <option value="">Seleccionar</option>
                        {(column.options ?? []).map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input type={column.type === 'number' ? 'number' : 'text'} value={getString(row[column.key])} onChange={(event) => updateRow(index, column.key, event.target.value)} />
                    )}
                  </td>
                ))}
                <td>
                  <button type="button" onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}>
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="requirement-table-actions">
        <button type="button" onClick={() => addRow()}>
          Agregar fila
        </button>
        {suggestedItems.length > 0 ? (
          <button
            type="button"
            onClick={() =>
              onChange([
                ...rows,
                ...suggestedItems.map((item) => ({
                  visible_name: item,
                  variable_name: item.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_'),
                  file: item,
                })),
              ])
            }
          >
            Agregar sugeridos
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SortableList({ items, suggestions, onChange }: { items: string[]; suggestions: string[]; onChange: (value: unknown) => void }) {
  const [newItem, setNewItem] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  function move(from: number, to: number) {
    const next = [...items];
    const [removed] = next.splice(from, 1);
    next.splice(to, 0, removed);
    onChange(next);
  }

  return (
    <div className="requirement-sortable">
      {items.map((item, index) => (
        <div
          key={`${item}-${index}`}
          draggable
          onDragStart={() => setDragIndex(index)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => {
            if (dragIndex !== null && dragIndex !== index) move(dragIndex, index);
            setDragIndex(null);
          }}
        >
          <GripVertical size={18} />
          <span>{item}</span>
          <button type="button" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}>
            Quitar
          </button>
        </div>
      ))}
      <div className="requirement-sortable-add">
        <input value={newItem} placeholder="Agregar pantalla o paso" onChange={(event) => setNewItem(event.target.value)} />
        <button
          type="button"
          onClick={() => {
            if (!newItem.trim()) return;
            onChange([...items, newItem.trim()]);
            setNewItem('');
          }}
        >
          Agregar
        </button>
      </div>
      {suggestions.length > 0 ? (
        <button type="button" onClick={() => onChange([...items, ...suggestions.filter((item) => !items.includes(item))])}>
          Cargar flujo sugerido
        </button>
      ) : null}
    </div>
  );
}

function ReviewStep({
  answers,
  steps,
  issues,
  onEdit,
  onDownloadJson,
  onDownloadCsv,
  onDownloadSpec,
  onDownloadPrompt,
  onPrintPdf,
}: {
  answers: Answers;
  steps: RequirementStep[];
  issues: string[];
  onEdit: (stepId: string) => void;
  onDownloadJson: () => void;
  onDownloadCsv: () => void;
  onDownloadSpec: () => void;
  onDownloadPrompt: () => void;
  onPrintPdf: () => void;
}) {
  return (
    <div className="requirement-review">
      <div className="requirement-review-actions">
        <button type="button" onClick={onPrintPdf}>
          <FileText size={18} />
          Resumen PDF
        </button>
        <button type="button" onClick={onDownloadJson}>
          <FileJson size={18} />
          JSON
        </button>
        <button type="button" onClick={onDownloadCsv}>
          <Download size={18} />
          CSV
        </button>
        <button type="button" onClick={onDownloadSpec}>
          <FileText size={18} />
          Markdown
        </button>
        <button type="button" onClick={onDownloadPrompt}>
          <ClipboardCheck size={18} />
          Prompt final
        </button>
      </div>
      {issues.length > 0 ? (
        <div className="requirement-missing-box">
          <strong>Información faltante antes de finalizar</strong>
          <ul>
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="requirement-ready-box">
          <CheckCircle2 size={20} />
          La información mínima está completa. Puedes finalizar el levantamiento.
        </div>
      )}
      {steps
        .filter((step) => step.id !== 'review')
        .map((step) => (
          <section className="requirement-review-section" key={step.id}>
            <header>
              <h3>{step.title}</h3>
              <button type="button" onClick={() => onEdit(step.id)}>
                Editar sección
              </button>
            </header>
            <div>
              {step.fields.filter((field) => isFieldVisible(field, answers)).map((field) => (
                <article key={field.key}>
                  <small>{field.label}</small>
                  <pre>{formatValue(answers[field.key])}</pre>
                </article>
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}

function buildSteps(answers: Answers): RequirementStep[] {
  const isUpdate = isProgramUpdate(answers);
  const isSoftware = answers.programming_target === 'Software con computadora';
  const base: RequirementStep[] = [
    {
      id: 'identification',
      title: 'Identificación del proyecto',
      description: 'Datos generales para entender quién solicita el desarrollo y qué necesita conseguir.',
      fields: [
        { key: 'project_kind', label: '¿Es una nueva programación o una actualización?', type: 'opcion_unica', required: true, options: ['Nueva programación', 'Actualización de programación existente', 'Modificación de software para imprimir'] },
        { key: 'company_name', label: 'Nombre comercial del cliente o empresa', type: 'texto_corto', required: !isUpdate, maxLength: 120, condition: () => !isUpdate },
        { key: 'contact_name', label: 'Nombre de la persona de contacto', type: 'texto_corto', required: !isUpdate, maxLength: 120, condition: () => !isUpdate },
        { key: 'contact_phone', label: 'Teléfono de contacto', type: 'texto_corto', maxLength: 40, help: 'Debe capturarse teléfono o correo; al menos uno es obligatorio.', condition: () => !isUpdate },
        { key: 'contact_email', label: 'Correo de contacto', type: 'texto_corto', maxLength: 120, condition: () => !isUpdate },
        { key: 'programming_target', label: 'Tipo de programación', type: 'opcion_unica', required: !isUpdate, options: ['Desarrollo para impresora', 'Software con computadora'], condition: () => !isUpdate },
        { key: 'solution_type', label: 'Tipo principal de solución', type: 'opcion_unica', required: !isUpdate, options: solutionOptions, condition: () => !isUpdate },
        { key: 'need_summary', label: 'Describa en pocas palabras lo que necesita conseguir', type: 'texto_largo', required: !isUpdate, example: 'Necesito imprimir una etiqueta de caja con producto, lote, fecha, peso neto y código GS1 desde una impresora TSC sin computadora.', condition: () => !isUpdate },
      ],
    },
  ];

  if (isUpdate) {
    const updateScopeStep: RequirementStep = {
      id: 'update_scope',
      title: 'Cambios requeridos',
      description: 'Para actualizaciones solo se captura la descripción de los cambios solicitados.',
      fields: [
        { key: 'update_changes', label: 'Descripción de los cambios a realizar', type: 'texto_largo', required: true, example: 'Agregar un campo nuevo, cambiar leyenda de impresión, modificar cálculo o ajustar validación existente.' },
      ],
    };

    return [
      ...base,
      updateScopeStep,
      equipmentStep(),
    ].filter((step) => !step.condition || step.condition(answers));
  }

  const visibleSteps = [
    ...base,
    equipmentStep(),
    materialStep(),
    captureStep(),
    scaleStep(),
    barcodeStep(),
    parkingStep(),
    exportStep(),
    productionStep(),
    cafeteriaStep(),
    turnsStep(),
    csvStep(),
    historyStep(),
  ];

  if (isSoftware) {
    visibleSteps.push(deliveryStep(), reviewStep());
  }

  return visibleSteps.filter((step) => !step.condition || step.condition(answers));
}

function readDraft(draftKey: string): { answers: Answers; currentStepIndex: number; status: string } {
  if (typeof localStorage === 'undefined') {
    return { answers: {}, currentStepIndex: 0, status: 'Sin guardar' };
  }

  const saved = localStorage.getItem(draftKey);
  if (!saved) return { answers: {}, currentStepIndex: 0, status: 'Sin guardar' };

  try {
    const parsed = JSON.parse(saved) as { answers?: Answers; currentStepIndex?: number };
    return {
      answers: parsed.answers ?? {},
      currentStepIndex: Math.max(0, parsed.currentStepIndex ?? 0),
      status: 'Borrador recuperado',
    };
  } catch {
    return { answers: {}, currentStepIndex: 0, status: 'No se pudo leer el borrador local' };
  }
}

function equipmentStep(): RequirementStep {
  return {
    id: 'equipment',
    title: 'Equipo y conexiones',
    description: 'Datos de impresora, firmware y dispositivos conectados. Si algo no se conoce, marca recomendación.',
    condition: (answers) => isProgramUpdate(answers),
    fields: [
      { key: 'printer_model', label: 'Modelo exacto de impresora TSC', type: 'texto_corto', required: true, condition: isPrinterDevelopment },
      { key: 'firmware_version', label: 'Versión de firmware', type: 'opcion_unica', options: ['La conozco', UNKNOWN], condition: isPrinterDevelopment },
      { key: 'firmware_text', label: 'Indique la versión de firmware', type: 'texto_corto', condition: (answers) => answers.firmware_version === 'La conozco' },
      { key: 'connected_elements', label: 'Elementos conectados a la impresora', type: 'opcion_multiple', options: ['teclado USB', 'escáner', 'báscula/indicador', 'memoria USB', 'red', 'computadora', 'pantalla de la impresora', 'otro', UNKNOWN] },
      { key: 'standalone_operation', label: '¿Se requiere operar completamente sin computadora?', type: 'si_no' },
      { key: 'printer_photos', label: 'Fotos de impresora, etiqueta colocada, conexiones y pantalla', type: 'imagenes_multiples', accept: '.bmp,.png,.jpg,.jpeg', inlineImage: true },
    ],
  };
}

function materialStep(): RequirementStep {
  return {
    id: 'material',
    title: 'Material y formato de impresión',
    description: 'Define medidas, copias, orientación, logos y referencias visuales.',
    condition: isPrinterDevelopment,
    fields: [
      { key: 'output_type', label: 'Tipo de salida', type: 'opcion_unica', required: true, options: ['etiqueta', 'ticket continuo', 'brazalete', 'recibo', 'sin impresión'] },
      { key: 'print_dimensions', label: 'Medidas exactas', type: 'dimensiones', required: true, condition: (answers) => answers.output_type !== 'sin impresión' },
      { key: 'material_distribution', label: 'Distribución del material', type: 'opcion_unica', options: ['una por fila', 'doble', 'triple', 'múltiple', 'continuo', UNKNOWN] },
      { key: 'multiple_distribution_detail', label: 'Cantidad por fila y separación entre piezas', type: 'texto_corto', condition: (answers) => answers.material_distribution === 'múltiple' },
      { key: 'orientation', label: 'Orientación requerida', type: 'opcion_unica', options: ['normal', 'invertida 180 grados', '90 grados', '270 grados', 'igual a la muestra', UNKNOWN] },
      { key: 'length_type', label: 'Largo fijo o variable', type: 'opcion_unica', options: ['fijo', 'variable', UNKNOWN] },
      { key: 'variable_length_rule', label: 'Regla del largo variable y mínimo requerido', type: 'texto_largo', condition: (answers) => answers.length_type === 'variable' },
      { key: 'copy_rule', label: 'Cantidad de copias', type: 'opcion_unica', options: ['siempre una', 'cantidad fija', 'solicitar cada vez', UNKNOWN] },
      { key: 'fixed_copies', label: 'Número fijo de copias', type: 'numero_entero', min: 1, max: 99, condition: (answers) => answers.copy_rule === 'cantidad fija' },
      { key: 'copies_range', label: 'Mínimo y máximo cuando se solicita cada vez', type: 'texto_corto', condition: (answers) => answers.copy_rule === 'solicitar cada vez' },
      { key: 'has_approved_design', label: '¿Cuenta con diseño aprobado o muestra?', type: 'si_no' },
      { key: 'design_samples', label: 'Adjunte muestras, PDF, Word, Excel o Bartender disponible', type: 'archivo', multiple: true, condition: (answers) => answers.has_approved_design === 'Sí' },
      { key: 'has_logo', label: '¿Debe llevar logo o imagen?', type: 'si_no' },
      { key: 'logo_files', label: 'Logo o imagen en la mejor calidad disponible', type: 'archivo', multiple: true, condition: (answers) => answers.has_logo === 'Sí' },
      { key: 'logo_variants', label: '¿Habrá varios logos o una opción sin logo?', type: 'texto_largo', condition: (answers) => answers.has_logo === 'Sí' },
      { key: 'visual_blocks', label: 'Cuadros, divisiones, fondo negro o texto invertido', type: 'texto_largo' },
      { key: 'visual_reference', label: 'Archivo de referencia visual', type: 'imagenes_multiples', multiple: true, accept: '.bmp,.png,.jpg,.jpeg', inlineImage: true },
    ],
  };
}

function captureStep(): RequirementStep {
  return {
    id: 'capture',
    title: 'Campos y flujo de captura',
    description: 'Define variables, origen de datos, validaciones, impresión, historial y orden de pantallas.',
    fields: [
      { key: 'requires_barcode', label: '¿Algún campo requiere código de barras o QR?', type: 'si_no' },
    ],
  };
}

function scaleStep(): RequirementStep {
  return {
    id: 'scale',
    title: 'Báscula / pesaje',
    description: 'Se muestra solo cuando existe pesaje o se conectará un indicador.',
    condition: hasScale,
    fields: [
      { key: 'scale_model', label: 'Marca y modelo del indicador', type: 'texto_corto', required: true },
      { key: 'scale_chain', label: 'Cadena exacta que envía la báscula', type: 'cadena_ejemplo', required: true, help: 'Incluye espacios, signo y unidad. Agrega al menos cero, peso positivo y, si aplica, peso negativo.' },
      { key: 'scale_manual_weight', label: '¿El peso también puede capturarse manualmente?', type: 'si_no' },
      { key: 'scale_units', label: 'Unidad recibida e impresa', type: 'opcion_multiple', options: ['kg', 'g', 'lb', 'otra', UNKNOWN] },
      { key: 'scale_min_weight', label: 'Peso mínimo esperado', type: 'numero_decimal', unit: 'kg', precision: 3 },
      { key: 'scale_max_weight', label: 'Peso máximo esperado', type: 'numero_decimal', unit: 'kg', precision: 3 },
      { key: 'scale_decimals', label: 'Decimales que se reciben, guardan e imprimen', type: 'numero_entero', min: 0, max: 6 },
      { key: 'scale_mid_rule', label: 'Extracción con MID$: posiciones de inicio y longitud si se conocen', type: 'texto_largo', help: 'Si no se conoce, deja pendiente para que Codex lo determine desde la muestra.' },
      { key: 'scale_tare', label: '¿Se requiere tara?', type: 'opcion_unica', options: ['manual', 'desde báscula', 'fija', 'desde CSV', 'no aplica', UNKNOWN] },
      { key: 'scale_printed_weights', label: '¿Qué pesos se imprimen?', type: 'opcion_multiple', options: ['peso bruto', 'tara', 'peso neto', 'combinación', UNKNOWN] },
      { key: 'scale_operation_type', label: 'Tipo de operación', type: 'opcion_unica', options: ['una pesada', 'secuencia de pesadas', UNKNOWN] },
      { key: 'scale_sequence_rule', label: 'Opciones para agregar otra pesada y finalizar', type: 'texto_largo', condition: (answers) => answers.scale_operation_type === 'secuencia de pesadas' },
      { key: 'scale_calculations', label: 'Cálculos requeridos', type: 'opcion_multiple', options: ['número de pesadas', 'suma', 'promedio', 'mínimo', 'máximo', 'diferencia', 'piezas', 'merma', 'otros', UNKNOWN] },
      { key: 'scale_pieces_factor', label: 'Factor para piezas, origen y regla de redondeo', type: 'texto_largo', condition: (answers) => includesOption(answers.scale_calculations, 'piezas') },
      { key: 'scale_list_each', label: '¿El ticket debe listar cada pesada individualmente?', type: 'si_no' },
      { key: 'scale_growing_length', label: '¿El largo debe crecer según el número de pesadas?', type: 'si_no' },
      { key: 'scale_clear_rule', label: '¿Cuándo se limpia la lista temporal?', type: 'texto_largo' },
    ],
  };
}

function barcodeStep(): RequirementStep {
  return {
    id: 'barcode',
    title: 'Códigos de barras y QR',
    description: 'Se muestra cuando algún campo requiere código de barras, GS1, QR o DataMatrix.',
    condition: (answers) => answers.requires_barcode === 'Sí',
    fields: [
      { key: 'barcode_type', label: 'Tipo de código', type: 'opcion_unica', required: true, options: ['Code 128', '128M', 'EAN-13', 'UPC', 'GS1-128', 'QR', 'DataMatrix', 'otro', UNKNOWN] },
      { key: 'barcode_value', label: 'Valor exacto o fórmula que se codifica', type: 'texto_largo', required: true },
      { key: 'barcode_human_text', label: '¿Debe imprimirse texto legible debajo?', type: 'si_no' },
      { key: 'barcode_gs1_ai', label: 'Identificadores de aplicación GS1, longitud y formato', type: 'texto_largo', condition: (answers) => answers.barcode_type === 'GS1-128' },
      { key: 'barcode_ean_upc', label: 'Dígitos y dígito verificador EAN-13/UPC', type: 'texto_corto', condition: (answers) => answers.barcode_type === 'EAN-13' || answers.barcode_type === 'UPC' },
    ],
  };
}

function parkingStep(): RequirementStep {
  return {
    id: 'parking',
    title: 'Estacionamiento',
    description: 'Reglas de tickets, tarifas, cortes y control de folios para estacionamiento.',
    condition: (answers) => answers.solution_type === 'Estacionamiento',
    fields: [
      { key: 'parking_business_data', label: 'Nombre, dirección, teléfono, RFC, horario y leyenda legal', type: 'texto_largo', required: true },
      { key: 'parking_tickets', label: 'Tickets necesarios', type: 'opcion_multiple', options: ['entrada', 'salida', 'pensión', 'perdido', 'cortesía', 'reimpresión'] },
      { key: 'parking_entry_exit_data', label: 'Datos capturados en entrada y salida', type: 'texto_largo' },
      { key: 'parking_identifier', label: 'Identificador', type: 'opcion_unica', options: ['folio', 'placa', 'código de barras', 'QR', 'otro', UNKNOWN] },
      { key: 'parking_initial_fee', label: 'Tarifa inicial', type: 'moneda' },
      { key: 'parking_included_time', label: 'Duración incluida', type: 'texto_corto' },
      { key: 'parking_extra_fees', label: 'Tarifas posteriores por hora o fracción', type: 'texto_largo' },
      { key: 'parking_tolerance', label: 'Minutos de tolerancia antes de cobrar siguiente periodo', type: 'numero_entero', min: 0, max: 999 },
      { key: 'parking_daily_max', label: 'Tarifa máxima diaria, boleto perdido, pensión y vehículos', type: 'texto_largo' },
      { key: 'parking_exceptions', label: 'Reglas para boletos inexistentes, cerrados, cancelados o reimpresos', type: 'texto_largo' },
      { key: 'parking_reports', label: 'Reportes requeridos', type: 'opcion_multiple', options: ['autos dentro', 'autos que salieron', 'entradas', 'salidas', 'dinero', 'perdidos', 'pensiones', 'corte por operador', 'corte diario'] },
      { key: 'parking_reset_folio', label: '¿Se requiere restablecer folio y quién puede hacerlo?', type: 'texto_largo' },
    ],
  };
}

function exportStep(): RequirementStep {
  return {
    id: 'export',
    title: 'Exportación o producto agrícola',
    description: 'Datos regulatorios, comerciales y de trazabilidad para etiquetas agrícolas.',
    condition: (answers) => answers.solution_type === 'Exportación o producto agrícola',
    fields: [
      { key: 'agri_product_data', label: 'Producto, variedad, calibre/count, calidad, peso, presentación y origen', type: 'texto_largo', required: true },
      { key: 'agri_parties', label: 'Productor, empacador, exportador, importador y direcciones exactas', type: 'texto_largo' },
      { key: 'agri_countries_legal', label: 'País de origen/destino y textos legales obligatorios', type: 'texto_largo' },
      { key: 'agri_codes', label: 'GTIN, PLU, lote, zona y código sanitario', type: 'texto_largo' },
      { key: 'agri_dates', label: 'Fecha de empaque y fórmula de caducidad/consumo', type: 'texto_largo' },
      { key: 'agri_authorizations', label: 'SENASA, USDA, MINAGRI u otras autorizaciones', type: 'texto_largo' },
      { key: 'agri_labels', label: 'Etiquetas requeridas', type: 'opcion_multiple', options: ['caja', 'pallet', 'SSCC', 'otras'] },
      { key: 'agri_master_table', label: 'Tabla maestra existente y campos que vienen de ella', type: 'texto_largo' },
      { key: 'agri_test_data', label: 'Diseño aprobado y datos reales de prueba', type: 'archivo', multiple: true },
    ],
  };
}

function productionStep(): RequirementStep {
  return {
    id: 'production',
    title: 'Producción, empaque o trazabilidad',
    description: 'Flujo operativo, validaciones, inventario, FIFO, cierres y reportes.',
    condition: (answers) => answers.solution_type === 'Producción, empaque o trazabilidad',
    fields: [
      { key: 'production_process', label: 'Proceso completo desde inicio hasta término', type: 'texto_largo', required: true },
      { key: 'production_actions', label: 'Qué se captura, escanea, pesa, consulta, calcula, imprime y registra', type: 'texto_largo' },
      { key: 'production_validations', label: 'Validaciones de producto, orden, lote, operador, línea o máquina', type: 'texto_largo' },
      { key: 'production_duplicates', label: 'Reglas para impedir duplicados', type: 'texto_largo' },
      { key: 'production_inventory', label: 'Materias primas, inventarios y descuento de cantidades', type: 'texto_largo' },
      { key: 'production_fifo', label: 'Reglas FIFO y stock insuficiente', type: 'texto_largo' },
      { key: 'production_closures', label: 'Cierres de lote, turno, orden o producción', type: 'texto_largo' },
      { key: 'production_waste', label: 'Registro de merma, piezas, cajas, tarimas y peso', type: 'texto_largo' },
      { key: 'production_approvals', label: 'Aprobaciones requeridas', type: 'texto_largo' },
      { key: 'production_reports', label: 'Reportes requeridos para producción, calidad y administración', type: 'texto_largo' },
    ],
  };
}

function cafeteriaStep(): RequirementStep {
  return {
    id: 'cafeteria',
    title: 'Comedor o control de consumos',
    description: 'Reglas para empleados, consumos por turno y reportes.',
    condition: (answers) => answers.solution_type === 'Comedor o control de consumos',
    fields: [
      { key: 'cafeteria_identification', label: 'Identificación', type: 'opcion_multiple', options: ['empleado', 'tarjeta', 'código de barras', 'QR', 'manual'] },
      { key: 'cafeteria_employee_data', label: 'Datos disponibles en la base de empleados', type: 'texto_largo' },
      { key: 'cafeteria_limits', label: 'Consumos permitidos por día o turno', type: 'texto_largo' },
      { key: 'cafeteria_types', label: 'Tipos de consumo', type: 'opcion_multiple', options: ['desayuno', 'comida', 'cena', 'colación', 'invitado', 'otros'] },
      { key: 'cafeteria_rules', label: 'Reglas para empleado inexistente, inactivo o consumo repetido', type: 'texto_largo' },
      { key: 'cafeteria_prints', label: '¿Imprime ticket o solo registra?', type: 'opcion_unica', options: ['imprime ticket', 'solo registra', UNKNOWN] },
      { key: 'cafeteria_reports', label: 'Reportes y actualización de empleados desde USB', type: 'texto_largo' },
    ],
  };
}

function turnsStep(): RequirementStep {
  return {
    id: 'turns',
    title: 'Toma de turnos',
    description: 'Servicios, folios, tickets, prioridades y reportes para control de turnos.',
    condition: (answers) => answers.solution_type === 'Toma de turnos',
    fields: [
      { key: 'turn_services', label: 'Servicios o áreas disponibles', type: 'texto_largo', required: true },
      { key: 'turn_prefixes', label: 'Prefijo y folio inicial de cada servicio', type: 'texto_largo' },
      { key: 'turn_reset_rule', label: 'Reinicio', type: 'opcion_unica', options: ['diario', 'manual', 'nunca', UNKNOWN] },
      { key: 'turn_priority', label: 'Turnos prioritarios', type: 'texto_largo' },
      { key: 'turn_ticket_data', label: 'Datos del ticket y cantidad de copias', type: 'texto_largo' },
      { key: 'turn_reports', label: 'Reportes de turnos y restablecimiento de folios', type: 'texto_largo' },
      { key: 'turn_csv_services', label: '¿Los servicios se actualizan desde CSV?', type: 'si_no' },
    ],
  };
}

function csvStep(): RequirementStep {
  return {
    id: 'database',
    title: 'Base de datos',
    description: 'Identifica si la solución usará una base de datos y qué tipo de origen tiene el cliente.',
    fields: [
      { key: 'uses_database', label: '¿La solución cuenta con base de datos?', type: 'si_no', required: true },
      { key: 'database_type', label: 'Tipo de base de datos', type: 'opcion_unica', required: true, options: ['Archivo CSV', 'Excel', 'Odoo', 'SQL', 'Otra', UNKNOWN], condition: (answers) => answers.uses_database === 'Sí' },
      { key: 'database_description', label: 'Descripción de la base de datos o integración', type: 'texto_largo', condition: (answers) => answers.uses_database === 'Sí', help: 'Indica qué datos se consultan, si se actualizan y quién administra la información.' },
      { key: 'database_files', label: 'Cargar archivos disponibles de referencia', type: 'archivo', multiple: true, condition: (answers) => answers.uses_database === 'Sí' && (answers.database_type === 'Archivo CSV' || answers.database_type === 'Excel') },
    ],
  };
}

function historyStep(): RequirementStep {
  return {
    id: 'history',
    title: 'Historial y reportes',
    description: 'Define qué se guarda, cómo se descarga, filtros, totales y reglas de borrado.',
    fields: [
      { key: 'saves_history', label: '¿Debe guardar historial de cada operación?', type: 'si_no', required: true },
      { key: 'history_columns', label: 'Columnas exactas del historial y su orden', type: 'tabla_simple', columns: historyColumns, required: true, condition: (answers) => answers.saves_history === 'Sí' },
      { key: 'history_output', label: 'Medio de salida del reporte', type: 'opcion_unica', options: ['se imprime', 'descarga a USB', 'ambas', UNKNOWN], condition: (answers) => answers.saves_history === 'Sí' && !isSoftwareDevelopment(answers) },
      { key: 'software_report_output', label: 'Medio de salida del reporte', type: 'opcion_multiple', options: ['PDF', 'CSV', 'Enviar por correo'], condition: (answers) => answers.saves_history === 'Sí' && isSoftwareDevelopment(answers), help: 'Para software con computadora, los reportes solo pueden descargarse en PDF, CSV o enviarse por correo.' },
      { key: 'history_report_type', label: 'Reporte detallado, resumido o ambos', type: 'opcion_unica', options: ['detallado', 'resumido', 'ambos', UNKNOWN], condition: (answers) => answers.saves_history === 'Sí' },
      { key: 'history_filters', label: 'Filtros requeridos', type: 'opcion_multiple', options: ['fecha', 'producto', 'usuario', 'lote', 'folio', 'estado', 'otros'], condition: (answers) => answers.saves_history === 'Sí' && isSoftwareDevelopment(answers) },
      { key: 'history_totals', label: 'Totales y agrupaciones requeridas', type: 'texto_largo', condition: (answers) => answers.saves_history === 'Sí' },
      { key: 'history_delete_after_download', label: '¿El historial se borra después de descargar?', type: 'si_no', condition: (answers) => answers.saves_history === 'Sí' },
      { key: 'history_delete_key', label: '¿Se requiere confirmación o clave para borrar?', type: 'texto_largo', condition: (answers) => answers.saves_history === 'Sí' },
      { key: 'history_reset_folio', label: '¿Debe poder restablecerse el folio?', type: 'si_no', condition: (answers) => answers.saves_history === 'Sí' },
      { key: 'history_empty_message', label: '¿Qué ocurre si no hay registros?', type: 'texto_largo', condition: (answers) => answers.saves_history === 'Sí' },
      { key: 'history_filename', label: 'Nombre esperado del archivo descargado', type: 'texto_corto', condition: (answers) => answers.saves_history === 'Sí' },
    ],
  };
}

function deliveryStep(): RequirementStep {
  return {
    id: 'delivery',
    title: 'Entrega, pruebas y aprobación',
    description: 'Criterios de aceptación, pruebas, responsables y confirmación final.',
    fields: [
      { key: 'required_files', label: 'Archivos requeridos', type: 'opcion_multiple', options: ['AUTO.BAS', 'CSV', 'BMP', 'manual PDF', 'propuesta PDF', 'plantilla Bartender', 'otros'] },
      { key: 'test_equipment', label: 'Equipos y materiales disponibles para pruebas', type: 'texto_largo', required: true },
      { key: 'test_data', label: 'Datos reales de prueba y resultados esperados', type: 'texto_largo', required: true },
      { key: 'error_cases', label: 'Casos de error que deben probarse', type: 'texto_largo' },
      { key: 'validator_person', label: 'Persona que valida funcionamiento', type: 'texto_corto', required: true },
      { key: 'design_approval_person', label: 'Persona que aprueba diseño', type: 'texto_corto' },
      { key: 'test_date', label: 'Fecha de prueba en sitio o remota', type: 'fecha' },
      { key: 'extra_notes', label: 'Observaciones adicionales', type: 'texto_largo' },
      { key: 'final_approval', label: 'Confirmación final', type: 'firma_aprobacion', required: true },
    ],
  };
}

function reviewStep(): RequirementStep {
  return {
    id: 'review',
    title: 'Revisión y salidas',
    description: 'Confirma las respuestas, descarga los archivos y finaliza el levantamiento.',
    fields: [],
  };
}

function hasScale(answers: Answers) {
  return answers.solution_type === 'Báscula / pesaje' || includesOption(answers.connected_elements, 'báscula/indicador');
}

function isProgramUpdate(answers: Answers) {
  return answers.project_kind === 'Actualización de programación existente' || answers.project_kind === 'Modificación de software para imprimir';
}

function isPrinterDevelopment(answers: Answers) {
  return !isSoftwareDevelopment(answers);
}

function isSoftwareDevelopment(answers: Answers) {
  return answers.programming_target === 'Software con computadora';
}

function includesOption(value: unknown, option: string) {
  return Array.isArray(value) && value.map(String).includes(option);
}

function isFieldVisible(field: RequirementField, answers: Answers) {
  return !field.condition || field.condition(answers);
}

function validateStep(step: RequirementStep, answers: Answers) {
  const missing = step.fields.find((field) => isFieldVisible(field, answers) && field.required && isEmptyAnswer(answers[field.key]));
  if (missing) return `El campo "${missing.label}" es obligatorio.`;
  if (step.id === 'identification' && !isProgramUpdate(answers) && !getString(answers.contact_phone) && !getString(answers.contact_email)) {
    return 'Captura al menos teléfono o correo de contacto.';
  }
  return null;
}

function validateAll(answers: Answers, steps: RequirementStep[]) {
  const issues: string[] = [];
  for (const step of steps) {
    const issue = validateStep(step, answers);
    if (issue) issues.push(issue);
  }
  if (hasScale(answers) && isEmptyAnswer(answers.scale_chain)) issues.push('Si hay báscula, agrega al menos una cadena real de ejemplo.');
  if (answers.requires_barcode === 'Sí') {
    if (isEmptyAnswer(answers.barcode_type)) issues.push('Si hay código de barras, falta el tipo.');
    if (isEmptyAnswer(answers.barcode_value)) issues.push('Si hay código de barras, falta el contenido o fórmula.');
  }
  if (isPrinterDevelopment(answers) && answers.output_type !== 'sin impresión' && isEmptyAnswer(answers.print_dimensions)) {
    issues.push('Si hay impresión, las dimensiones son obligatorias.');
  }
  if (answers.saves_history === 'Sí') {
    const missingOutput = isSoftwareDevelopment(answers)
      ? isEmptyAnswer(answers.software_report_output)
      : isEmptyAnswer(answers.history_output);
    if (isEmptyAnswer(answers.history_columns) || missingOutput) {
      issues.push('Si se solicitan reportes/historial, indica columnas y medio de salida.');
    }
  }
  return Array.from(new Set(issues));
}

function isEmptyAnswer(value: unknown) {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.values(value).every(isEmptyAnswer);
  return String(value).trim() === '';
}

function getString(value: unknown) {
  return value === null || value === undefined ? '' : String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

async function processImageForDatabase(file: File): Promise<RequirementInlineImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Solo se permiten imágenes en este campo.');
  }

  const image = await loadImage(file);
  const maxSize = 500;
  const scale = Math.min(maxSize / image.width, maxSize / image.height, 1);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('No se pudo procesar la imagen en este navegador.');
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);
  const dataUrl = canvas.toDataURL('image/webp', 0.82);

  return {
    name: file.name,
    size: file.size,
    type: 'image/webp',
    width,
    height,
    data_url: dataUrl,
    processed_at: new Date().toISOString(),
  };
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen adjunta.'));
    };
    image.src = url;
  });
}

function formatValue(value: unknown): string {
  if (isEmptyAnswer(value)) return 'Pendiente de confirmar';
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === 'object' ? JSON.stringify(item, null, 2) : String(item))).join('\n');
  }
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function downloadJson(answers: Answers) {
  downloadBlob(JSON.stringify(answers, null, 2), makeFilename(answers, 'json'), 'application/json');
}

function downloadCsv(answers: Answers) {
  const rows = Object.entries(answers).map(([campo, valor]) => ({ campo, valor: formatValue(valor) }));
  downloadBlob(toCsv(rows), makeFilename(answers, 'csv'), 'text/csv;charset=utf-8');
}

function downloadTechnicalSpec(answers: Answers) {
  downloadBlob(buildTechnicalSpec(answers), makeFilename(answers, 'md'), 'text/markdown;charset=utf-8');
}

function downloadCodexPrompt(answers: Answers) {
  downloadBlob(buildCodexPrompt(answers), `prompt-codex-${getRequirementReference(answers)}.md`, 'text/markdown;charset=utf-8');
}

function printSummary(answers: Answers) {
  const html = `
    <html lang="es-MX">
      <head>
        <title>${REQUIREMENT_FORM_TITLE}</title>
        <style>
          body{font-family:Arial,sans-serif;color:#1f2d2b;margin:32px;line-height:1.5}
          h1{font-size:28px;margin-bottom:4px} h2{margin-top:24px;color:#354f4b}
          .meta{color:#667; margin-bottom:24px}.card{border:1px solid #ddd;border-radius:14px;padding:14px;margin:10px 0}
          pre{white-space:pre-wrap;font-family:Consolas,monospace;background:#f5f7f6;padding:10px;border-radius:10px}
        </style>
      </head>
      <body>
        <h1>${REQUIREMENT_FORM_TITLE}</h1>
        <p class="meta">Cliente: ${escapeHtml(getString(answers.company_name) || 'Pendiente de confirmar')} · Programación: ${escapeHtml(getString(answers.programming_target) || getString(answers.project_kind) || 'Pendiente')}</p>
        ${Object.entries(answers)
          .map(([key, value]) => `<section class="card"><h2>${escapeHtml(key.replace(/_/g, ' '))}</h2><pre>${escapeHtml(formatValue(value))}</pre></section>`)
          .join('')}
      </body>
    </html>
  `;
  const printWindow = window.open('', '_blank', 'noopener,noreferrer');
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function buildTechnicalSpec(answers: Answers) {
  return [
    `# ${REQUIREMENT_FORM_TITLE}`,
    '',
    `Cliente: ${getString(answers.company_name) || 'Pendiente de confirmar'}`,
    `Tipo de programación: ${getString(answers.programming_target) || getString(answers.project_kind) || 'Pendiente de confirmar'}`,
    `Tipo de solución: ${getString(answers.solution_type) || 'Pendiente de confirmar'}`,
    `Fecha: ${new Date().toLocaleDateString('es-MX')}`,
    '',
    '## Resumen',
    getString(answers.need_summary) || 'Pendiente de confirmar',
    '',
    '## Estructura de entrega sugerida',
    `[fecha y referencia]/Archivos DB`,
    `[fecha y referencia]/Archivos y Manual de Uso`,
    `[fecha y referencia]/Codigo duro o Codigo TSPL`,
    '',
    '## Respuestas técnicas',
    ...Object.entries(answers).flatMap(([key, value]) => [`### ${key}`, formatValue(value), '']),
    '## Nota de firmware',
    'No usar RECORDSET$. Las consultas CSV deben resolverse con OPEN, READ, SEEK, FSEARCH, MID$, INSTR y separación controlada de columnas de acuerdo con el firmware.',
    '',
    '## Pendientes',
    'Todo campo no definido debe mantenerse como "Pendiente de confirmar"; no inventar requisitos del cliente.',
  ].join('\n');
}

function buildCodexPrompt(answers: Answers) {
  return [
    '# Prompt final para Codex',
    '',
    `Crea una solución completa para ${getString(answers.company_name) || 'Pendiente de confirmar'}, tipo de programación ${getString(answers.programming_target) || getString(answers.project_kind) || 'Pendiente de confirmar'}, tipo de solución ${getString(answers.solution_type) || 'Pendiente de confirmar'}.`,
    '',
    '## Estructura de entrega obligatoria',
    '- [fecha y referencia]/Archivos DB',
    '- [fecha y referencia]/Archivos y Manual de Uso',
    '- [fecha y referencia]/Codigo duro o Codigo TSPL',
    '',
    '## Alcance capturado',
    buildTechnicalSpec(answers),
    '',
    '## Instrucciones obligatorias',
    '- No usar RECORDSET$. Resolver CSV con OPEN, READ, SEEK, FSEARCH, MID$, INSTR y separación controlada de columnas según firmware.',
    '- Preservar desarrollos existentes y crear el nuevo proyecto sin editar archivos originales usados como referencia.',
    '- Generar una solución completa, documentada, revisada línea por línea y lista para cargar en la impresora.',
    '- Incluir criterios de aceptación, pruebas, casos de error y manual de uso.',
  ].join('\n');
}

function makeFilename(answers: Answers, extension: string) {
  return `${getRequirementReference(answers)}-${new Date().toISOString().slice(0, 10)}.${extension}`;
}

function getRequirementReference(answers: Answers) {
  const base = getString(answers.company_name) || getString(answers.project_kind) || 'levantamiento';
  return base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'levantamiento';
}

function toCsv(rows: Array<Record<string, unknown>>) {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const value = String(row[header] ?? '').replace(/"/g, '""');
          return `"${value}"`;
        })
        .join(','),
    ),
  ].join('\n');
}

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
