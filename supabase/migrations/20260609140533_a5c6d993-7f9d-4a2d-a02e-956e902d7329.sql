
CREATE TABLE public.message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_reactions TO authenticated;
GRANT ALL ON public.message_reactions TO service_role;

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View reactions on visible messages" ON public.message_reactions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_reactions.message_id
      AND (auth.uid() = m.sender_id OR auth.uid() = m.recipient_id)
  ));

CREATE POLICY "Add own reaction" ON public.message_reactions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_reactions.message_id
      AND (auth.uid() = m.sender_id OR auth.uid() = m.recipient_id)
  ));

CREATE POLICY "Remove own reaction" ON public.message_reactions
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_reactions_message ON public.message_reactions (message_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;
