import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }));

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3002);
  const frontendPort = configService.get<number>('FRONTEND_PORT', 3001);

  app.enableCors({
    origin: [`http://localhost:${port}`, `http://localhost:${frontendPort}`],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
  });

  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
}
bootstrap();