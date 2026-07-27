-- Support messages raised through the AI help chat rather than the form.
--
-- The chat collects the complaint or suggestion in the member's own words and
-- files it with an AI-written brief: what they are reporting, how urgent it
-- looks, and what to do about it. The member's own words stay in `message` —
-- the brief never replaces them, it only sits beside them.
ALTER TABLE support_messages ADD COLUMN channel TEXT NOT NULL DEFAULT 'form';
ALTER TABLE support_messages ADD COLUMN ai_brief TEXT;
ALTER TABLE support_messages ADD COLUMN category TEXT;
ALTER TABLE support_messages ADD COLUMN severity TEXT;

CREATE INDEX IF NOT EXISTS idx_support_messages_channel
  ON support_messages (channel, created_at DESC);
