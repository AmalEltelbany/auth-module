import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ACCESS_COOKIE } from './auth/auth.cookies.js';

// Shared by main.ts and the e2e tests, so tests run the same HTTP stack as production.
export function configureApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix('api');
  app.useSecurityHeaders(); // helmet-equivalent headers, built into Nest 12
  app.enableCsrfProtection(); // Sec-Fetch-Site / Origin check, built into Nest 12.1

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Application API')
      .setDescription('Sign up, sign in and session endpoints. Errors use RFC 9457 problem details.')
      .setVersion('1.0')
      .addCookieAuth(ACCESS_COOKIE)
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document);

  return app;
}
