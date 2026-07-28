"use client";

import { useActionState } from "react";
import type { BrandKit, ContentItem, IntegrationProperty } from "@growth-manager/contracts";
import { Card } from "@growth-manager/ui";
import {
  createContentAction,
  createReportAction,
  deliverReportAction,
  saveBrandKitAction,
  saveBudgetAction,
  schedulePublicationAction,
  type ActionState
} from "../app/app/actions";
import { SubmitButton } from "./submit-button";

const initialState: ActionState = { error: null };

function ActionError({ state }: { readonly state: ActionState }): React.ReactNode {
  return state.error === null ? null : (
    <p className="form-error" role="alert">
      {state.error}
    </p>
  );
}

export function ContentForm(): React.ReactNode {
  const [state, action] = useActionState(createContentAction, initialState);
  return (
    <Card>
      <form action={action} className="task-form">
        <div className="field">
          <label htmlFor="content-title">Título</label>
          <input id="content-title" maxLength={200} name="title" required />
        </div>
        <div className="field">
          <label htmlFor="content-channel">Canal</label>
          <select defaultValue="google_business" id="content-channel" name="channel">
            <option value="google_business">Google Business</option>
            <option value="instagram">Instagram</option>
            <option value="facebook">Facebook</option>
            <option value="linkedin">LinkedIn</option>
            <option value="blog">Blog</option>
            <option value="email">E-mail</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="content-type">Formato</label>
          <select defaultValue="post" id="content-type" name="type">
            <option value="post">Post</option>
            <option value="story">Story</option>
            <option value="article">Artigo</option>
            <option value="email">E-mail</option>
            <option value="update">Atualização</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="content-campaign">Campanha</label>
          <input id="content-campaign" maxLength={120} name="campaign" />
        </div>
        <div className="field field--wide">
          <label htmlFor="content-body">Texto</label>
          <textarea id="content-body" maxLength={50000} name="body" required rows={6} />
        </div>
        <ActionError state={state} />
        <SubmitButton className="primary-button" pendingLabel="Criando…">
          Criar conteúdo
        </SubmitButton>
      </form>
    </Card>
  );
}

