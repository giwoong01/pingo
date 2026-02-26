import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type AuthContext = {
  userId: string;
  email: string;
  workspaceId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
};

export const CurrentAuth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthContext | null => {
  const req = ctx.switchToHttp().getRequest();
  return (req.auth || null) as AuthContext | null;
});

export const CurrentWorkspaceId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest();
  return String(req.auth?.workspaceId || '');
});
