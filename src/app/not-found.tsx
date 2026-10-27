import { LinkButton } from "@/components/ui/button";
import { OrbField } from "@/components/ui/orb";
import { getT } from "@/lib/i18n/server";

export default async function NotFound() {
  const { t } = await getT();
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4">
      <OrbField variant="quiet" />
      <div className="relative text-center">
        <p className="text-caption-upper text-muted">404</p>
        <h1 className="mt-3 text-display-md">{t.notFound.title}</h1>
        <p className="mt-3 text-body-md text-body">{t.notFound.lead}</p>
        <LinkButton href="/" className="mt-6">
          {t.notFound.back}
        </LinkButton>
      </div>
    </div>
  );
}
