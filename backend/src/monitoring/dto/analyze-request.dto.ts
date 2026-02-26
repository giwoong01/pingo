import { IsNumber, IsNotEmpty } from 'class-validator';

export class AnalyzeRequestDto {
  @IsNumber()
  @IsNotEmpty()
  currentValue: number;

  @IsNumber()
  @IsNotEmpty()
  threshold: number;
}