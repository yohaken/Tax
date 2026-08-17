import { FilingsHome } from "@/components/FilingsHome";

type Props = {
  searchParams?: Promise<{ year?: string; agent?: string }>;
};

export default function FilingsPage({ searchParams }: Props) {
  return <FilingsHome searchParams={searchParams} />;
}
