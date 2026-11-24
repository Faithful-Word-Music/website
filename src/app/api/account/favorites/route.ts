import { listFavoritesResponse } from "./handlers";

/** The signed-in member's Favorites: searched, sorted and paged across the whole collection. */
export function GET(request: Request) {
  return listFavoritesResponse(request);
}
