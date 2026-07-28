import { createServer } from "node:http";

const tenantId = "01954d2e-3b80-7000-8000-000000000001";
const userId = "01954d2e-3b80-7000-8000-000000000003";
const organizationId = "01954d2e-3b80-7000-8000-000000000004";

const session = {
  user: {
    id: userId,
    auth_user_id: "01954d2e-3b80-7000-8000-000000000005",
    email: "teste@example.com",
    name: "Operador Sintético",
    locale: "pt-BR",
    aal: "aal2"
  },
  tenants: [
    {
      id: tenantId,
      organization_id: organizationId,
      organization_name: "Agência Sintética",
      name: "Cliente Sintético",
      slug: "cliente-sintetico",
      status: "active",
      timezone: "America/Sao_Paulo",
      role: "agency_owner",
      permissions: [
        "tenant.read",
        "connections.read",
        "connections.manage",
        "metrics.read",
        "recommendations.read",
        "recommendations.decide",
        "tasks.read",
        "tasks.write",
        "approvals.read",
        "approvals.decide",
        "content.read",
        "content.write",
        "reports.read",
        "reports.approve",
        "reports.deliver",
        "costs.read",
        "costs.manage"
      ]
    }
  ]
};

const dashboard = {
  generated_at: "2026-07-28T10:00:00.000Z",
  data_quality: "partial",
  recommendations: [],
  tasks: [],
  approvals: [],
  sources: [],
  alerts_open: 0,
  monthly_cost: { amount: 0, currency: "BRL", budget_percent: 0 }
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1:4310");
  response.setHeader("Content-Type", "application/json; charset=utf-8");

  if (request.method === "GET" && url.pathname === "/v1/me") {
    await delay(300);
    send(response, 200, session);
    return;
  }

  if (request.method === "GET" && url.pathname === `/v1/tenants/${tenantId}/dashboard`) {
    await delay(600);
    send(response, 200, dashboard);
    return;
  }

  if (request.method === "GET" && url.pathname === `/v1/tenants/${tenantId}/tasks`) {
    await delay(250);
    send(response, 200, []);
    return;
  }

  if (request.method === "GET" && url.pathname === `/v1/tenants/${tenantId}/team`) {
    send(response, 200, { members: [], invitations: [] });
    return;
  }

  if (request.method === "GET" && url.pathname === `/v1/tenants/${tenantId}/alerts`) {
    send(response, 200, []);
    return;
  }

  if (request.method === "GET" && url.pathname === `/v1/tenants/${tenantId}/content`) {
    send(response, 200, []);
    return;
  }

  if (request.method === "GET" && url.pathname === `/v1/tenants/${tenantId}/publications`) {
    send(response, 200, []);
    return;
  }

  if (
    request.method === "GET" &&
    url.pathname === `/v1/tenants/${tenantId}/integrations/google_business/properties`
  ) {
    send(response, 200, []);
    return;
  }

  if (request.method === "GET" && url.pathname === `/v1/tenants/${tenantId}/reports`) {
    send(response, 200, []);
    return;
  }

  if (request.method === "GET" && url.pathname === `/v1/tenants/${tenantId}/brand-kit`) {
    send(response, 200, null);
    return;
  }

  if (request.method === "GET" && url.pathname === `/v1/tenants/${tenantId}/costs`) {
    send(response, 200, {
      period_start: "2026-07-01",
      period_end: "2026-07-31",
      currency: "BRL",
      total: 0,
      by_provider: [],
      budgets: []
    });
    return;
  }

  if (request.method === "POST" && url.pathname === `/v1/tenants/${tenantId}/tasks`) {
    await drain(request);
    await delay(800);
    send(response, 201, {
      id: "01954d2e-3b80-7000-8000-000000000010",
      tenant_id: tenantId,
      recommendation_id: null,
      title: "Tarefa sintética",
      description: null,
      status: "backlog",
      priority: "medium",
      assignee_id: null,
      due_at: null,
      version: 1
    });
    return;
  }

  send(response, 404, {
    error: {
      code: "GM-E2E-NOT-FOUND",
      message: `Mock ausente para ${request.method ?? "UNKNOWN"} ${url.pathname}`,
      request_id: "synthetic-request",
      retryable: false
    }
  });
});

server.listen(4310, "127.0.0.1");

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function drain(request) {
  return new Promise((resolve, reject) => {
    request.on("data", () => undefined);
    request.on("end", resolve);
    request.on("error", reject);
  });
}

function send(response, status, body) {
  response.statusCode = status;
  response.end(JSON.stringify(body));
}
