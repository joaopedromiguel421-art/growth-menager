"use client";

import { useActionState } from "react";
import { Card } from "@growth-manager/ui";
import { SubmitButton } from "../../../components/submit-button";
import { createTaskAction, type ActionState } from "../actions";

const initialState: ActionState = { error: null };

export function TaskForm(): React.ReactNode {
  const [state, action] = useActionState(createTaskAction, initialState);

  return (
    <Card>
      <form action={action} className="task-form">
        <div className="field">
          <label htmlFor="task-title">Título</label>
          <input id="task-title" maxLength={200} name="title" required type="text" />
        </div>
        <div className="field">
          <label htmlFor="task-description">Descrição</label>
          <input id="task-description" maxLength={5000} name="description" type="text" />
        </div>
        <div className="field">
          <label htmlFor="task-priority">Prioridade</label>
          <select defaultValue="medium" id="task-priority" name="priority">
            <option value="low">Baixa</option>
            <option value="medium">Média</option>
            <option value="high">Alta</option>
            <option value="urgent">Urgente</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="task-due">Prazo</label>
          <input id="task-due" name="due_at" type="date" />
        </div>
        {state.error === null ? null : (
          <p className="form-error" role="alert">
            {state.error}
          </p>
        )}
        <SubmitButton className="primary-button" pendingLabel="Criando…">
          Criar tarefa
        </SubmitButton>
      </form>
    </Card>
  );
}
