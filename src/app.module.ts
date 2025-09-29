import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppGateway } from './gateways/app.gateway';
import { ActionController } from './controllers/action.controller';
import { ActionLogService } from './services/action-log.service';

@Module({
  imports: [],
  controllers: [AppController, ActionController],
  providers: [AppService, AppGateway, ActionLogService],
})
export class AppModule {}
