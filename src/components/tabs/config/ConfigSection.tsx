import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

export default function ConfigSection({
  title,
  icon: Icon,
  description,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          {Icon && <Icon className="size-[1.1em] text-primary" />}
          {title}
        </CardTitle>
        {description && <CardDescription className="text-[13px]">{description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}
