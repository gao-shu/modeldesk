import { redirect } from "next/navigation";
import { DEFAULT_RUN_HREF } from "@modeldesk/shared/nav";

/** Default entry: text run */
export default function HomePage() {
  redirect(DEFAULT_RUN_HREF);
}
