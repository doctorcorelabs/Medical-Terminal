-- supabase_fornas_setup.sql
-- Run this in the Supabase SQL Editor (or via psql) BEFORE upsert-to-supabase.js
-- ──────────────────────────────────────────────────────────────────────────────
-- Table: public.fornas_drugs
-- Stores the national drug formulary (Formularium Nasional / Fornas)
-- fetched from e-fornas.kemkes.go.id
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fornas_drugs (
    id              SERIAL PRIMARY KEY,

    -- ── Identity ─────────────────────────────────────────────────────────────
    -- Drug ID from e-fornas API (_id_obat); one drug can have many sediaan rows
    source_id       TEXT NOT NULL,

    -- Unique ID per drug-sediaan combination from obatsks endpoint (_id)
    sks_id          INTEGER UNIQUE,

    -- Drug name in Indonesian
    name            TEXT NOT NULL,

    -- International nonproprietary name (INN / English)
    name_international TEXT,

    -- Composite label, e.g. "abakavir - TABLET 300 MILIGRAM"
    label           TEXT,

    -- ── Dosage form ───────────────────────────────────────────────────────────
    -- Form code, e.g. TA01  (from _kode_sediaan)
    form_code       TEXT,

    -- Human-readable form, e.g. TABLET, INJEKSI, SIRUP
    form            TEXT,

    -- Numeric strength / concentration value, e.g. "300", "100"
    strength        TEXT,

    -- Unit code, e.g. U028  (from _kode_satuan)
    unit_code       TEXT,

    -- Human-readable unit, e.g. MILIGRAM, MILIGRAM / MILILITER
    unit            TEXT,

    -- ── Therapeutic classification (4-level hierarchy) ────────────────────────
    category_l1     TEXT,   -- e.g. ANTIINFEKSI
    category_l2     TEXT,   -- e.g. ANTIVIRUS
    category_l3     TEXT,   -- e.g. Antiretroviral
    category_l4     TEXT,   -- e.g. Nucleoside Reverse Transcriptase Inhibitor

    -- ── Restrictions ─────────────────────────────────────────────────────────
    restriction_drug TEXT,   -- restriksi at drug level
    restriction_form TEXT,   -- restriksi at sediaan level
    restriction_note_l1 TEXT,
    restriction_note_l2 TEXT,
    restriction_note_l3 TEXT,
    restriction_note_l4 TEXT,
    max_prescription TEXT,   -- _peresepan_maksimal
    komposisi        TEXT,   -- composition note

    -- ── Boolean flags ────────────────────────────────────────────────────────
    flag_fpktl      BOOLEAN,  -- Formularium Primer Tingkat Lanjutan
    flag_fpktp      BOOLEAN,  -- Formularium Primer Tingkat Pertama
    flag_pp         BOOLEAN,  -- Program Pemerintah
    flag_prb        BOOLEAN,  -- Program Rujuk Balik
    flag_oen        BOOLEAN,  -- Obat Esensial Nasional
    flag_program    BOOLEAN,  -- Drug is part of a government program
    flag_kanker     BOOLEAN,  -- Oncology drug

    -- ── Audit ────────────────────────────────────────────────────────────────
    -- Full raw JSON from the API — preserved for re-normalization without re-fetching
    raw             JSONB,

    -- Timestamps
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    -- Compound unique: same drug cannot appear twice with same sediaan+kekuatan
    UNIQUE (source_id, form_code, strength, unit_code)
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

-- Primary lookup: case-insensitive name search
CREATE INDEX IF NOT EXISTS fornas_drugs_name_idx
    ON public.fornas_drugs (lower(name));

-- Full-text search on name (autocomplete)
CREATE INDEX IF NOT EXISTS fornas_drugs_name_fts_idx
    ON public.fornas_drugs USING GIN (to_tsvector('indonesian', coalesce(name, '') || ' ' || coalesce(name_international, '')));

-- Lookup by therapeutic class
CREATE INDEX IF NOT EXISTS fornas_drugs_category_l1_idx
    ON public.fornas_drugs (lower(category_l1));

CREATE INDEX IF NOT EXISTS fornas_drugs_category_l2_idx
    ON public.fornas_drugs (lower(category_l2));

-- Lookup by source_id (drug-level grouping)
CREATE INDEX IF NOT EXISTS fornas_drugs_source_id_idx
    ON public.fornas_drugs (source_id);

-- Filter by flags
CREATE INDEX IF NOT EXISTS fornas_drugs_flags_idx
    ON public.fornas_drugs (flag_oen, flag_fpktl, flag_kanker);

-- GIN on raw for flexible JSON queries
CREATE INDEX IF NOT EXISTS fornas_drugs_raw_idx
    ON public.fornas_drugs USING GIN (raw);

-- ── Auto-update `updated_at` ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fornas_drugs_set_updated_at ON public.fornas_drugs;
CREATE TRIGGER fornas_drugs_set_updated_at
    BEFORE UPDATE ON public.fornas_drugs
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.fornas_drugs ENABLE ROW LEVEL SECURITY;

-- Public read access — anyone (authenticated or anon) can search drugs
CREATE POLICY "fornas_drugs_select_public"
    ON public.fornas_drugs
    FOR SELECT
    USING (true);

-- Only service-role (backend script) can insert/update/delete
-- The upsert-to-supabase.js script must use SUPABASE_SERVICE_ROLE_KEY, not anon key.
CREATE POLICY "fornas_drugs_insert_service"
    ON public.fornas_drugs
    FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "fornas_drugs_update_service"
    ON public.fornas_drugs
    FOR UPDATE
    USING (auth.role() = 'service_role');

CREATE POLICY "fornas_drugs_delete_service"
    ON public.fornas_drugs
    FOR DELETE
    USING (auth.role() = 'service_role');

-- ── Helpful views ──────────────────────────────────────────────────────────────

-- Quick stats view
CREATE OR REPLACE VIEW public.fornas_drugs_stats AS
SELECT
    COUNT(*)                                          AS total_variants,
    COUNT(DISTINCT source_id)                         AS total_drugs,
    COUNT(DISTINCT form)                              AS distinct_forms,
    COUNT(DISTINCT category_l1)                       AS distinct_l1_categories,
    COUNT(CASE WHEN flag_oen     THEN 1 END)          AS oen_drugs,
    COUNT(CASE WHEN flag_fpktl   THEN 1 END)          AS fpktl_drugs,
    COUNT(CASE WHEN flag_kanker  THEN 1 END)          AS kanker_drugs,
    COUNT(CASE WHEN flag_prb     THEN 1 END)          AS prb_drugs,
    MAX(updated_at)                                   AS last_updated
FROM public.fornas_drugs;

-- ── Comments ──────────────────────────────────────────────────────────────────

COMMENT ON TABLE  public.fornas_drugs IS 'National Drug Formulary (Fornas) — sourced from e-fornas.kemkes.go.id. One row per drug-sediaan-kekuatan combination.';
COMMENT ON COLUMN public.fornas_drugs.source_id         IS '_id_obat from e-fornas API — groups all sediaan variants of one drug';
COMMENT ON COLUMN public.fornas_drugs.sks_id            IS 'obatsks._id — unique per drug-sediaan-kekuatan combination; used as upsert key';
COMMENT ON COLUMN public.fornas_drugs.raw               IS 'Full merged raw record (byidobat + obatsks) — preserved for re-normalization';
COMMENT ON COLUMN public.fornas_drugs.flag_fpktl        IS 'true = included in Formularium Primer Tingkat Lanjutan';
COMMENT ON COLUMN public.fornas_drugs.flag_fpktp        IS 'true = included in Formularium Primer Tingkat Pertama';
COMMENT ON COLUMN public.fornas_drugs.flag_oen          IS 'true = Obat Esensial Nasional';
COMMENT ON COLUMN public.fornas_drugs.flag_prb          IS 'true = Program Rujuk Balik';
COMMENT ON COLUMN public.fornas_drugs.flag_kanker       IS 'true = listed as oncology drug';
