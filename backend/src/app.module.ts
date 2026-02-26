import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MonitoringModule } from './monitoring/monitoring.module';
import { OpsModule } from './ops/ops.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        '.env',
        '.env.monitoring',
        'apps/backend/.env',
        'apps/backend/.env.monitoring',
        '../../.env',
        '../../.env.monitoring',
      ],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USERNAME', 'postgres'),
        password: config.get<string>('DB_PASSWORD', 'postgres'),
        database: config.get<string>('DB_NAME', 'monitoring'),
        entities: [__dirname + '/**/*.entity.{ts,js}'],
        migrations: [__dirname + '/database/migrations/*.{ts,js}'],
        migrationsRun: true,
        synchronize: false,
      }),
    }),
    AuthModule,
    MonitoringModule,
    OpsModule,
  ],
})
export class AppModule {}
