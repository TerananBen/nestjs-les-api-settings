import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Enable CORS for frontend applications (Next.js dashboard)
  app.enableCors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Project-Id', 'X-Tenant-Id'],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // Configure Swagger OpenAPI Documentation
  const config = new DocumentBuilder()
    .setTitle('LES Multi-Tenant API Gateway')
    .setDescription(
      'Enterprise Backend Service connecting to PostgreSQL Multi-Database Architecture (Keycloak Auth & Menu Permissions)',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'กรุณากรอก Keycloak Access Token (Bearer Token)',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('Permissions', 'จัดการสิทธิ์เมนู (Client Menu Permissions & Admin Matrix)')
    .addTag('Projects', 'จัดการข้อมูลโปรเจกต์ (Projects CRUD)')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const port = process.env.PORT || 4001;
  await app.listen(port);

  logger.log(`=======================================================`);
  logger.log(`  🚀 LES API Gateway is running on: http://localhost:${port}`);
  logger.log(`  📚 Swagger Documentation:        http://localhost:${port}/api/docs`);
  logger.log(`=======================================================`);
}

bootstrap();
