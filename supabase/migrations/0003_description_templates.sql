CREATE TABLE public.description_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 80),
  summary text CHECK (summary IS NULL OR char_length(summary) <= 200),
  instructions text NOT NULL CHECK (char_length(btrim(instructions)) BETWEEN 10 AND 3000),
  target_length text NOT NULL DEFAULT 'medium' CHECK (target_length IN ('short','medium','long')),
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.description_templates TO authenticated;
GRANT ALL ON public.description_templates TO service_role;

ALTER TABLE public.description_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read description templates" ON public.description_templates
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins insert description templates" ON public.description_templates
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admins update description templates" ON public.description_templates
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins delete description templates" ON public.description_templates
  FOR DELETE TO authenticated USING (public.is_admin());

CREATE TRIGGER description_templates_updated_at BEFORE UPDATE ON public.description_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER description_templates_audit AFTER INSERT OR UPDATE OR DELETE ON public.description_templates
  FOR EACH ROW EXECUTE FUNCTION public.audit_row();


-- Seed rows for description_templates live in 0006_seed_demo_catalog.sql.
