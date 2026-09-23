import type { Metadata } from "next";
import { UncleGame } from "./UncleGame";

export const metadata: Metadata = {
  title: "UNCLE SMASH",
  description: "出てきた瞬間にハンマーでスマッシュ!",
};

export default function PeekPage() {
  return <UncleGame />;
}
