import { redirect } from "next/navigation";
import { getDefaultSurveyId } from "@/lib/survey.config";

export default function Home() {
  redirect(`/survey/${getDefaultSurveyId()}`);
}
