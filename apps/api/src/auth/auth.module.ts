import { Module } from '@nestjs/common';

import { AuthenticationModule } from '../common/guards/authentication.module';
import { AuthController } from './auth.controller';

@Module({
  imports: [AuthenticationModule],
  controllers: [AuthController],
})
export class AuthModule {}
