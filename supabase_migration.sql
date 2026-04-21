-- ═══════════════════════════════════════════════════════════════════════════
-- EmpregaFácil — Migração do Banco de Dados (Supabase / PostgreSQL)
-- Execute este script no SQL Editor do Supabase Dashboard
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. TABELA: jobs (pedidos de serviço e vagas) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  description   text NOT NULL,
  category      text NOT NULL,
  budget        text,
  bairro        text,
  city          text DEFAULT 'Saquarema',
  type          text NOT NULL DEFAULT 'SERVICE_REQUEST',
  company_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_name  text NOT NULL,
  status        text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'CLOSED')),
  views         integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── 2. TABELA: proposals (propostas enviadas por profissionais) ────────────
CREATE TABLE IF NOT EXISTS public.proposals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id            uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  candidate_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  candidate_name    text NOT NULL,
  candidate_rating  numeric(3,1) NOT NULL DEFAULT 0,
  price             text NOT NULL,
  message           text NOT NULL,
  status            text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, candidate_id)  -- um profissional só pode enviar uma proposta por job
);

-- ── 3. TABELA: reviews (avaliações de profissionais) ──────────────────────
CREATE TABLE IF NOT EXISTS public.reviews (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reviewer_name  text NOT NULL,
  reviewer_role  text,
  target_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_name    text NOT NULL,
  job_id         uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  job_title      text DEFAULT 'Avaliação geral',
  rating         numeric(2,1) NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment        text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── 4. TABELA: messages (mensagens entre usuários) ────────────────────────
CREATE TABLE IF NOT EXISTS public.messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sender_name  text NOT NULL,
  receiver_id  uuid,  -- 0/null = broadcast/suporte
  job_id       uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  text         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── 5. COLUNAS EXTRAS na tabela profiles (se ainda não existirem) ─────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS rating       numeric(3,1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_count integer      DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_jobs integer    DEFAULT 0,
  ADD COLUMN IF NOT EXISTS response_time text        DEFAULT '—',
  ADD COLUMN IF NOT EXISTS portfolio    jsonb        DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS member_since text,
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS bairro       text,
  ADD COLUMN IF NOT EXISTS categories   text[]       DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS verified     boolean      DEFAULT false;

-- ── 6. FUNÇÃO para recalcular rating após nova review ─────────────────────
CREATE OR REPLACE FUNCTION update_profile_rating(p_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.profiles
  SET
    rating       = COALESCE((SELECT ROUND(AVG(rating)::numeric, 1) FROM public.reviews WHERE target_id = p_id), 0),
    review_count = (SELECT COUNT(*) FROM public.reviews WHERE target_id = p_id)
  WHERE id = p_id;
END;
$$;

-- ── 7. ROW LEVEL SECURITY (RLS) ───────────────────────────────────────────

-- jobs: leitura pública, escrita autenticada
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "jobs_select_public"  ON public.jobs;
DROP POLICY IF EXISTS "jobs_insert_auth"    ON public.jobs;
DROP POLICY IF EXISTS "jobs_update_owner"   ON public.jobs;
DROP POLICY IF EXISTS "jobs_delete_owner"   ON public.jobs;
CREATE POLICY "jobs_select_public"  ON public.jobs FOR SELECT USING (true);
CREATE POLICY "jobs_insert_auth"    ON public.jobs FOR INSERT WITH CHECK (auth.uid() = company_id);
CREATE POLICY "jobs_update_owner"   ON public.jobs FOR UPDATE USING (auth.uid() = company_id);
CREATE POLICY "jobs_delete_owner"   ON public.jobs FOR DELETE USING (auth.uid() = company_id);

-- proposals: leitura pública, escrita autenticada
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "proposals_select_public"    ON public.proposals;
DROP POLICY IF EXISTS "proposals_insert_candidate" ON public.proposals;
DROP POLICY IF EXISTS "proposals_update_owner"     ON public.proposals;
CREATE POLICY "proposals_select_public"    ON public.proposals FOR SELECT USING (true);
CREATE POLICY "proposals_insert_candidate" ON public.proposals FOR INSERT WITH CHECK (auth.uid() = candidate_id);
CREATE POLICY "proposals_update_owner"     ON public.proposals FOR UPDATE USING (
  -- quem pode atualizar: o dono da job (para aceitar/rejeitar) ou o candidato
  auth.uid() = candidate_id
  OR auth.uid() IN (SELECT company_id FROM public.jobs WHERE id = job_id)
);

-- reviews: leitura pública, escrita autenticada
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reviews_select_public"  ON public.reviews;
DROP POLICY IF EXISTS "reviews_insert_auth"    ON public.reviews;
CREATE POLICY "reviews_select_public"  ON public.reviews FOR SELECT USING (true);
CREATE POLICY "reviews_insert_auth"    ON public.reviews FOR INSERT WITH CHECK (auth.uid() = reviewer_id);

-- messages: só o remetente ou destinatário pode ler/escrever
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "messages_select_participant" ON public.messages;
DROP POLICY IF EXISTS "messages_insert_auth"        ON public.messages;
CREATE POLICY "messages_select_participant" ON public.messages FOR SELECT USING (
  auth.uid() = sender_id OR auth.uid() = receiver_id OR receiver_id IS NULL
);
CREATE POLICY "messages_insert_auth" ON public.messages FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- ── 8. ÍNDICES para performance ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_jobs_status      ON public.jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_company_id  ON public.jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_jobs_category    ON public.jobs(category);
CREATE INDEX IF NOT EXISTS idx_proposals_job_id ON public.proposals(job_id);
CREATE INDEX IF NOT EXISTS idx_proposals_cand   ON public.proposals(candidate_id);
CREATE INDEX IF NOT EXISTS idx_reviews_target   ON public.reviews(target_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender  ON public.messages(sender_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- FIM DA MIGRAÇÃO
-- ═══════════════════════════════════════════════════════════════════════════
