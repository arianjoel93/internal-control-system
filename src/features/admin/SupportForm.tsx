import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { ImagePlus, X } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import {
  MAX_SUPPORT_IMAGES,
  MAX_SUPPORT_PDFS,
  isAcceptedSupportFile,
} from '../../lib/supportImages';
import { caseStatusFromEventType } from '../../lib/tracking';
import type { Manufacturer, PrinterModel, SupportAgent, SupportEventType } from '../../lib/types';
import { searchSupportCustomers, supportShippingCarriers, type SupportCaseFormValues } from '../support/supportService';

const supportSchema = z
  .object({
    folio: z.string().min(2, 'El folio es obligatorio'),
    support_type: z.enum(['technical', 'programming']),
    support_agent_id: z.string().min(1, 'Selecciona el agente que realizó el soporte'),
    customer_name: z.string().min(2, 'El cliente es obligatorio'),
    customer_email: z.string().email('Escribe un correo válido').or(z.literal('')),
    customer_phone: z.string(),
    performed_by: z.string().min(2, 'Selecciona el agente que realizó el soporte'),
    manufacturer: z.string().min(2, 'Indica el fabricante'),
    printer_model: z.string().min(1, 'Indica el modelo'),
    part_number: z.string(),
    serial_number: z.string().min(4, 'El número de serie es imprescindible'),
    sale_date: z.string(),
    warranty_end_date: z.string(),
    programming_business_days: z.string(),
    status: z.enum(['open', 'closed', 'pending']),
    issue_summary: z.string().min(5, 'Describe el soporte'),
    event_type: z.enum(['ticket_created', 'remote_support_scheduled', 'diagnosis', 'repair', 'closed', 'note']),
    event_type_id: z.string().min(1, 'Selecciona el estado inicial'),
    event_title: z.string().min(3, 'El estado inicial es obligatorio'),
    shipping_carrier: z.string(),
    tracking_number: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.support_type === 'technical' && !values.warranty_end_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['warranty_end_date'],
        message: 'Indica el fin de la garantía',
      });
    }

    if (values.support_type === 'programming') {
      const businessDays = Number(values.programming_business_days);
      if (!Number.isInteger(businessDays) || businessDays <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['programming_business_days'],
          message: 'Indica los días hábiles del servicio',
        });
      }
    }
  });

type SupportFormFields = Omit<SupportCaseFormValues, 'image_files'>;

type SupportFormProps = {
  isSubmitting: boolean;
  error?: string;
  manufacturers: Manufacturer[];
  printerModels: PrinterModel[];
  eventTypes: SupportEventType[];
  agents: SupportAgent[];
  onSubmit: (values: SupportCaseFormValues) => void;
};

const defaultValues: SupportFormFields = {
  folio: '',
  support_type: 'technical',
  support_agent_id: '',
  customer_name: '',
  customer_email: '',
  customer_phone: '',
  performed_by: '',
  manufacturer: 'Ribetec',
  printer_model: '',
  part_number: '',
  serial_number: '',
  sale_date: '',
  warranty_end_date: '',
  programming_business_days: '',
  status: 'open',
  issue_summary: '',
  event_type: 'ticket_created',
  event_type_id: '',
  event_title: 'Equipo recibido',
  shipping_carrier: supportShippingCarriers[0],
  tracking_number: '',
};

