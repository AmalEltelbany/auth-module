import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SessionRecord, SessionSchema } from './session.schema.js';
import { SessionsService } from './sessions.service.js';

@Module({
  imports: [MongooseModule.forFeature([{ name: SessionRecord.name, schema: SessionSchema }])],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
