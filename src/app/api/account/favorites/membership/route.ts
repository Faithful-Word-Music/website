import { membershipResponse } from "../handlers";

/** Which of a bounded batch of songs the signed-in member has saved. */
export function POST(request: Request) {
  return membershipResponse(request);
}
