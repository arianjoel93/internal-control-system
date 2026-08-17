import { FormEvent, useState } from 'react';
import { Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '../../components/EmptyState';
import { findPublicSupports } from '../support/supportService';
import { SupportDetails } from '../support/SupportDetails';

export function HomePage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [submittedTerm, setSubmittedTerm] = useState('');

  const supportQuery = useQuery({
    queryKey: ['public-support-search', submittedTerm],
    queryFn: () => findPublicSupports(submittedTerm),
    enabled: submittedTerm.length > 0,
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTerm = searchTerm.trim();
    if (!nextTerm) return;

    setSubmittedTerm(nextTerm);
    setSearchTerm('');
  }

  return (
    <div className="page">
      <section className="search-band public-search-band">
        <div className="public-search-copy">
          <p className="eyebrow">Consulta pública</p>
          <h1>Consulta de estado del soporte</h1>
          <p className="page-subtitle">
            Busca por folio o número de serie para revisar el historial y el estado actual del soporte o programación.
          </p>
        </div>
        <form className="serial-search" onSubmit={handleSubmit}>
          <label htmlFor="support-search">Folio o número de serie</label>
          <div className="search-row">
            <input
              id="support-search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Ej. 9635 o RT420ME2110250411"
              autoComplete="off"
            />
            <button type="submit" disabled={searchTerm.trim().length === 0}>
              <Search size={18} />
              Buscar
            </button>
          </div>
        </form>
      </section>

      {!submittedTerm ? (
        <EmptyState title="Ingresa un folio o número de serie">
          El historial se arma automáticamente con cada movimiento registrado en el soporte.
        </EmptyState>
      ) : null}

      {supportQuery.isLoading ? <LoadingResults /> : null}

      {supportQuery.isError ? (
        <EmptyState title="No se pudo consultar">Revisa la conexión con Supabase e intenta de nuevo.</EmptyState>
      ) : null}

      {supportQuery.data?.length === 0 ? (
        <EmptyState title="Sin resultados">No encontramos soportes con la búsqueda {submittedTerm}.</EmptyState>
      ) : null}

      {supportQuery.data && supportQuery.data.length > 0 ? <SupportDetails cases={supportQuery.data} /> : null}
    </div>
  );
}

function LoadingResults() {
  return (
    <section className="loading-grid" aria-label="Cargando datos de soporte">
      <div className="skeleton-card large" />
      <div className="skeleton-card" />
      <div className="skeleton-card" />
      <div className="skeleton-card wide" />
    </section>
  );
}
