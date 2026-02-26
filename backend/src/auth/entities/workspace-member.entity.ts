import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity';
import { Workspace } from './workspace.entity';

export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MEMBER';

@Entity({ name: 'workspace_members' })
@Index(['workspaceId', 'userId'], { unique: true })
export class WorkspaceMember {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  workspace!: Workspace;

  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user!: User;

  @Column({ type: 'varchar', length: 16, default: 'MEMBER' })
  role!: WorkspaceRole;

  @CreateDateColumn()
  createdAt!: Date;
}
