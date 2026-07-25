import { Controller, Headers, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { DomainError } from "@growth-manager/domain";
import { Public } from "./public.decorator.js";
import type { AuthenticatedRequest } from "./request-context.js";
import { WebhookService } from "./webhook.service.js";

@ApiTags("webhooks")
@Controller("webhooks/v1")
export class WebhookController {
  public constructor(private readonly webhooks: WebhookService) {}

  @Public()
  @Post("resend")
  public receiveResend(
    @Req() request: AuthenticatedRequest,
    @Headers("svix-id") id: string | undefined,
    @Headers("svix-timestamp") timestamp: string | undefined,
    @Headers("svix-signature") signature: string | undefined
  ): Promise<{ readonly accepted: boolean; readonly duplicate: boolean }> {
    if (
      request.rawBody === undefined ||
      id === undefined ||
      timestamp === undefined ||
      signature === undefined
    ) {
      throw new DomainError("GM-WEBHOOK-SIGNATURE", "Cabeçalhos de assinatura ausentes.", false);
    }
    return this.webhooks.receiveResend({
      id,
      timestamp,
      signature,
      payload: request.rawBody.toString("utf8")
    });
  }
}
