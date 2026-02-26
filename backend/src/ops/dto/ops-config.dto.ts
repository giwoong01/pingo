export type OpsConfigExportBundle = {
  version: string;
  exportedAt: string;
  workspaceId: string;
  data: {
    clusters: any[];
    apps: any[];
    instances: any[];
    webhooks: any[];
    rules: any[];
    notificationRoutes: any[];
    notificationSilences: any[];
  };
};

export type ImportOpsConfigDto = {
  bundle?: OpsConfigExportBundle;
  data?: OpsConfigExportBundle['data'];
  dryRun?: boolean;
};

