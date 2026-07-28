"use client";

import { useActionState, useState } from "react";
import { Card } from "@growth-manager/ui";
import { SubmitButton } from "../../../components/submit-button";
import { createClientAction, type ActionState } from "../actions";

const initialState: ActionState = { error: null };

// The zones Brazilian clients actually operate in, plus the two most common
// international ones. A free-text field here only invites typos that break every
// date on the client's screens.
const timezones: readonly { readonly value: string; readonly label: string }[] = [
  { value: "America/Sao_Paulo", label: "Brasília (São Paulo)" },
  { value: "America/Manaus", label: "Manaus" },
  { value: "America/Cuiaba", label: "Cuiabá" },
  { value: "America/Belem", label: "Belém" },
  { value: "America/Fortaleza", label: "Fortaleza" },
  { value: "America/Recife", label: "Recife" },
  { value: "America/Bahia", label: "Salvador" },
  { value: "America/Porto_Velho", label: "Porto Velho" },
  { value: "America/Rio_Branco", label: "Rio Branco" },
  { value: "America/Noronha", label: "Fernando de Noronha" },
  { value: "America/New_York", label: "Nova York" },
  { value: "Europe/Lisbon", label: "Lisboa" }
];

export interface OrganizationOption {
  readonly id: string;
  readonly name: string;
}

export function ClientForm({
  organizations
}: {
  readonly organizations: readonly OrganizationOption[];
}): React.ReactNode {
  const [state, action] = useActionState(createClientAction, initialState);
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? "new");
  const creatingOrganization = organizationId === "new";

  return (
    <Card>
      <form action={action} className="task-form">
        <div className="field">
          <label htmlFor="client-name">Nome do cliente</label>
          <input
            autoComplete="off"
            id="client-name"
            maxLength={160}
            name="name"
            placeholder="Padaria Aurora"
            required
            type="text"
          />
        </div>

        <div className="field">
          <label htmlFor="client-organization">Organização</label>
          <select
            id="client-organization"
            name="organization_id"
            onChange={(event) => {
              setOrganizationId(event.target.value);
            }}
            value={organizationId}
          >
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
            <option value="new">Nova organização…</option>
          </select>
        </div>

        {creatingOrganization ? (
          <>
            <div className="field">
              <label htmlFor="client-organization-name">Nome da organização</label>
              <input
                id="client-organization-name"
                maxLength={160}
                name="organization_name"
                required
                type="text"
              />
            </div>
            <div className="field">
              <label htmlFor="client-billing-email">E-mail de cobrança</label>
              <input id="client-billing-email" name="billing_email" required type="email" />
            </div>
          </>
        ) : null}

        <div className="field">
          <label htmlFor="client-legal-name">Razão social</label>
          <input id="client-legal-name" maxLength={200} name="legal_name" type="text" />
        </div>

        <div className="field">
          <label htmlFor="client-industry">Segmento</label>
          <input
            id="client-industry"
            maxLength={80}
            name="industry"
            placeholder="Alimentação"
            type="text"
          />
        </div>

        <div className="field">
          <label htmlFor="client-timezone">Fuso horário</label>
          <select defaultValue="America/Sao_Paulo" id="client-timezone" name="timezone">
            {timezones.map((zone) => (
              <option key={zone.value} value={zone.value}>
                {zone.label}
              </option>
            ))}
          </select>
        </div>

        {state.error === null ? null : (
          <p className="form-error" role="alert">
            {state.error}
          </p>
        )}

        <SubmitButton className="primary-button" pendingLabel="Criando…">
          Criar cliente
        </SubmitButton>
      </form>
    </Card>
  );
}
