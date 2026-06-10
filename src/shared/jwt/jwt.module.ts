import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { envs } from '@config/envs';
import { JwtTokenService } from './jwt.service';

@Module({
  imports: [
    JwtModule.register({
      secret: envs.JWT_SECRET,
      signOptions: { expiresIn: envs.JWT_EXPIRES_IN as StringValue },
    }),
  ],
  providers: [JwtTokenService],
  exports: [JwtTokenService],
})
export class AppJwtModule {}
