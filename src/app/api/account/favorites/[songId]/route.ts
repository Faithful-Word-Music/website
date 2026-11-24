import { setFavoriteResponse } from "../handlers";

/** Sets one song to an explicit saved or not-saved state. There is deliberately no toggle. */
export async function PUT(request: Request, { params }: { params: Promise<{ songId: string }> }) {
  const { songId } = await params;
  return setFavoriteResponse(request, songId);
}
