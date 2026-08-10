import { redirect } from "next/navigation";
import { DEFAULT_RUN_HREF } from "@modeldesk/shared/nav";

/** Legacy path → default modality desk. */
export default function LegacySingleRunPage() {
  redirect(DEFAULT_RUN_HREF);
}