export function SupportForm({
  isSubmitting,
  error,
  manufacturers,
  printerModels,
  eventTypes,
  agents,
  onSubmit,
}: SupportFormProps) {
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imageError, setImageError] = useState('');
  const [shipmentError, setShipmentError] = useState('');
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm<SupportFormFields>({
    resolver: zodResolver(supportSchema),
    defaultValues,
  });

  const supportType = useWatch({ control, name: 'support_type' });
  const selectedAgentId = useWatch({ control, name: 'support_agent_id' });
  const selectedManufacturer = useWatch({ control, name: 'manufacturer' });
  const selectedModel = useWatch({ control, name: 'printer_model' });
  const selectedEventTypeId = useWatch({ control, name: 'event_type_id' });
  const trackingNumber = useWatch({ control, name: 'tracking_number' });
  const customerName = useWatch({ control, name: 'customer_name' });
  const customerEmail = useWatch({ control, name: 'customer_email' });
  const customerPhone = useWatch({ control, name: 'customer_phone' });
  const deferredCustomerName = useDeferredValue(customerName);

  const activeAgents = useMemo(() => agents.filter((agent) => agent.is_active), [agents]);
  const activeManufacturers = useMemo(
    () => manufacturers.filter((manufacturer) => manufacturer.is_active),
    [manufacturers],
  );
  const selectedManufacturerId = activeManufacturers.find(
    (manufacturer) => manufacturer.name === selectedManufacturer,
  )?.id;
  const availableModels = useMemo(
    () =>
      printerModels.filter(
        (model) => model.is_active && (!selectedManufacturerId || model.manufacturer_id === selectedManufacturerId),
      ),
    [printerModels, selectedManufacturerId],
  );
  const activeEventTypes = useMemo(
    () => eventTypes.filter((eventType) => eventType.is_active && eventType.support_type === supportType),
    [eventTypes, supportType],
  );
  const customerSuggestionsQuery = useQuery({
    queryKey: ['support-customers', deferredCustomerName.trim().toLowerCase()],
    queryFn: () => searchSupportCustomers(deferredCustomerName),
    enabled: deferredCustomerName.trim().length >= 2,
  });
  const customerSuggestions = customerSuggestionsQuery.data ?? [];
  const selectedEventType = activeEventTypes.find((eventType) => eventType.id === selectedEventTypeId) ?? null;
  const canRegisterShipment = supportType === 'programming' && selectedEventType?.code === 'enviada';
  const trackingNumberField = register('tracking_number');

  useEffect(() => {
    const selectedAgent = activeAgents.find((agent) => agent.id === selectedAgentId);
    setValue('performed_by', selectedAgent?.full_name ?? '');
  }, [activeAgents, selectedAgentId, setValue]);

  useEffect(() => {
    if (!selectedAgentId && activeAgents[0]) {
      setValue('support_agent_id', activeAgents[0].id);
    }
  }, [activeAgents, selectedAgentId, setValue]);

  useEffect(() => {
    if (!selectedManufacturer && activeManufacturers[0]) {
      setValue('manufacturer', activeManufacturers[0].name);
    }
  }, [activeManufacturers, selectedManufacturer, setValue]);

  useEffect(() => {
    if (supportType === 'programming') {
      setValue('sale_date', '');
      setValue('warranty_end_date', '');
    } else {
      setValue('programming_business_days', '');
    }
  }, [supportType, setValue]);

  useEffect(() => {
    if (selectedModel && !availableModels.some((model) => model.name === selectedModel)) {
      setValue('printer_model', '');
      setValue('part_number', '');
    }
  }, [availableModels, selectedModel, setValue]);

  useEffect(() => {
    const model = availableModels.find((item) => item.name === selectedModel);
    setValue('part_number', model?.part_number ?? '');
  }, [availableModels, selectedModel, setValue]);

  useEffect(() => {
    const normalizedCustomerName = customerName.trim().toLowerCase();
    if (!normalizedCustomerName) return;

    const matchedCustomer = customerSuggestions.find(
      (customer) => customer.full_name.trim().toLowerCase() === normalizedCustomerName,
    );

    if (!matchedCustomer) return;
    if (!customerEmail.trim() && matchedCustomer.email) {
      setValue('customer_email', matchedCustomer.email);
    }
    if (!customerPhone.trim() && matchedCustomer.phone) {
      setValue('customer_phone', matchedCustomer.phone);
    }
  }, [customerEmail, customerName, customerPhone, customerSuggestions, setValue]);

  useEffect(() => {
    const selectedEventType = activeEventTypes.find((eventType) => eventType.id === selectedEventTypeId);
    if (selectedEventType) {
      setValue('event_type', selectedEventType.event_type);
      setValue('event_title', selectedEventType.name);
      setValue('status', caseStatusFromEventType(selectedEventType));
      if (selectedEventType.code !== 'enviada') {
        setValue('tracking_number', '');
      }
      return;
    }

    if (activeEventTypes[0]) {
      setValue('event_type_id', activeEventTypes[0].id);
      setValue('event_type', activeEventTypes[0].event_type);
      setValue('event_title', activeEventTypes[0].name);
      setValue('status', caseStatusFromEventType(activeEventTypes[0]));
    }
  }, [activeEventTypes, selectedEventTypeId, setValue]);

  function handleImageChange(files: FileList | null) {
    const incomingFiles = Array.from(files ?? []);
    if (incomingFiles.length === 0) return;

    const invalidFile = incomingFiles.find((file) => !isAcceptedSupportFile(file));
    if (invalidFile) {
      setImageError('Solo se permiten imágenes PNG, JPG o archivos PDF.');
      return;
    }

    const currentPdfCount = imageFiles.filter((file) => file.type === 'application/pdf').length;
    const currentImageCount = imageFiles.length - currentPdfCount;
    const incomingPdfCount = incomingFiles.filter((file) => file.type === 'application/pdf').length;
    const incomingImageCount = incomingFiles.length - incomingPdfCount;

    if (currentImageCount + incomingImageCount > MAX_SUPPORT_IMAGES) {
      setImageError('Cada soporte puede tener como máximo 4 imágenes.');
      return;
    }
    if (currentPdfCount + incomingPdfCount > MAX_SUPPORT_PDFS) {
      setImageError('Cada soporte puede tener como máximo 4 archivos PDF.');
      return;
    }

    setImageFiles((currentFiles) => [...currentFiles, ...incomingFiles]);
    setImageError('');
  }

  function removeImage(index: number) {
    setImageFiles((currentFiles) => currentFiles.filter((_file, currentIndex) => currentIndex !== index));
    setImageError('');
  }

  function submit(values: SupportFormFields) {
    if (canRegisterShipment && !trackingNumber.trim()) {
      setShipmentError('Indica el número de guía para el envío.');
      return;
    }
    setShipmentError('');
    onSubmit({ ...values, image_files: imageFiles });
    const firstTechnicalEvent = eventTypes.find(
      (eventType) => eventType.is_active && eventType.support_type === 'technical',
    );
    reset({
      ...defaultValues,
      support_agent_id: activeAgents[0]?.id ?? '',
      performed_by: activeAgents[0]?.full_name ?? '',
      manufacturer: activeManufacturers[0]?.name ?? defaultValues.manufacturer,
      event_type_id: firstTechnicalEvent?.id ?? '',
      event_type: firstTechnicalEvent?.event_type ?? defaultValues.event_type,
      event_title: firstTechnicalEvent?.name ?? defaultValues.event_title,
      shipping_carrier: supportShippingCarriers[0],
      tracking_number: '',
    });
    setImageFiles([]);
    setImageError('');
    setShipmentError('');
  }

  return (
    <form className="support-form" onSubmit={handleSubmit(submit)}>
      <div className="form-section-title">Datos del soporte</div>
      <div className="form-grid">
        <Field label="Folio interno" error={errors.folio?.message}>
          <input {...register('folio')} placeholder="Ej. 9635" />
        </Field>
        <Field label="Tipo de soporte" error={errors.support_type?.message}>
          <select {...register('support_type')}>
            <option value="technical">Técnico</option>
            <option value="programming">Programación</option>
          </select>
        </Field>
        {supportType === 'programming' ? (
          <Field label="Días hábiles del servicio" error={errors.programming_business_days?.message}>
            <input type="number" min="1" step="1" {...register('programming_business_days')} placeholder="Ej. 10" />
          </Field>
        ) : null}
        <Field label="Cliente" error={errors.customer_name?.message}>
          <input {...register('customer_name')} list="support-customer-suggestions" autoComplete="off" />
        </Field>
        <datalist id="support-customer-suggestions">
          {customerSuggestions.map((customer) => (
            <option key={customer.id} value={customer.full_name}>
              {[customer.email, customer.phone].filter(Boolean).join(' | ')}
            </option>
          ))}
        </datalist>
        <Field label="Correo" error={errors.customer_email?.message}>
          <input type="email" {...register('customer_email')} placeholder="cliente@empresa.com" />
        </Field>
        <Field label="Teléfono" error={errors.customer_phone?.message}>
          <input {...register('customer_phone')} />
        </Field>
        <Field label="Quién realizó el soporte" error={errors.support_agent_id?.message ?? errors.performed_by?.message}>
          <select {...register('support_agent_id')}>
            <option value="">Selecciona agente</option>
            {activeAgents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.full_name} - {agent.position}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <input type="hidden" {...register('performed_by')} />
      <input type="hidden" {...register('status')} />

      <div className="form-section-title">Datos del equipo</div>
      <div className="form-grid">
        <Field label="Fabricante" error={errors.manufacturer?.message}>
          <select {...register('manufacturer')}>
            <option value="">Selecciona fabricante</option>
            {activeManufacturers.map((manufacturer) => (
              <option key={manufacturer.id} value={manufacturer.name}>
                {manufacturer.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Modelo" error={errors.printer_model?.message}>
          <select {...register('printer_model')} disabled={!selectedManufacturer}>
            <option value="">Selecciona modelo</option>
            {availableModels.map((model) => (
              <option key={model.id} value={model.name}>
                {model.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Número de serie" error={errors.serial_number?.message}>
          <input {...register('serial_number')} placeholder="RT420ME2110250411" />
        </Field>
        {supportType === 'technical' ? (
          <>
            <Field label="Fecha de venta" error={errors.sale_date?.message}>
              <input type="date" {...register('sale_date')} />
            </Field>
            <Field label="Fin de garantía" error={errors.warranty_end_date?.message}>
              <input type="date" {...register('warranty_end_date')} />
            </Field>
          </>
        ) : null}
      </div>
      <input type="hidden" {...register('part_number')} />

      <div className="form-section-title">Detalle inicial</div>
      <Field label="Descripción" error={errors.issue_summary?.message}>
        <textarea rows={3} {...register('issue_summary')} />
      </Field>

      <div className="form-section-title">Primer estado del historial</div>
      <div className="form-grid">
        <Field label="Estado inicial" error={errors.event_type_id?.message}>
          <select {...register('event_type_id')}>
            <option value="">Selecciona estado</option>
            {activeEventTypes.map((eventType) => (
              <option key={eventType.id} value={eventType.id}>
                {eventType.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {canRegisterShipment ? (
        <div className="form-grid">
          <Field label="Paquetería">
            <select {...register('shipping_carrier')}>
              {supportShippingCarriers.map((carrier) => (
                <option key={carrier} value={carrier}>
                  {carrier}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Número de guía">
            <input
              {...trackingNumberField}
              placeholder="Ej. 1234567890"
              onChange={(event) => {
                trackingNumberField.onChange(event);
                setShipmentError('');
              }}
            />
            {shipmentError ? <small className="field-error">{shipmentError}</small> : null}
          </Field>
        </div>
      ) : null}
      <input type="hidden" {...register('event_type')} />
      <input type="hidden" {...register('event_title')} />

      <div className="form-section-title">Archivos del soporte</div>
      <div className="image-picker">
        <label className="image-input-label">
          <ImagePlus size={18} />
          Agregar imágenes o PDF
          <input
            type="file"
            accept="image/png,image/jpeg,application/pdf"
            multiple
            onChange={(event) => {
              handleImageChange(event.target.files);
              event.target.value = '';
            }}
            disabled={imageFiles.length >= MAX_SUPPORT_IMAGES + MAX_SUPPORT_PDFS}
          />
        </label>
        <small>
          Puedes agregar hasta {MAX_SUPPORT_IMAGES} imágenes y {MAX_SUPPORT_PDFS} PDFs. Las imágenes se convertirán a
          WebP con un ancho máximo de 500 px.
        </small>
        {imageFiles.length > 0 ? (
          <ul className="selected-images">
            {imageFiles.map((file, index) => (
              <li key={`${file.name}-${index}`}>
                <span>{file.name}</span>
                <button type="button" className="icon-button" onClick={() => removeImage(index)} aria-label="Quitar imagen">
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {imageError ? <p className="field-error">{imageError}</p> : null}
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Guardando...' : 'Registrar soporte'}
      </button>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error ? <small className="field-error">{error}</small> : null}
    </label>
  );
}
