-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CLIENT_ADMIN', 'ADMIN_3SC', 'DELIVERY_USER');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('BRD', 'SOW', 'TECHNICAL_SPEC', 'USER_MANUAL', 'CONTRACT', 'OTHER');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "tenant_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "category" TEXT,
    "tags" TEXT[],
    "assignee_id" TEXT,
    "requester_id" TEXT NOT NULL,
    "embedding" vector(1536),
    "ai_triage" JSONB,
    "ai_summary" TEXT,
    "sla_deadline" TIMESTAMP(3),
    "sla_paused_at" TIMESTAMP(3),
    "sla_paused_reason" TEXT,
    "acknowledged_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "time_to_acknowledge" INTEGER,
    "time_to_resolve" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "similar_tickets" JSONB,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536),
    "visibility" TEXT NOT NULL DEFAULT 'public',
    "parent_id" TEXT,
    "is_ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "ai_model" TEXT,
    "attachments" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "document_type" "DocumentType" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "parsed_content" TEXT,
    "summary" TEXT,
    "uploaded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_sections" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "section_path" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536),
    "requirements" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_ticket_links" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "linked_by" TEXT NOT NULL,
    "linkType" TEXT NOT NULL DEFAULT 'reference',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_ticket_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "copilot_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "context" JSONB NOT NULL DEFAULT '{}',
    "messages" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "copilot_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_sessions" (
    "id" TEXT NOT NULL,
    "customer_email" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "messages" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "deflection_count" INTEGER NOT NULL DEFAULT 0,
    "ticket_created" BOOLEAN NOT NULL DEFAULT false,
    "ticket_id" TEXT,
    "rating" INTEGER,
    "feedback" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurrent_patterns" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "pattern_name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "root_cause" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "ticket_ids" TEXT[],
    "frequency_30d" INTEGER NOT NULL,
    "trend" TEXT NOT NULL,
    "suggested_fix" TEXT,
    "cluster_center" vector(1536),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurrent_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "open_points" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "assigned_dl" TEXT,
    "client_poc" TEXT,
    "start_date" TIMESTAMP(3),
    "due_date" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "estimated_hours" INTEGER,
    "actual_hours" INTEGER NOT NULL DEFAULT 0,
    "gantt_data" JSONB,
    "ai_risk_score" DOUBLE PRECISION,
    "linked_tickets" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "open_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_definitions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "data_source" TEXT NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "visualizations" JSONB NOT NULL DEFAULT '[]',
    "ai_narrative" TEXT,
    "is_shared" BOOLEAN NOT NULL DEFAULT false,
    "schedule" JSONB,
    "last_run_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "old_data" JSONB,
    "new_data" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_configs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "low_response" INTEGER NOT NULL DEFAULT 480,
    "medium_response" INTEGER NOT NULL DEFAULT 240,
    "high_response" INTEGER NOT NULL DEFAULT 60,
    "critical_response" INTEGER NOT NULL DEFAULT 15,
    "low_resolution" INTEGER NOT NULL DEFAULT 2880,
    "medium_resolution" INTEGER NOT NULL DEFAULT 1440,
    "high_resolution" INTEGER NOT NULL DEFAULT 480,
    "critical_resolution" INTEGER NOT NULL DEFAULT 240,
    "business_hours" JSONB NOT NULL DEFAULT '{"mon":[9,17],"tue":[9,17],"wed":[9,17],"thu":[9,17],"fri":[9,17]}',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "holidays" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sla_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_key" ON "sessions"("refresh_token");

-- CreateIndex
CREATE INDEX "tickets_tenant_id_idx" ON "tickets"("tenant_id");

-- CreateIndex
CREATE INDEX "tickets_status_idx" ON "tickets"("status");

-- CreateIndex
CREATE INDEX "tickets_assignee_id_idx" ON "tickets"("assignee_id");

-- CreateIndex
CREATE INDEX "tickets_created_at_idx" ON "tickets"("created_at");

-- CreateIndex
CREATE INDEX "messages_ticket_id_idx" ON "messages"("ticket_id");

-- CreateIndex
CREATE INDEX "messages_author_id_idx" ON "messages"("author_id");

-- CreateIndex
CREATE INDEX "messages_created_at_idx" ON "messages"("created_at");

-- CreateIndex
CREATE INDEX "documents_tenant_id_idx" ON "documents"("tenant_id");

-- CreateIndex
CREATE INDEX "documents_document_type_idx" ON "documents"("document_type");

-- CreateIndex
CREATE INDEX "document_sections_document_id_idx" ON "document_sections"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_ticket_links_document_id_ticket_id_key" ON "document_ticket_links"("document_id", "ticket_id");

-- CreateIndex
CREATE INDEX "copilot_sessions_user_id_idx" ON "copilot_sessions"("user_id");

-- CreateIndex
CREATE INDEX "assistant_sessions_tenant_id_idx" ON "assistant_sessions"("tenant_id");

-- CreateIndex
CREATE INDEX "assistant_sessions_customer_email_idx" ON "assistant_sessions"("customer_email");

-- CreateIndex
CREATE INDEX "recurrent_patterns_tenant_id_idx" ON "recurrent_patterns"("tenant_id");

-- CreateIndex
CREATE INDEX "recurrent_patterns_is_active_idx" ON "recurrent_patterns"("is_active");

-- CreateIndex
CREATE INDEX "open_points_tenant_id_idx" ON "open_points"("tenant_id");

-- CreateIndex
CREATE INDEX "open_points_project_id_idx" ON "open_points"("project_id");

-- CreateIndex
CREATE INDEX "open_points_status_idx" ON "open_points"("status");

-- CreateIndex
CREATE INDEX "report_definitions_user_id_idx" ON "report_definitions"("user_id");

-- CreateIndex
CREATE INDEX "report_definitions_tenant_id_idx" ON "report_definitions"("tenant_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sla_configs_tenant_id_key" ON "sla_configs"("tenant_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_sections" ADD CONSTRAINT "document_sections_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_ticket_links" ADD CONSTRAINT "document_ticket_links_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_ticket_links" ADD CONSTRAINT "document_ticket_links_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "copilot_sessions" ADD CONSTRAINT "copilot_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurrent_patterns" ADD CONSTRAINT "recurrent_patterns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "open_points" ADD CONSTRAINT "open_points_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_definitions" ADD CONSTRAINT "report_definitions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
