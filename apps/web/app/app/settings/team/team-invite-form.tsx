"use client";

import { useActionState } from "react";
import { Card } from "@growth-manager/ui";
import { SubmitButton } from "../../../../components/submit-button";
import { inviteMemberAction, type ActionState } from "../../actions";

const initialState: ActionState = { error: null };

// platform_admin and support are granted out of band, so they are absent here on
// purpose: an invite must never be able to mint a platform operator.
const roles: readonly { readonly value: string; readonly label: string }[] = [
  { value: "agency_manager", label: "Gestor da agência" },
  { value: "strategist", label: "Estrategista" },
  { value: "content_editor", label: "Editor de conteúdo" },
  { value: "analyst", label: "Analista" },
  { value: "client_admin", label: "Administrador do cliente" },
  { value: "client_approver", label: "Aprovador do cliente" },
  { value: "client_viewer", label: "Visualizador do cliente" },
  { value: "agency_owner", label: "Dono da agência" }
];

export function TeamInviteForm({ tenantName }: { readonly tenantName: string }): React.ReactNode {
  const [state, action] = useActionState(inviteMemberAction, initialState);

  return (
    <Card>
      <form action={action} className="task-form">
        <div className="field">
          <label htmlFor="invite-email">E-mail</label>
          <input
            autoComplete="off"
            id="invite-email"
            name="email"
            placeholder="pessoa@empresa.com.br"
            required
            type="email"
          />
        </div>

        <div className="field">
          <label htmlFor="invite-role">Papel</label>
          <select defaultValue="analyst" id="invite-role" name="role">
            {roles.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="invite-scope">Alcance</label>
          <select defaultValue="tenant" id="invite-scope" name="scope">
            <option value="tenant">Somente {tenantName}</option>
            <option value="organization">Todos os clientes da organização</option>
          </select>
        </div>

        {state.error === null ? null : (
          <p className="form-error" role="alert">
            {state.error}
          </p>
        )}

        <SubmitButton className="primary-button" pendingLabel="Enviando…">
          Enviar convite
        </SubmitButton>
      </form>
    </Card>
  );
}
