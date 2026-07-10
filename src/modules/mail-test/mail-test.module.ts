import { Module } from '@nestjs/common';
import { ResendModule } from '@shared/resend/resend.module';
import { MailTestController } from './infrastructure/http/mail-test.controller';

@Module({
  imports: [ResendModule],
  controllers: [MailTestController],
})
export class MailTestModule {}
