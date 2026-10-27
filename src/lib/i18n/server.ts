import "server-only";
import { cookies, headers } from "next/headers";
import { isLocale, LOCALE_COOKIE, type Locale, negotiateLocale } from "./config";
import { DICTIONARIES } from "./dictionaries";

/** The visitor's locale: their explicit choice (cookie), else their browser's preference. */
export async function getLocale(): Promise<Locale> {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;
  return negotiateLocale((await headers()).get("accept-language"));
}

export async function getT() {
  const locale = await getLocale();
  return { locale, t: DICTIONARIES[locale] };
}
