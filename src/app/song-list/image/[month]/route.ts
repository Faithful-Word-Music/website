import { siteConfig } from "@/config/site";
import { getSongList } from "@/lib/google-sheets";
import { renderServicePicture } from "@/lib/service-picture";
import { MAX_SHARED_SERVICES } from "@/lib/share-services";
import { monthSlug } from "@/lib/song-list-pdf";

/**
 * Chosen services as a PNG, for sharing: /song-list/image/september?s=0-1,1-1
 * (service ids, as the page knows them). Drawn by renderServicePicture().
 *
 * Built on request from the sheet, like the PDF, so it is as current as the
 * page; cached at the CDN for siteConfig.songList.revalidateSeconds.
 */
export async function GET(request: Request, ctx: RouteContext<"/song-list/image/[month]">) {
  const { month: slug } = await ctx.params;
  const ids = (new URL(request.url).searchParams.get("s") ?? "")
    .split(",")
    .filter(Boolean)
    .slice(0, MAX_SHARED_SERVICES);
  const result = await getSongList();

  if (!result.ok) {
    return new Response("The song list is unavailable right now.", { status: 503 });
  }

  const month = result.months.find((item) => monthSlug(item.title) === slug);
  const services = month ? month.services.filter((service) => ids.includes(service.id)) : [];
  if (services.length === 0) {
    return new Response("No such services.", { status: 404 });
  }

  const picture = await renderServicePicture(services);
  const seconds = siteConfig.songList.revalidateSeconds;
  picture.headers.set(
    "Cache-Control",
    `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${seconds * 6}`,
  );
  return picture;
}
