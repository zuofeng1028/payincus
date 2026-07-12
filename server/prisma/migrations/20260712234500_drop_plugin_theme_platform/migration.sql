-- ⚠️ 部署前须先迁移/停用 prod 中 type='plugin_gateway' 的支付渠道行,否则充值/退款校验失败

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "payment_providers"
    WHERE "type"::text = 'plugin_gateway'
  ) THEN
    RAISE EXCEPTION 'plugin_gateway payment provider rows must be migrated or removed before this migration';
  END IF;
END $$;

DELETE FROM "ticket_object_links"
WHERE "object_type"::text = 'plugin_task';

DROP TABLE IF EXISTS "plugin_licenses";
DROP TABLE IF EXISTS "plugin_refunds";
DROP TABLE IF EXISTS "plugin_developer_earnings";
DROP TABLE IF EXISTS "plugin_purchases";
DROP TABLE IF EXISTS "plugin_developer_withdrawals";
DROP TABLE IF EXISTS "public_plugin_action_rate_limit_buckets";
DROP TABLE IF EXISTS "public_plugin_action_rate_limit_policies";
DROP TABLE IF EXISTS "plugin_storage_backup_remote_archives";
DROP TABLE IF EXISTS "plugin_capability_reviews";
DROP TABLE IF EXISTS "plugin_versions";
DROP TABLE IF EXISTS "plugin_install_tasks";
DROP TABLE IF EXISTS "plugin_configs";
DROP TABLE IF EXISTS "plugin_event_logs";
DROP TABLE IF EXISTS "plugin_event_dedupe_locks";
DROP TABLE IF EXISTS "plugin_event_alert_preferences";
DROP TABLE IF EXISTS "plugin_user_data";
DROP TABLE IF EXISTS "plugin_storage_items";
DROP TABLE IF EXISTS "plugin_table_rows";
DROP TABLE IF EXISTS "plugin_table_migrations";
DROP TABLE IF EXISTS "plugin_market_submissions";
DROP TABLE IF EXISTS "plugin_market_sources";
DROP TABLE IF EXISTS "theme_market_submissions";
DROP TABLE IF EXISTS "theme_packages";
DROP TABLE IF EXISTS "plugins";

ALTER TYPE "PaymentProviderType" RENAME TO "PaymentProviderType_old";
CREATE TYPE "PaymentProviderType" AS ENUM (
  'yipay',
  'heleket',
  'antom',
  'stripe',
  'alipay_direct',
  'wechat_direct',
  'manual'
);
ALTER TABLE "payment_providers"
  ALTER COLUMN "type" TYPE "PaymentProviderType"
  USING ("type"::text::"PaymentProviderType");
DROP TYPE "PaymentProviderType_old";

ALTER TYPE "TicketObjectLinkType" RENAME TO "TicketObjectLinkType_old";
CREATE TYPE "TicketObjectLinkType" AS ENUM (
  'recharge_record',
  'order_operation_case',
  'instance',
  'host',
  'sla_alert'
);
ALTER TABLE "ticket_object_links"
  ALTER COLUMN "object_type" TYPE "TicketObjectLinkType"
  USING ("object_type"::text::"TicketObjectLinkType");
DROP TYPE "TicketObjectLinkType_old";

DROP TYPE IF EXISTS "PluginStatus";
DROP TYPE IF EXISTS "PluginInstallTaskStatus";
DROP TYPE IF EXISTS "PluginInstallTaskAction";
DROP TYPE IF EXISTS "PluginSourceType";
DROP TYPE IF EXISTS "PluginPurchaseStatus";
DROP TYPE IF EXISTS "PluginLicenseStatus";
DROP TYPE IF EXISTS "PluginRefundStatus";
DROP TYPE IF EXISTS "PluginDeveloperEarningStatus";
DROP TYPE IF EXISTS "PluginDeveloperWithdrawalStatus";
