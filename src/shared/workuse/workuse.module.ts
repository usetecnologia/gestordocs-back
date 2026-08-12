import { Module } from '@nestjs/common';
import { WorkuseService } from './workuse.service';

@Module({
  providers: [WorkuseService],
  exports: [WorkuseService],
})
export class WorkuseModule {}
