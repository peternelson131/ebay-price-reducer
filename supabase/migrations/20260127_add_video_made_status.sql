-- Add "video made" status as a system default
-- Migration: 20260127_add_video_made_status
-- Context: The Video Made tab was added to the Product CRM, but the status didn't exist in the database

INSERT INTO crm_statuses (user_id, name, color, sort_order, auto_set_on_delivery)
VALUES (NULL, 'video made', '#F97316', 7, false)
ON CONFLICT (user_id, name) DO NOTHING;

-- Comment
COMMENT ON TABLE crm_statuses IS 'CRM statuses for product tracking. System defaults have user_id = NULL';