export function ScheduleForm({
  content,
  properties
}: {
  readonly content: readonly ContentItem[];
  readonly properties: readonly IntegrationProperty[];
}): React.ReactNode {
  const [state, action] = useActionState(schedulePublicationAction, initialState);
  return (
    <Card>
      <form action={action} className="task-form">
        <div className="field">
          <label htmlFor="schedule-content">Conteúdo aprovado</label>
          <select id="schedule-content" name="content_item_id" required>
            <option value="">Selecione…</option>
            {content.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="schedule-property">Perfil do Google</label>
          <select id="schedule-property" name="property_id" required>
            <option value="">Selecione…</option>
            {properties
              .filter(
                (item): item is IntegrationProperty & { id: string } =>
                  item.selected && item.id !== null
              )
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="schedule-at">Data e hora</label>
          <input id="schedule-at" name="scheduled_at" required type="datetime-local" />
        </div>
        <ActionError state={state} />
        <SubmitButton className="primary-button" pendingLabel="Agendando…">
          Agendar publicação
        </SubmitButton>
      </form>
    </Card>
  );
}

export function ReportForm(): React.ReactNode {
  const [state, action] = useActionState(createReportAction, initialState);
  const now = new Date();
  const previousMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const previousMonthStart = new Date(
    Date.UTC(previousMonthEnd.getUTCFullYear(), previousMonthEnd.getUTCMonth(), 1)
  );
  return (
    <Card>
      <form action={action} className="task-form">
        <div className="field">
          <label htmlFor="report-start">Início</label>
          <input
            defaultValue={previousMonthStart.toISOString().slice(0, 10)}
            id="report-start"
            name="period_start"
            required
            type="date"
          />
        </div>
        <div className="field">
          <label htmlFor="report-end">Fim</label>
          <input
            defaultValue={previousMonthEnd.toISOString().slice(0, 10)}
            id="report-end"
            name="period_end"
            required
            type="date"
          />
        </div>
        <ActionError state={state} />
        <SubmitButton className="primary-button" pendingLabel="Gerando…">
          Gerar relatório
        </SubmitButton>
      </form>
    </Card>
  );
}

export function ReportDeliveryForm({ reportId }: { readonly reportId: string }): React.ReactNode {
  const [state, action] = useActionState(deliverReportAction, initialState);
  return (
    <form action={action} className="task-form">
      <input name="report_id" type="hidden" value={reportId} />
      <div className="field">
        <label htmlFor={`delivery-name-${reportId}`}>Nome</label>
        <input id={`delivery-name-${reportId}`} maxLength={160} name="name" />
      </div>
      <div className="field">
        <label htmlFor={`delivery-email-${reportId}`}>E-mail</label>
        <input id={`delivery-email-${reportId}`} name="email" required type="email" />
      </div>
      <ActionError state={state} />
      <SubmitButton className="primary-button" pendingLabel="Enfileirando…">
        Enviar relatório
      </SubmitButton>
    </form>
  );
}

export function BudgetForm(): React.ReactNode {
  const [state, action] = useActionState(saveBudgetAction, initialState);
  const monthStart = new Date().toISOString().slice(0, 8) + "01";
  return (
    <Card>
      <form action={action} className="task-form">
        <div className="field">
          <label htmlFor="budget-provider">Provedor</label>
          <select id="budget-provider" name="provider">
            <option value="deepseek">DeepSeek</option>
            <option value="dataforseo">DataForSEO</option>
            <option value="firecrawl">Firecrawl</option>
            <option value="resend">Resend</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="budget-soft">Aviso (R$)</label>
          <input id="budget-soft" min="0" name="soft_limit" required step="0.01" type="number" />
        </div>
        <div className="field">
          <label htmlFor="budget-hard">Bloqueio (R$)</label>
          <input id="budget-hard" min="0.01" name="hard_limit" required step="0.01" type="number" />
        </div>
        <div className="field">
          <label htmlFor="budget-effective">Vigência</label>
          <input
            defaultValue={monthStart}
            id="budget-effective"
            name="effective_from"
            required
            type="date"
          />
        </div>
        <label>
          <input name="essential_override" type="checkbox" /> Permitir operações essenciais após o
          aviso
        </label>
        <ActionError state={state} />
        <SubmitButton className="primary-button" pendingLabel="Salvando…">
          Salvar orçamento
        </SubmitButton>
      </form>
    </Card>
  );
}

export function BrandKitForm({
  brandKit
}: {
  readonly brandKit: BrandKit | null;
}): React.ReactNode {
  const [state, action] = useActionState(saveBrandKitAction, initialState);
  const values = brandValues(brandKit);
  return (
    <Card>
      <form action={action} className="task-form">
        {brandKit === null ? null : <input name="version" type="hidden" value={brandKit.version} />}
        <div className="field">
          <label htmlFor="brand-name">Nome da identidade</label>
          <input defaultValue={values.name} id="brand-name" maxLength={160} name="name" required />
        </div>
        <div className="field field--wide">
          <label htmlFor="brand-voice">Tom de voz</label>
          <textarea
            defaultValue={values.voice}
            id="brand-voice"
            maxLength={5000}
            name="voice"
            required
            rows={4}
          />
        </div>
        <div className="field">
          <label htmlFor="brand-audiences">Públicos (um por linha)</label>
          <textarea
            defaultValue={values.audiences}
            id="brand-audiences"
            name="audiences"
            rows={4}
          />
        </div>
        <div className="field">
          <label htmlFor="brand-allowed">Claims permitidos</label>
          <textarea
            defaultValue={values.allowedClaims}
            id="brand-allowed"
            name="allowed_claims"
            rows={4}
          />
        </div>
        <div className="field">
          <label htmlFor="brand-forbidden">Claims proibidos</label>
          <textarea
            defaultValue={values.forbiddenClaims}
            id="brand-forbidden"
            name="forbidden_claims"
            rows={4}
          />
        </div>
        <div className="field">
          <label htmlFor="brand-primary">Cor principal</label>
          <input
            defaultValue={values.primaryColor}
            id="brand-primary"
            name="primary_color"
            type="color"
          />
        </div>
        <div className="field">
          <label htmlFor="brand-secondary">Cor secundária</label>
          <input
            defaultValue={values.secondaryColor}
            id="brand-secondary"
            name="secondary_color"
            type="color"
          />
        </div>
        <ActionError state={state} />
        <SubmitButton className="primary-button" pendingLabel="Salvando…">
          Salvar identidade
        </SubmitButton>
      </form>
    </Card>
  );
}

function brandValues(brandKit: BrandKit | null): {
  readonly name: string;
  readonly voice: string;
  readonly audiences: string;
  readonly allowedClaims: string;
  readonly forbiddenClaims: string;
  readonly primaryColor: string;
  readonly secondaryColor: string;
} {
  if (brandKit === null) {
    return {
      name: "Marca principal",
      voice: "",
      audiences: "",
      allowedClaims: "",
      forbiddenClaims: "",
      primaryColor: "#2557d6",
      secondaryColor: "#12a594"
    };
  }
  const primaryColor = brandKit.visual_tokens.primary_color;
  const secondaryColor = brandKit.visual_tokens.secondary_color;
  return {
    name: brandKit.name,
    voice: brandKit.voice,
    audiences: brandKit.audiences.join("\n"),
    allowedClaims: brandKit.allowed_claims.join("\n"),
    forbiddenClaims: brandKit.forbidden_claims.join("\n"),
    primaryColor: typeof primaryColor === "string" ? primaryColor : "#2557d6",
    secondaryColor: typeof secondaryColor === "string" ? secondaryColor : "#12a594"
  };
}
