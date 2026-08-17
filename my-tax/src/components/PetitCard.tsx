import Link from "next/link";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  List,
  ListItem,
  Text,
} from "moduix";
import type { PetitSummary } from "@/lib/types";

export function PetitCard({
  petit,
  href,
}: {
  petit: PetitSummary;
  href?: string;
}) {
  const card = (
    <Card size="sm" className="h-full !bg-[var(--cream-1)] !border-[var(--line)]">
      <CardHeader>
        <Badge variant="secondary">สรุปพิทเทิ้ล</Badge>
        <CardTitle as="h3">{petit.headline}</CardTitle>
        <CardDescription>ติดตามต่อไป: {petit.trackNext}</CardDescription>
      </CardHeader>
      <CardContent>
        <List size="sm" tone="muted">
          {petit.bullets.map((b) => (
            <ListItem key={b}>
              <Text size="sm" tone="muted">
                {b}
              </Text>
            </ListItem>
          ))}
        </List>
      </CardContent>
    </Card>
  );

  if (!href) return card;
  return (
    <Link href={href} className="block h-full">
      {card}
    </Link>
  );
}
