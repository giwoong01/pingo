import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Workspace } from './workspace.entity';
import { WorkspaceRole } from './workspace-member.entity';

@Entity({ name: 'workspace_invites' })
@Index(['token'], { unique: true })
export class WorkspaceInvite {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  workspace!: Workspace;

  @Column({ type: 'varchar', length: 16, default: 'MEMBER' })
  role!: WorkspaceRole;

  @Column({ type: 'varchar', length: 240, nullable: true })
  invitedEmail!: string | null;

  @Column({ type: 'varchar', length: 180 })
  token!: string;

  @Column({ type: 'uuid' })
  createdByUserId!: string;

  @Column({ type: 'uuid', nullable: true })
  acceptedByUserId!: string | null;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  acceptedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;
}
