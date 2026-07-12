-- DropTable
DROP TABLE "delivery_assurance_actions";

-- DropTable
DROP TABLE "delivery_assurance_cases";

-- DropEnum
DROP TYPE "DeliveryAssuranceActionType";

-- DropEnum
DROP TYPE "DeliveryAssuranceIssueType";

-- DropEnum
DROP TYPE "DeliveryAssuranceCaseStatus";

-- Remove delivery-case ticket links before narrowing the enum.
DELETE FROM "ticket_object_links" WHERE "object_type" = 'delivery_case';

-- AlterEnum
ALTER TYPE "TicketObjectLinkType" RENAME TO "TicketObjectLinkType_old";
CREATE TYPE "TicketObjectLinkType" AS ENUM (
  'recharge_record',
  'order_operation_case',
  'instance',
  'host',
  'sla_alert',
  'plugin_task'
);
ALTER TABLE "ticket_object_links"
  ALTER COLUMN "object_type" TYPE "TicketObjectLinkType"
  USING ("object_type"::text::"TicketObjectLinkType");
DROP TYPE "TicketObjectLinkType_old";
