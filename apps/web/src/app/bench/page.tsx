import { redirect } from "next/navigation";
import { DEFAULT_RUN_HREF } from "@modeldesk/shared/nav";

/** Legacy hub — send users straight into the first run page. */
export default function BenchHubPage() {
  redirect(DEFAULT_RUN_HREF);
}
