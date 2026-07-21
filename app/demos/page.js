import { redirect } from "next/navigation";

export const metadata = {
  title: "RegimeAlpha · 完整方案"
};

export default function DemoIndexPage() {
  redirect("/demos/merged/");
}
