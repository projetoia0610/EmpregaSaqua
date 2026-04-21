-- ═══════════════════════════════════════════════════════════════════════════
-- EmpregaFácil — Migração v2: Sistema de Perfil + Portfólio
-- Execute no SQL Editor do Supabase Dashboard (Dashboard → SQL Editor)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Coluna avatar_url na tabela profiles ────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- ── 2. TABELA: portfolio_posts (publicações do portfólio) ─────────────────
CREATE TABLE IF NOT EXISTS public.portfolio_posts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title             text NOT NULL,
  description       text,
  image_url         text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ── 3. RLS para portfolio_posts ────────────────────────────────────────────
ALTER TABLE public.portfolio_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portfolio_select_public"    ON public.portfolio_posts;
DROP POLICY IF EXISTS "portfolio_insert_owner"     ON public.portfolio_posts;
DROP POLICY IF EXISTS "portfolio_delete_owner"     ON public.portfolio_posts;

-- Qualquer um pode ver o portfólio
CREATE POLICY "portfolio_select_public"
  ON public.portfolio_posts FOR SELECT USING (true);

-- Só o próprio profissional pode criar publicações
CREATE POLICY "portfolio_insert_owner"
  ON public.portfolio_posts FOR INSERT
  WITH CHECK (auth.uid() = professional_id);

-- Só o próprio profissional pode remover suas publicações
CREATE POLICY "portfolio_delete_owner"
  ON public.portfolio_posts FOR DELETE
  USING (auth.uid() = professional_id);

-- ── 4. Índice de performance ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_portfolio_professional
  ON public.portfolio_posts(professional_id);

CREATE INDEX IF NOT EXISTS idx_portfolio_created
  ON public.portfolio_posts(created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- STORAGE — Execute via Dashboard → Storage → Create Bucket
-- (O SQL abaixo usa a API interna do Supabase; pode precisar criar manualmente)
-- ═══════════════════════════════════════════════════════════════════════════

-- Bucket para avatares (fotos de perfil)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars', 'avatars', true,
  5242880,  -- 5 MB
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Bucket para imagens do portfólio
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'portfolio', 'portfolio', true,
  10485760,  -- 10 MB
  ARRAY['image/jpeg','image/png','image/webp','image/gif','image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- ── Políticas de Storage: avatars ─────────────────────────────────────────
DROP POLICY IF EXISTS "avatars_select_public"   ON storage.objects;
DROP POLICY IF EXISTS "avatars_insert_auth"     ON storage.objects;
DROP POLICY IF EXISTS "avatars_update_owner"    ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete_owner"    ON storage.objects;

CREATE POLICY "avatars_select_public"
  ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "avatars_insert_auth"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "avatars_update_owner"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "avatars_delete_owner"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ── Políticas de Storage: portfolio ───────────────────────────────────────
DROP POLICY IF EXISTS "portfolio_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "portfolio_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "portfolio_storage_delete" ON storage.objects;

CREATE POLICY "portfolio_storage_select"
  ON storage.objects FOR SELECT USING (bucket_id = 'portfolio');

CREATE POLICY "portfolio_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'portfolio' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "portfolio_storage_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'portfolio' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ═══════════════════════════════════════════════════════════════════════════
-- FIM DA MIGRAÇÃO v2
-- ═══════════════════════════════════════════════════════════════════════════
