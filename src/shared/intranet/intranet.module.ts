import { Module } from '@nestjs/common';
import { IntranetValidationService } from './intranet-validation.service';

@Module({
  providers: [IntranetValidationService],
  exports: [IntranetValidationService],
})
export class IntranetModule {}
