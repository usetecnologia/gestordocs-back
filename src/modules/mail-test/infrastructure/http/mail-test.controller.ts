import { Body, Controller, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
import { envs } from '@config/envs';
import { ResendService } from '@shared/resend/resend.service';
import { documentsObservedTemplate } from '@shared/resend/templates/documents-observed.template';
import { SendTestMailDto } from './dtos/send-test-mail.dto';

@ApiTags('mail-test')
@Controller({ path: 'mail-test', version: '1' })
export class MailTestController {
  constructor(private readonly resendService: ResendService) {}

  @Post()
  @Public()
  @ApiOperation({ summary: 'Enviar correo de prueba de documentos observados' })
  @ApiOkResponse({ schema: { example: { message: 'Correo de prueba enviado correctamente.' } } })
  async sendTestMail(@Body() dto: SendTestMailDto) {
    const html = documentsObservedTemplate({
      documents: dto.documents,
      frontendUrl: envs.FRONTEND_URL,
      appName: envs.APP_NAME,
    });

    await this.resendService.sendMail({
      to: dto.email,
      subject: 'Tienes documentos observados',
      html,
    });
    return { message: 'Correo de prueba enviado correctamente.' };
  }
}
